import Stripe from "stripe";
import type { ActionFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { constructStripeEvent, createStripe } from "~/lib/stripe.server";
import { orderConfirmationEmail, professionalQuotePaidEmail, refundEmail } from "~/services/email-templates.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";
import { generateInvoicePdf } from "~/services/invoice.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const config = env();
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) return new Response("Stripe webhook is not configured.", { status: 503 });
  const signature = request.headers.get("stripe-signature"); if (!signature) return new Response("Missing signature.", { status: 400 });
  const stripe = createStripe(config.STRIPE_SECRET_KEY); let event: Stripe.Event;
  try { event = await constructStripeEvent(stripe, await request.text(), signature, config.STRIPE_WEBHOOK_SECRET); }
  catch { return new Response("Invalid signature.", { status: 400 }); }
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  const { error: eventError } = await client.from("webhook_events").insert({ provider: "stripe", provider_event_id: event.id, event_type: event.type, payload: event });
  if (eventError?.code === "23505") {
    const { data: existing } = await client.from("webhook_events").select("processed_at").eq("provider", "stripe").eq("provider_event_id", event.id).single();
    if (existing?.processed_at) return Response.json({ received: true, duplicate: true });
  }
  if (eventError && eventError.code !== "23505") return new Response("Unable to persist event.", { status: 500 });
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      const session = event.data.object;
      const professionalQuoteId = session.metadata?.professional_quote_id;
      if (professionalQuoteId) {
        const { data: quote } = await client.from("professional_quotes").select("id,quote_number,email,locale,status,total_cents").eq("id", professionalQuoteId).maybeSingle();
        if (!quote) throw new Error("Professional quote linked to Stripe session was not found.");
        if (event.type === "checkout.session.async_payment_failed") {
          await client.from("professional_quotes").update({ status: "pending_payment", stripe_checkout_session_id: null, updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "bank_transfer_pending");
        } else if (event.type === "checkout.session.expired") {
          await client.from("professional_quotes").update({ stripe_checkout_session_id: null, updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "pending_payment");
        } else if (session.payment_status === "paid") {
          if (session.currency !== "eur" || session.amount_total !== quote.total_cents) throw new Error("Stripe payment amount does not match the professional quote.");
          const { data: paidQuote, error: paidError } = await client.rpc("finalize_paid_professional_quote", { p_quote_id: quote.id, p_checkout_session_id: session.id, p_payment_intent_id: String(session.payment_intent ?? ""), p_paid_at: new Date(event.created * 1000).toISOString() });
          if (paidError) throw paidError;
          if (!paidQuote?.duplicate && quote.email) {
            const content = professionalQuotePaidEmail({ locale: quote.locale, quoteNumber: quote.quote_number, totalCents: quote.total_cents });
            await enqueueNotification({ kind: "professional_quote_paid", to: quote.email, locale: quote.locale, ...content, payload: { quoteId: quote.id }, dedupeKey: `professional-quote-paid/${quote.id}` });
            dispatchNotificationQueue(context, "professional_quote_payment_confirmation_failed");
          }
        } else {
          await client.from("professional_quotes").update({ status: "bank_transfer_pending", stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "pending_payment");
        }
        await client.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("provider_event_id", event.id);
        return Response.json({ received: true, professionalQuote: true, paymentPending: session.payment_status !== "paid" });
      }
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object; const orderId = session.metadata?.order_id;
      if (!orderId) throw new Error("Stripe session is missing order metadata.");
      if (session.payment_status !== "paid") {
        await client.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("provider_event_id", event.id);
        return Response.json({ received: true, paymentPending: true });
      }
      const { data: payment, error: paymentLookupError } = await client.from("payments").select("order_id,amount_cents").eq("provider_checkout_id", session.id).maybeSingle();
      if (paymentLookupError || !payment || payment.order_id !== orderId) throw new Error("Stripe session does not match a pending payment.");
      if (session.currency !== "eur" || session.amount_total !== payment.amount_cents) throw new Error("Stripe payment amount does not match the order.");
      const { data: order, error } = await client.rpc("finalize_paid_order", { p_order_id: orderId, p_payment_intent_id: String(session.payment_intent ?? ""), p_provider_event_id: event.id, p_paid_at: new Date(event.created * 1000).toISOString() });
      if (error) throw error;
      const paymentIntentId = String(session.payment_intent ?? "");
      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
        const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
        const balance = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
        if (balance) await client.from("orders").update({ stripe_fee_cents: balance.fee, updated_at: new Date().toISOString() }).eq("id", orderId);
      }
      await generateInvoicePdf(orderId);
      if (order?.email) {
        const { data: snapshot } = await client.from("orders").select("order_number,locale,email,shipping_address,shipping_carrier,shipping_service,subtotal_cents,shipping_charged_cents,total_cents,order_lines(product_name,variant_label,quantity,line_total_cents)").eq("id", orderId).single();
        if (!snapshot) throw new Error("Order confirmation snapshot is unavailable.");
        const confirmation = orderConfirmationEmail(snapshot as never);
        await enqueueNotification({ kind: "order_confirmation", to: order.email, locale: order.locale, ...confirmation, payload: { orderId }, dedupeKey: `order-confirmation/${orderId}` });
        dispatchNotificationQueue(context, "order_confirmation_delivery_failed");
      }
    }
    if (event.type === "checkout.session.expired") { const orderId = event.data.object.metadata?.order_id; if (orderId) await client.rpc("release_order_reservation", { p_order_id: orderId, p_reason: "stripe_session_expired" }); }
    if (event.type === "checkout.session.async_payment_failed") { const orderId = event.data.object.metadata?.order_id; if (orderId) await client.rpc("release_order_reservation", { p_order_id: orderId, p_reason: "stripe_async_payment_failed" }); }
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = String(charge.payment_intent ?? "");
      const { data: previousPayment } = await client.from("payments").select("order_id,amount_cents,refunded_cents").eq("provider_payment_intent_id", paymentIntentId).maybeSingle();
      await client.rpc("apply_stripe_refund", { p_payment_intent_id: paymentIntentId, p_amount_refunded_cents: charge.amount_refunded, p_provider_event_id: event.id });
      const refundedNow = Math.max(0, charge.amount_refunded - (previousPayment?.refunded_cents ?? 0));
      if (previousPayment?.order_id && refundedNow > 0) {
        const { data: refundedOrder } = await client.from("orders").select("email,locale,order_number,total_cents").eq("id", previousPayment.order_id).maybeSingle();
        if (refundedOrder?.email) {
          const content = refundEmail({ locale: refundedOrder.locale, orderNumber: refundedOrder.order_number, amountCents: refundedNow, fullyRefunded: charge.amount_refunded >= refundedOrder.total_cents });
          await enqueueNotification({ kind: "refund", to: refundedOrder.email, locale: refundedOrder.locale, ...content, payload: { orderId: previousPayment.order_id, amountCents: refundedNow }, dedupeKey: `refund/${event.id}` });
          dispatchNotificationQueue(context, "refund_confirmation_delivery_failed");
        }
      }
    }
    await client.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("provider_event_id", event.id);
  } catch (cause) { await client.from("webhook_events").update({ processing_error: cause instanceof Error ? cause.message : String(cause) }).eq("provider", "stripe").eq("provider_event_id", event.id); return new Response("Webhook processing failed.", { status: 500 }); }
  return Response.json({ received: true });
}
