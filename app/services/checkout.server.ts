import { randomUUID } from "node:crypto";
import { shippingRateLabel } from "~/domain/shipping-rate-label";
import type { Audience } from "~/domain/types";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { createStripe } from "~/lib/stripe.server";
import { createPayPalOrder, paypalConfigured } from "~/lib/paypal.server";
import { getLatestShippingQuote } from "~/services/shipping.server";

export const temporaryOrderPrefix = "ZCL-TMP-";

export function isTemporaryOrderNumber(value: string | null | undefined) {
  return Boolean(value?.startsWith(temporaryOrderPrefix));
}

export async function resolveCheckoutOrderNumber(sessionId: string) {
  const config = env();
  if (!config.STRIPE_SECRET_KEY || !sessionId.startsWith("cs_")) return null;
  const supabase = createServiceSupabase(); if (!supabase) return null;
  try {
    const session = await createStripe(config.STRIPE_SECRET_KEY).checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.order_id;
    if (session.payment_status !== "paid" || !orderId) return null;
    const { data: order } = await supabase.from("orders").select("order_number,status").eq("id", orderId).maybeSingle();
    if (!order || order.status === "pending_payment" || isTemporaryOrderNumber(order.order_number)) return null;
    return order.order_number;
  } catch {
    return null;
  }
}

export async function createCheckout(input: { cartId: string; shippingRateId: string; paymentMethod?: "stripe" | "paypal"; audience: Audience; profileId?: string }) {
  const config = env(); const quote = await getLatestShippingQuote(input.cartId);
  if (!quote || quote.audience !== input.audience) throw new Response("Shipping quote not found.", { status: 404 });
  if (new Date(quote.expiresAt).getTime() <= Date.now()) throw new Response("Shipping quote has expired.", { status: 409 });
  const rate = quote.rates.find((candidate) => candidate.id === input.shippingRateId);
  if (!rate) throw new Response("Shipping rate is not part of this quote.", { status: 409 });
  const shippingAddress = rate.deliveryMethod === "pickup" && rate.pickupPoint ? { ...quote.address, pickupPoint: rate.pickupPoint } : quote.address;
  if (config.PAYMENTS_MOCK) {
    const order = `ZCL-DEMO-${randomUUID().slice(0, 8).toUpperCase()}`;
    return { ok: true, confirmationUrl: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/order/confirmation" : "/commande/confirmation"}?order=${encodeURIComponent(order)}` };
  }
  const paymentMethod = input.paymentMethod ?? "stripe";
  if (paymentMethod === "paypal" && !paypalConfigured()) throw new Error("PayPal is not configured.");
  if (paymentMethod === "stripe" && !config.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  const supabase = createServiceSupabase(); if (!supabase) throw new Error("Supabase service access is required for checkout.");
  const { data: order, error } = await supabase.rpc("create_checkout_order", { p_cart_id: quote.cartId, p_quote_id: quote.id, p_audience: quote.audience, p_locale: quote.locale, p_address: shippingAddress, p_lines: quote.lines, p_shipping_rate: rate, p_reservation_minutes: 30, p_profile_id: input.profileId ?? null });
  if (error || !order) throw new Response(error?.message ?? "Unable to reserve stock.", { status: 409 });
  if (paymentMethod === "paypal") {
    try {
      const paypalOrder = await createPayPalOrder({ orderId: order.id, locale: quote.locale, returnUrl: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/checkout" : "/commande"}?paypal=approved`, cancelUrl: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/checkout" : "/commande"}?canceled=1`, lines: quote.lines, shippingCents: rate.amountCents, totalCents: quote.subtotalCents + rate.amountCents });
      const { error: paymentError } = await supabase.from("payments").insert({ order_id: order.id, provider: "paypal", provider_checkout_id: paypalOrder.id, status: "pending", amount_cents: quote.subtotalCents + rate.amountCents });
      if (paymentError || !paypalOrder.id) throw paymentError ?? new Error("PayPal did not return an order ID.");
      const approvalUrl = paypalOrder.links?.find((link) => link.rel === "approve")?.href;
      if (!approvalUrl) throw new Error("PayPal did not return an approval URL.");
      return { ok: true, checkoutUrl: approvalUrl };
    } catch (cause) {
      await supabase.rpc("release_order_reservation", { p_order_id: order.id, p_reason: "paypal_checkout_creation_failed" });
      throw cause;
    }
  }
  if (!config.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  const stripe = createStripe(config.STRIPE_SECRET_KEY);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: quote.address.email, client_reference_id: order.id,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/order/confirmation" : "/commande/confirmation"}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/checkout" : "/commande"}?canceled=1`,
      metadata: { order_id: order.id, quote_id: quote.id, audience: quote.audience },
      payment_intent_data: { metadata: { order_id: order.id } },
      line_items: [...quote.lines.map((line) => ({ quantity: line.quantity, price_data: { currency: "eur" as const, unit_amount: line.unitPriceCents, product_data: { name: line.productName, description: line.variantLabel, images: line.imageUrl ? [line.imageUrl] : undefined, metadata: { variant_id: line.variantId } } } })), ...(rate.amountCents > 0 ? [{ quantity: 1, price_data: { currency: "eur" as const, unit_amount: rate.amountCents, product_data: { name: quote.locale === "en-GB" ? "Shipping" : "Livraison", description: shippingRateLabel(rate, quote.locale) } } }] : [])],
      locale: quote.locale === "fr-FR" ? "fr" : "en",
    });
    const { error: paymentError } = await supabase.from("payments").insert({ order_id: order.id, provider: "stripe", provider_checkout_id: session.id, status: "pending", amount_cents: quote.subtotalCents + rate.amountCents });
    if (paymentError) { await stripe.checkout.sessions.expire(session.id); throw paymentError; }
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { ok: true, checkoutUrl: session.url };
  } catch (cause) {
    await supabase.rpc("release_order_reservation", { p_order_id: order.id, p_reason: "checkout_creation_failed" });
    throw cause;
  }
}
