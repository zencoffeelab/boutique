import type { ActionFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request); if (request.method !== "POST" || !params.id) return Response.json({ ok: false }, { status: 405 });
  const config = env(); const client = createServiceSupabase(); if (!client) return Response.json({ ok: false, message: "Database unavailable." }, { status: 503 });
  const { data: order } = await client.from("orders").select("id, order_number, status, shipping_quote_id, shipping_rate_id").eq("id", params.id).maybeSingle();
  if (!order || !["paid", "preparing", "ready_to_ship"].includes(order.status)) return Response.json({ ok: false, message: "Order is not ready for label purchase." }, { status: 409 });
  const { data: quote } = await client.from("shipping_quotes").select("rates").eq("id", order.shipping_quote_id).single(); const rate = (quote?.rates as any[])?.find((item) => item.id === order.shipping_rate_id); if (!rate) return Response.json({ ok: false, message: "Shipping rate snapshot not found." }, { status: 409 });
  const { data: existingRows } = await client.from("shipments").select("parcel_index,shippo_transaction_id,label_url,tracking_number").eq("order_id", order.id); const existingByParcel = new Map((existingRows ?? []).map((shipment) => [shipment.parcel_index, shipment]));
  if (config.SHIPPO_MOCK) return Response.json({ ok: true, demo: true, labels: rate.shippoRateIds?.map((_: string, index: number) => ({ parcel: index + 1, url: "about:blank" })) ?? [] });
  if (!config.SHIPPO_API_TOKEN) return Response.json({ ok: false, message: "Shippo is not configured." }, { status: 503 });
  const labels = [];
  for (const [index, shippoRateId] of (rate.shippoRateIds as string[]).entries()) {
    const existing = existingByParcel.get(index); if (existing?.shippo_transaction_id) { labels.push({ parcel: index + 1, url: existing.label_url, trackingNumber: existing.tracking_number }); continue; }
    const headers = { authorization: `ShippoToken ${config.SHIPPO_API_TOKEN}`, "content-type": "application/json", "shippo-api-version": "2018-02-08" };
    const [response, rateResponse] = await Promise.all([fetch("https://api.goshippo.com/transactions", { method: "POST", headers, body: JSON.stringify({ rate: shippoRateId, label_file_type: "PDF", async: false, metadata: order.order_number }) }), fetch(`https://api.goshippo.com/rates/${shippoRateId}`, { headers })]); const transaction = await response.json() as any; const purchasedRate = rateResponse.ok ? await rateResponse.json() as any : null;
    if (!response.ok || transaction.status !== "SUCCESS") {
      const shippoMessages = Array.isArray(transaction.messages)
        ? transaction.messages
          .map((item: unknown) => typeof item === "object" && item !== null && "text" in item && typeof item.text === "string" ? item.text.trim() : "")
          .filter(Boolean)
        : [];
      const detail = shippoMessages.join(" · ");
      console.error("shippo_label_purchase_failed", {
        orderNumber: order.order_number,
        parcel: index + 1,
        httpStatus: response.status,
        transactionStatus: transaction.status,
        messages: shippoMessages,
      });
      return Response.json({
        ok: false,
        message: detail
          ? `Échec de l’achat de l’étiquette pour le colis ${index + 1} : ${detail}`
          : `Échec de l’achat de l’étiquette pour le colis ${index + 1}.`,
      }, { status: 502 });
    }
    await client.from("shipments").upsert({ order_id: order.id, parcel_index: index, shippo_rate_id: shippoRateId, shippo_transaction_id: transaction.object_id, carrier: transaction.provider ?? rate.carrier, service: rate.service, label_url: transaction.label_url, commercial_invoice_url: transaction.commercial_invoice_url, tracking_number: transaction.tracking_number, tracking_url: transaction.tracking_url_provider, status: transaction.tracking_status ?? "PRE_TRANSIT", actual_cost_cents: Math.round(Number(purchasedRate?.amount ?? 0) * 100) }, { onConflict: "order_id,parcel_index" });
    labels.push({ parcel: index + 1, url: transaction.label_url, trackingNumber: transaction.tracking_number });
  }
  const { data: shipmentCosts } = await client.from("shipments").select("actual_cost_cents").eq("order_id", order.id); const actualShippingCostCents = (shipmentCosts ?? []).reduce((sum, shipment) => sum + shipment.actual_cost_cents, 0);
  await client.from("orders").update({ status: "ready_to_ship", actual_shipping_cost_cents: actualShippingCostCents, updated_at: new Date().toISOString() }).eq("id", order.id); await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "order.labels_purchased", entity_type: "order", entity_id: order.id, after_data: { count: labels.length, actualShippingCostCents } });
  return Response.json({ ok: true, labels });
}
