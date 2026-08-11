import type { ActionFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { capturePayPalOrder } from "~/lib/paypal.server";
import { orderConfirmationEmail } from "~/services/email-templates.server";
import { generateInvoicePdfSafely } from "~/services/invoice.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const payload = await request.json().catch(() => null) as { paypalOrderId?: string } | null;
  const paypalOrderId = payload?.paypalOrderId?.trim();
  if (!paypalOrderId || paypalOrderId.length > 100) return Response.json({ ok: false, message: "Invalid PayPal order." }, { status: 422 });
  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Database unavailable." }, { status: 503 });
  const { data: payment } = await client.from("payments").select("order_id,amount_cents,status").eq("provider", "paypal").eq("provider_checkout_id", paypalOrderId).maybeSingle();
  if (!payment) return Response.json({ ok: false, message: "PayPal payment not found." }, { status: 404 });
  const { data: order } = await client.from("orders").select("id,status,email,locale,order_number").eq("id", payment.order_id).maybeSingle();
  if (!order) return Response.json({ ok: false, message: "Order not found." }, { status: 404 });
  if (order.status !== "pending_payment") return Response.json({ ok: true, confirmationUrl: `${env().VITE_SITE_URL}${order.locale === "en-GB" ? "/en/order/confirmation" : "/commande/confirmation"}?order=${encodeURIComponent(order.order_number)}` });
  try {
    const captured = await capturePayPalOrder(paypalOrderId);
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    if (captured.status !== "COMPLETED" || capture?.status !== "COMPLETED" || capture.amount?.currency_code !== "EUR" || Math.round(Number(capture.amount.value ?? 0) * 100) !== payment.amount_cents) throw new Error("PayPal payment amount does not match the order.");
    const { data: paidOrder, error } = await client.rpc("finalize_paid_order", { p_order_id: order.id, p_payment_intent_id: capture.id ?? paypalOrderId, p_provider_event_id: `paypal:${paypalOrderId}`, p_paid_at: new Date().toISOString() });
    if (error) throw error;
    await generateInvoicePdfSafely(order.id);
    if (paidOrder?.email) {
      const { data: snapshot } = await client.from("orders").select("order_number,locale,email,shipping_address,shipping_carrier,shipping_service,subtotal_cents,shipping_charged_cents,total_cents,order_lines(product_name,variant_label,quantity,line_total_cents)").eq("id", order.id).single();
      if (snapshot) {
        const confirmation = orderConfirmationEmail(snapshot as never);
        await enqueueNotification({ kind: "order_confirmation", to: order.email, locale: order.locale, ...confirmation, payload: { orderId: order.id }, dedupeKey: `order-confirmation/${order.id}` });
        dispatchNotificationQueue(context, "paypal_order_confirmation_delivery_failed");
      }
    }
    return Response.json({ ok: true, confirmationUrl: `${env().VITE_SITE_URL}${order.locale === "en-GB" ? "/en/order/confirmation" : "/commande/confirmation"}?order=${encodeURIComponent(paidOrder?.order_number ?? order.order_number)}` });
  } catch (cause) {
    console.error("paypal_capture_failed", { message: cause instanceof Error ? cause.message : String(cause), paypalOrderId });
    return Response.json({ ok: false, message: "PayPal payment could not be confirmed." }, { status: 409 });
  }
}
