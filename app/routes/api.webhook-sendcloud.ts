import { createHash, timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { enqueueNotification } from "~/services/notifications.server";

function safeSecret(actual: string, expected: string) { const a = Buffer.from(actual); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed.", { status: 405 });
  const config = env();
  const supplied = request.headers.get("x-zcl-webhook-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
  if (!config.SENDCLOUD_WEBHOOK_SECRET || !safeSecret(supplied, config.SENDCLOUD_WEBHOOK_SECRET)) return new Response("Unauthorized.", { status: 401 });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return new Response("Invalid payload.", { status: 400 });
  const parcel = (payload.parcel ?? payload.data ?? payload) as Record<string, unknown>;
  const carrier = text(parcel.carrier) || text((parcel.shipping_method as Record<string, unknown> | undefined)?.carrier) || "Sendcloud";
  const trackingNumber = text(parcel.tracking_number);
  const status = text(parcel.status) || text(parcel.tracking_status) || "UNKNOWN";
  const statusDate = text(parcel.updated_at) || text(parcel.date_updated) || new Date().toISOString();
  const parcelId = text(parcel.id) || trackingNumber;
  const eventId = createHash("sha256").update(`${parcelId}|${trackingNumber}|${status}|${statusDate}`).digest("hex");
  const client = createServiceSupabase();
  if (!client) return new Response("Database unavailable.", { status: 503 });
  const { error } = await client.from("webhook_events").insert({ provider: "sendcloud", provider_event_id: eventId, event_type: text(payload.event) || "parcel_status_changed", payload });
  if (error?.code === "23505") return Response.json({ received: true, duplicate: true });
  if (error) return new Response("Unable to persist event.", { status: 500 });
  if (trackingNumber) {
    const { error: trackingError } = await client.rpc("apply_tracking_update", { p_carrier: carrier, p_tracking_number: trackingNumber, p_status: status, p_status_date: statusDate, p_payload: payload });
    if (trackingError) return new Response("Tracking update failed.", { status: 500 });
    const normalized = status.toUpperCase();
    if (["TRANSIT", "DELIVERED"].includes(normalized)) {
      const { data: shipment } = await client.from("shipments").select("tracking_url,orders(email,locale,order_number)").eq("tracking_number", trackingNumber).maybeSingle();
      const order = Array.isArray(shipment?.orders) ? shipment.orders[0] : shipment?.orders;
      if (order?.email) {
        const english = order.locale === "en-GB"; const delivered = normalized === "DELIVERED";
        await enqueueNotification({ kind: delivered ? "delivered" : "shipped", to: order.email, locale: order.locale, subject: delivered ? (english ? `Order delivered · ${order.order_number}` : `Commande livrée · ${order.order_number}`) : (english ? `Order shipped · ${order.order_number}` : `Commande expédiée · ${order.order_number}`), html: `<h1>${delivered ? (english ? "Your order has been delivered" : "Votre commande a été livrée") : (english ? "Your order is on its way" : "Votre commande est en route")}</h1><p>${order.order_number}</p>${shipment?.tracking_url ? `<p><a href="${shipment.tracking_url}">${english ? "Track the parcel" : "Suivre le colis"}</a></p>` : ""}`, payload: { trackingNumber, status } });
      }
    }
  }
  await client.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "sendcloud").eq("provider_event_id", eventId);
  return Response.json({ received: true });
}
