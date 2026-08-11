import type { ActionFunctionArgs } from "react-router";
import type { PackedParcel, PickupPoint } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { orderStatusEmail } from "~/services/email-templates.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";
import { getPickupPointById } from "~/services/pickup-points.server";
import { ShippoAmbiguousPurchaseError, createShippoLabel, ShippoLabelError } from "~/services/shippo-labels.server";
import { COLISSIMO_SERVICE_TOKENS, createColissimoRateForParcel, type ColissimoServiceToken, type ShippoAddress } from "~/services/shippo-shipping.server";

const SHIPPO_RATE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export function shippoRateNeedsRefresh(createdAt: string, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  return !Number.isFinite(created) || now - created >= SHIPPO_RATE_MAX_AGE_MS;
}

function isColissimoServiceToken(value: unknown): value is ColissimoServiceToken {
  return typeof value === "string" && (COLISSIMO_SERVICE_TOKENS as readonly string[]).includes(value);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (request.method !== "POST" || !params.id) return Response.json({ ok: false }, { status: 405 });
  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Database unavailable." }, { status: 503 });
  const { data: order } = await client.from("orders")
    .select("id,order_number,email,locale,status,paid_at,shipping_quote_id,shipping_rate_id")
    .eq("id", params.id).maybeSingle();
  if (!order || !order.paid_at || !["paid", "preparing", "ready_to_ship"].includes(order.status)) {
    return Response.json({ ok: false, message: "Order is not ready for label purchase." }, { status: 409 });
  }
  const { data: quote } = await client.from("shipping_quotes")
    .select("rates,address,lines,parcels,created_at")
    .eq("id", order.shipping_quote_id).single();
  const rate = (quote?.rates as any[])?.find((item) => item.id === order.shipping_rate_id);
  const parcels = quote?.parcels as PackedParcel[] | undefined;
  if (!rate || !quote?.address || !quote?.lines || !parcels) {
    return Response.json({ ok: false, message: "Shipping rate snapshot not found." }, { status: 409 });
  }

  const { data: existingRows } = await client.from("shipments")
    .select("id,parcel_index,label_provider,shippo_transaction_id,sendcloud_parcel_id,label_url,tracking_number,status")
    .eq("order_id", order.id);
  if ((existingRows ?? []).some((shipment) => shipment.label_provider === "sendcloud" || shipment.sendcloud_parcel_id)) {
    return Response.json({ ok: false, message: "Cette commande contient une ancienne expédition Sendcloud conservée en lecture seule. Aucune nouvelle action n’est disponible." }, { status: 409 });
  }

  if (env().SHIPPING_MOCK) {
    return Response.json({
      ok: true,
      demo: true,
      labels: parcels.map((_, index) => ({ parcel: index + 1, url: "about:blank", provider: "mock" })),
    });
  }
  if (rate.provider !== "shippo" || !isColissimoServiceToken(rate.serviceToken)) {
    return Response.json({ ok: false, message: "Ce devis ne contient pas un service Colissimo Shippo valide. Recalculez la livraison." }, { status: 409 });
  }

  let providerRateIds = rate.shippoRateIds as string[] | undefined;
  if (!Array.isArray(providerRateIds) || providerRateIds.length !== parcels.length || providerRateIds.some((id) => typeof id !== "string" || !id)) {
    return Response.json({ ok: false, message: "Ce devis ne contient pas les tarifs Shippo privés requis. Recalculez la livraison avant d’acheter les étiquettes." }, { status: 409 });
  }

  let pickupPoint = rate.pickupPoint as PickupPoint | undefined;
  const refreshed = shippoRateNeedsRefresh(quote.created_at);
  if (refreshed) {
    try {
      if (pickupPoint) {
        pickupPoint = await getPickupPointById({
          id: pickupPoint.id,
          locale: order.locale,
          countryCode: (quote.address as ShippoAddress).countryCode,
          weightGrams: Math.max(...parcels.map((parcel) => parcel.shippingWeightGrams)),
        });
      }
      const renewedRates = await Promise.all(parcels.map((parcel, index) => createColissimoRateForParcel({
        address: quote.address as ShippoAddress,
        parcel,
        pickupPoint,
        serviceToken: rate.serviceToken,
        reference: `${order.order_number}-${index + 1}`,
      })));
      providerRateIds = renewedRates.map((item) => item.rateId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return Response.json({ ok: false, message: `Le tarif Shippo de plus de sept jours n’a pas pu être renouvelé sans changer de service : ${message}` }, { status: 409 });
    }
  }

  const existingByParcel = new Map((existingRows ?? []).map((shipment) => [shipment.parcel_index, shipment]));
  const labels: { parcel: number; url: string | null; trackingNumber: string | null; provider: "shippo" }[] = [];
  for (const [index, providerRateId] of providerRateIds.entries()) {
    const existing = existingByParcel.get(index);
    if (existing?.shippo_transaction_id) {
      labels.push({ parcel: index + 1, url: existing.label_url, trackingNumber: existing.tracking_number, provider: "shippo" });
      continue;
    }
    if (existing) {
      return Response.json({
        ok: false,
        message: `L’achat du colis ${index + 1} a déjà été lancé et son résultat doit être vérifié dans Shippo avant toute nouvelle tentative.`,
      }, { status: 409 });
    }

    const { data: lock, error: lockError } = await client.from("shipments").insert({
      order_id: order.id,
      parcel_index: index,
      shippo_rate_id: providerRateId,
      label_provider: "shippo",
      carrier: "Colissimo",
      service: rate.service,
      status: "PURCHASE_IN_PROGRESS",
      actual_cost_cents: 0,
    }).select("id").single();
    if (lockError || !lock?.id) {
      const concurrent = lockError?.code === "23505";
      return Response.json({
        ok: false,
        message: concurrent
          ? `Un achat est déjà en cours pour le colis ${index + 1}. Vérifiez Shippo avant de recommencer.`
          : `L’achat du colis ${index + 1} n’a pas pu être verrouillé : ${lockError?.message ?? "erreur inconnue"}`,
      }, { status: concurrent ? 409 : 500 });
    }

    let label: Awaited<ReturnType<typeof createShippoLabel>>;
    try {
      label = await createShippoLabel({ orderNumber: order.order_number, rateId: providerRateId, parcelIndex: index });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("shippo_label_purchase_failed", { orderNumber: order.order_number, parcel: index + 1, message });
      if (cause instanceof ShippoAmbiguousPurchaseError) {
        await client.from("shipments").update({ status: "PURCHASE_AMBIGUOUS" }).eq("id", lock.id);
      } else {
        await client.from("shipments").delete().eq("id", lock.id).is("shippo_transaction_id", null);
      }
      return Response.json({ ok: false, message: `Échec de l’achat Shippo pour le colis ${index + 1} : ${message}` }, {
        status: cause instanceof ShippoLabelError ? cause.status : 502,
      });
    }

    const { error: storeError } = await client.from("shipments").update({
      shippo_rate_id: providerRateId,
      shippo_transaction_id: label.transactionId,
      sendcloud_shipping_option_code: null,
      sendcloud_parcel_id: null,
      sendcloud_shipment_id: null,
      carrier: label.carrier,
      service: rate.service,
      label_url: label.documentUrl,
      commercial_invoice_url: label.commercialInvoiceUrl,
      tracking_number: label.trackingNumber,
      tracking_url: label.trackingUrl,
      status: label.status,
      actual_cost_cents: label.actualCostCents,
    }).eq("id", lock.id);
    if (storeError) {
      await client.from("shipments").update({ status: "PURCHASE_AMBIGUOUS" }).eq("id", lock.id);
      return Response.json({
        ok: false,
        message: `L’étiquette Shippo ${label.transactionId} a été achetée, mais son enregistrement a échoué. Vérifiez Shippo avant toute nouvelle tentative : ${storeError.message}`,
      }, { status: 500 });
    }
    labels.push({ parcel: index + 1, url: label.documentUrl, trackingNumber: label.trackingNumber, provider: "shippo" });
  }

  const { data: shipmentCosts } = await client.from("shipments").select("actual_cost_cents").eq("order_id", order.id);
  const actualShippingCostCents = (shipmentCosts ?? []).reduce((sum, shipment) => sum + shipment.actual_cost_cents, 0);
  await client.from("orders").update({ status: "ready_to_ship", actual_shipping_cost_cents: actualShippingCostCents, updated_at: new Date().toISOString() }).eq("id", order.id);
  if (order.email) {
    const content = orderStatusEmail({ locale: order.locale, orderNumber: order.order_number, status: "ready_to_ship" });
    await enqueueNotification({
      kind: "order_status",
      to: order.email,
      locale: order.locale,
      ...content,
      payload: { orderId: order.id, status: "ready_to_ship" },
      dedupeKey: `order-status/${order.id}/ready_to_ship`,
    });
    dispatchNotificationQueue(context, "label_ready_notification_delivery_failed");
  }
  await client.from("audit_log").insert({
    actor_id: admin.id === "demo-admin" ? null : admin.id,
    action: "order.labels_purchased",
    entity_type: "order",
    entity_id: order.id,
    after_data: { count: labels.length, actualShippingCostCents, provider: "shippo", ratesRefreshed: refreshed },
  });
  const labelCount = labels.length;
  return Response.json({
    ok: true,
    message: `${labelCount} étiquette${labelCount > 1 ? "s" : ""} achetée${labelCount > 1 ? "s" : ""}. ${labelCount > 1 ? "Elles sont" : "Elle est"} disponible${labelCount > 1 ? "s" : ""} dans la rubrique « Étiquettes achetées ».`,
    labels,
    fallbackParcels: [],
  });
}
