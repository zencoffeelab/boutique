import Stripe from "stripe";
import type { ActionFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { enqueueNotification } from "~/services/notifications.server";
import { generateInvoicePdf } from "~/services/invoice.server";

export async function action({ request }: ActionFunctionArgs) {
  const config = env();
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) return new Response("Stripe webhook is not configured.", { status: 503 });
  const signature = request.headers.get("stripe-signature"); if (!signature) return new Response("Missing signature.", { status: 400 });
  const stripe = new Stripe(config.STRIPE_SECRET_KEY); let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, config.STRIPE_WEBHOOK_SECRET); }
  catch { return new Response("Invalid signature.", { status: 400 }); }
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  const { error: eventError } = await client.from("webhook_events").insert({ provider: "stripe", provider_event_id: event.id, event_type: event.type, payload: event });
  if (eventError?.code === "23505") {
    const { data: existing } = await client.from("webhook_events").select("processed_at").eq("provider", "stripe").eq("provider_event_id", event.id).single();
    if (existing?.processed_at) return Response.json({ received: true, duplicate: true });
  }
  if (eventError && eventError.code !== "23505") return new Response("Unable to persist event.", { status: 500 });
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object; const orderId = session.metadata?.order_id;
      if (!orderId) throw new Error("Stripe session is missing order metadata.");
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
        const english = order.locale === "en-GB";
        await enqueueNotification({ kind: "order_confirmation", to: order.email, locale: order.locale, subject: english ? `Order confirmed · ${order.order_number}` : `Commande confirmée · ${order.order_number}`, html: `<h1>${english ? "Thank you for your order" : "Merci pour votre commande"}</h1><p>${order.order_number}</p>`, payload: { orderId } });
        await enqueueNotification({ kind: "invoice", to: order.email, locale: order.locale, subject: english ? `Your invoice · ${order.order_number}` : `Votre facture · ${order.order_number}`, html: `<h1>${english ? "Your invoice is ready" : "Votre facture est disponible"}</h1><p>${english ? "The PDF invoice is attached to this message." : "La facture PDF est jointe à ce message."}</p>`, payload: { orderId } });
      }
    }
    if (event.type === "checkout.session.expired") { const orderId = event.data.object.metadata?.order_id; if (orderId) await client.rpc("release_order_reservation", { p_order_id: orderId, p_reason: "stripe_session_expired" }); }
    if (event.type === "charge.refunded") { const charge = event.data.object; await client.rpc("apply_stripe_refund", { p_payment_intent_id: String(charge.payment_intent ?? ""), p_amount_refunded_cents: charge.amount_refunded, p_provider_event_id: event.id }); }
    await client.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("provider_event_id", event.id);
  } catch (cause) { await client.from("webhook_events").update({ processing_error: cause instanceof Error ? cause.message : String(cause) }).eq("provider", "stripe").eq("provider_event_id", event.id); return new Response("Webhook processing failed.", { status: 500 }); }
  return Response.json({ received: true });
}
