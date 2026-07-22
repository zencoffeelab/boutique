import { randomUUID } from "node:crypto";
import type { Audience } from "~/domain/types";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { createStripe } from "~/lib/stripe.server";
import { getLatestShippingQuote } from "~/services/shipping.server";

export async function createCheckout(input: { cartId: string; shippingRateId: string; audience: Audience; profileId?: string }) {
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
  if (!config.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  const supabase = createServiceSupabase(); if (!supabase) throw new Error("Supabase service access is required for checkout.");
  const { data: order, error } = await supabase.rpc("create_checkout_order", { p_cart_id: quote.cartId, p_quote_id: quote.id, p_audience: quote.audience, p_locale: quote.locale, p_address: shippingAddress, p_lines: quote.lines, p_shipping_rate: rate, p_reservation_minutes: 30, p_profile_id: input.profileId ?? null });
  if (error || !order) throw new Response(error?.message ?? "Unable to reserve stock.", { status: 409 });
  const stripe = createStripe(config.STRIPE_SECRET_KEY);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: quote.address.email, client_reference_id: order.id,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/order/confirmation" : "/commande/confirmation"}?order=${encodeURIComponent(order.order_number)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.VITE_SITE_URL}${quote.locale === "en-GB" ? "/en/checkout" : "/commande"}?canceled=1`,
      metadata: { order_id: order.id, quote_id: quote.id, audience: quote.audience },
      payment_intent_data: { metadata: { order_id: order.id, order_number: order.order_number } },
      line_items: [...quote.lines.map((line) => ({ quantity: line.quantity, price_data: { currency: "eur" as const, unit_amount: line.unitPriceCents, product_data: { name: line.productName, description: line.variantLabel, images: line.imageUrl ? [line.imageUrl] : undefined, metadata: { variant_id: line.variantId } } } })), ...(rate.amountCents > 0 ? [{ quantity: 1, price_data: { currency: "eur" as const, unit_amount: rate.amountCents, product_data: { name: quote.locale === "en-GB" ? "Shipping" : "Livraison", description: `${rate.carrier} · ${rate.service}` } } }] : [])],
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
