import type { ActionFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { createSendcloudLabel, SendcloudAmbiguousPurchaseError } from "~/services/sendcloud-labels.server";
import { createShippoLabel, ShippoLabelError } from "~/services/shippo-labels.server";

export function labelProviderForRate(rate: { provider?: unknown; shippoRateIds?: unknown }) {
  return rate.provider === "shippo" && Array.isArray(rate.shippoRateIds) ? "shippo" as const : "sendcloud" as const;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (request.method !== "POST" || !params.id) return Response.json({ ok: false }, { status: 405 });
  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Database unavailable." }, { status: 503 });
  const { data: order } = await client.from("orders").select("id, order_number, status, paid_at, shipping_quote_id, shipping_rate_id").eq("id", params.id).maybeSingle();
  if (!order || !order.paid_at || !["paid", "preparing", "ready_to_ship"].includes(order.status)) return Response.json({ ok: false, message: "Order is not ready for label purchase." }, { status: 409 });
  const { data: quote } = await client.from("shipping_quotes").select("rates,address,lines,parcels").eq("id", order.shipping_quote_id).single();
  const rate = (quote?.rates as any[])?.find((item) => item.id === order.shipping_rate_id);
  if (!rate || !quote?.address || !quote?.lines || !quote?.parcels) return Response.json({ ok: false, message: "Shipping rate snapshot not found." }, { status: 409 });

  const provider = labelProviderForRate(rate);
  const providerRateIds = provider === "shippo" ? rate.shippoRateIds as string[] | undefined : rate.sendcloudShippingOptionCodes as string[] | undefined;
  const parcelAmounts = rate.sendcloudParcelAmountsCents as number[] | undefined;
  const validSendcloudAmounts = provider === "shippo" || (Array.isArray(parcelAmounts) && parcelAmounts.length === quote.parcels.length);
  if (!Array.isArray(providerRateIds) || providerRateIds.length !== quote.parcels.length || !validSendcloudAmounts) {
    return Response.json({ ok: false, message: `Ce devis ne contient pas les données ${provider === "shippo" ? "Shippo" : "Sendcloud"} requises. Recalculez la livraison avant d’acheter l’étiquette.` }, { status: 409 });
  }

  const { data: existingRows } = await client.from("shipments").select("parcel_index,label_provider,shippo_transaction_id,sendcloud_parcel_id,label_url,tracking_number").eq("order_id", order.id);
  const existingByParcel = new Map((existingRows ?? []).map((shipment) => [shipment.parcel_index, shipment]));
  if (env().SHIPPING_MOCK) return Response.json({ ok: true, demo: true, labels: quote.parcels.map((_: unknown, index: number) => ({ parcel: index + 1, url: "about:blank", provider })) });

  const labels: { parcel: number; url: string; trackingNumber: string | null; provider: "sendcloud" | "shippo" }[] = [];
  for (const [index, providerRateId] of providerRateIds.entries()) {
    const existing = existingByParcel.get(index);
    if (existing?.sendcloud_parcel_id || existing?.shippo_transaction_id) {
      labels.push({ parcel: index + 1, url: existing.label_url, trackingNumber: existing.tracking_number, provider: existing.label_provider === "sendcloud" ? "sendcloud" : "shippo" });
      continue;
    }

    if (provider === "shippo") {
      let label: Awaited<ReturnType<typeof createShippoLabel>>;
      try {
        label = await createShippoLabel({ orderNumber: order.order_number, rateId: providerRateId });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        console.error("shippo_label_purchase_failed", { orderNumber: order.order_number, parcel: index + 1, message });
        return Response.json({ ok: false, message: `Échec de l’achat Shippo pour le colis ${index + 1} : ${message}` }, { status: cause instanceof ShippoLabelError ? cause.status : 502 });
      }
      const { error } = await client.from("shipments").upsert({
        order_id: order.id, parcel_index: index, shippo_rate_id: providerRateId, shippo_transaction_id: label.transactionId,
        sendcloud_shipping_option_code: null, label_provider: "shippo", sendcloud_parcel_id: null, sendcloud_shipment_id: null,
        carrier: label.carrier, service: rate.service, label_url: label.documentUrl, commercial_invoice_url: label.commercialInvoiceUrl,
        tracking_number: label.trackingNumber, tracking_url: label.trackingUrl, status: label.status, actual_cost_cents: label.actualCostCents,
      }, { onConflict: "order_id,parcel_index" });
      if (error) return Response.json({ ok: false, message: `L’étiquette Shippo ${label.transactionId} a été achetée, mais son enregistrement a échoué : ${error.message}` }, { status: 500 });
      labels.push({ parcel: index + 1, url: label.documentUrl, trackingNumber: label.trackingNumber, provider: "shippo" });
      continue;
    }

    let label: Awaited<ReturnType<typeof createSendcloudLabel>>;
    try {
      label = await createSendcloudLabel({
        orderNumber: order.order_number,
        address: quote.address,
        lines: quote.lines,
        parcel: quote.parcels[index],
        rate: { ...rate, sendcloudShippingOptionCode: providerRateId, sendcloudActualCostCents: parcelAmounts![index] },
        pickupPointId: rate.pickupPoint?.id,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("sendcloud_label_purchase_failed", { orderNumber: order.order_number, parcel: index + 1, message });
      return Response.json({ ok: false, message: `Échec de l’achat Sendcloud pour le colis ${index + 1} : ${message}` }, { status: cause instanceof SendcloudAmbiguousPurchaseError ? 504 : 502 });
    }

    const { error } = await client.from("shipments").upsert({
      order_id: order.id,
      parcel_index: index,
      shippo_rate_id: null,
      sendcloud_shipping_option_code: providerRateId,
      label_provider: "sendcloud",
      sendcloud_parcel_id: label.parcelId,
      sendcloud_shipment_id: label.shipmentId,
      carrier: label.carrier ?? rate.carrier,
      service: rate.service,
      label_url: label.documentUrl,
      commercial_invoice_url: label.commercialInvoiceUrl,
      tracking_number: label.trackingNumber,
      tracking_url: label.trackingUrl,
      status: label.status,
      actual_cost_cents: label.actualCostCents,
    }, { onConflict: "order_id,parcel_index" });
    if (error) return Response.json({ ok: false, message: `L’étiquette Sendcloud ${label.shipmentId} a été achetée, mais son enregistrement a échoué : ${error.message}` }, { status: 500 });

    const { data: stored, error: storedError } = await client.from("shipments").select("id").eq("order_id", order.id).eq("parcel_index", index).single();
    if (storedError || !stored?.id) return Response.json({ ok: false, message: `L’étiquette Sendcloud ${label.shipmentId} a été achetée, mais elle n’a pas pu être relue.` }, { status: 500 });
    const privateLabelUrl = `/api/admin/shipments/${stored.id}/label`;
    const { error: labelUrlError } = await client.from("shipments").update({ label_url: privateLabelUrl }).eq("id", stored.id);
    if (labelUrlError) return Response.json({ ok: false, message: `L’étiquette Sendcloud ${label.shipmentId} a été achetée, mais son lien privé n’a pas pu être enregistré.` }, { status: 500 });
    labels.push({ parcel: index + 1, url: privateLabelUrl, trackingNumber: label.trackingNumber, provider: "sendcloud" });
  }

  const { data: shipmentCosts } = await client.from("shipments").select("actual_cost_cents").eq("order_id", order.id);
  const actualShippingCostCents = (shipmentCosts ?? []).reduce((sum, shipment) => sum + shipment.actual_cost_cents, 0);
  await client.from("orders").update({ status: "ready_to_ship", actual_shipping_cost_cents: actualShippingCostCents, updated_at: new Date().toISOString() }).eq("id", order.id);
  await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "order.labels_purchased", entity_type: "order", entity_id: order.id, after_data: { count: labels.length, actualShippingCostCents, provider } });
  return Response.json({ ok: true, labels, fallbackParcels: [] });
}
