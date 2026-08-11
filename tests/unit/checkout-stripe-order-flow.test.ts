import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env.server", () => ({ env: vi.fn() }));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));
vi.mock("~/lib/stripe.server", () => ({
  constructStripeEvent: vi.fn(),
  createStripe: vi.fn(),
}));
vi.mock("~/services/shipping.server", () => ({ getLatestShippingQuote: vi.fn() }));
vi.mock("~/services/email-templates.server", () => ({
  orderConfirmationEmail: vi.fn(() => ({ subject: "Confirmation", html: "<p>Confirmation</p>" })),
  professionalQuotePaidEmail: vi.fn(),
  refundEmail: vi.fn(),
}));
vi.mock("~/services/notifications.server", () => ({
  dispatchNotificationQueue: vi.fn(),
  enqueueNotification: vi.fn(async () => ({ queued: true })),
}));
vi.mock("~/services/invoice.server", () => ({ generateInvoicePdfSafely: vi.fn(async () => true) }));

import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { constructStripeEvent, createStripe } from "~/lib/stripe.server";
import { action as stripeWebhookAction } from "~/routes/api.webhook-stripe";
import { createCheckout } from "~/services/checkout.server";
import { generateInvoicePdfSafely } from "~/services/invoice.server";
import { enqueueNotification } from "~/services/notifications.server";
import { getLatestShippingQuote } from "~/services/shipping.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const quoteId = "22222222-2222-4222-8222-222222222222";
const rateId = "33333333-3333-4333-8333-333333333333";

function productionEnvironment() {
  vi.mocked(env).mockReturnValue({
    PAYMENTS_MOCK: false,
    STRIPE_SECRET_KEY: "sk_live_redacted",
    STRIPE_WEBHOOK_SECRET: "whsec_redacted",
    VITE_SITE_URL: "https://zencoffeelab.com",
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  productionEnvironment();
});

describe("Stripe checkout to paid back-office order", () => {
  it("reserves the order, stores the pending payment and creates a Stripe Checkout session", async () => {
    const rate = {
      id: rateId,
      provider: "shippo" as const,
      carrier: "Colissimo",
      service: "Domicile",
      deliveryMethod: "home" as const,
      amountCents: 878,
      currency: "EUR" as const,
      estimatedDays: 2,
      freeShippingApplied: false,
      signatureRequired: false,
      shippoRateIds: ["rate_shippo_private"],
      shippoShipmentIds: ["shipment_shippo_private"],
      serviceToken: "colissimo_home" as const,
    };
    vi.mocked(getLatestShippingQuote).mockResolvedValue({
      id: quoteId,
      cartId: "44444444-4444-4444-8444-444444444444",
      locale: "fr-FR",
      audience: "retail",
      address: {
        firstName: "Ada",
        lastName: "Lovelace",
        company: "",
        email: "ada@example.com",
        phone: "0600000000",
        line1: "1 rue de Rivoli",
        line2: "",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
      },
      lines: [{
        productId: "55555555-5555-4555-8555-555555555555",
        variantId: "66666666-6666-4666-8666-666666666666",
        productSlug: "cafe-test",
        productName: "Café test",
        variantLabel: "200g",
        imageUrl: "",
        audience: "retail",
        quantity: 1,
        unitWeightGrams: 200,
        unitPriceCents: 1_250,
        unitCostCents: 500,
        hsCode: "09012100",
        customsOriginCountry: "KE",
        availableStock: 10,
      }],
      parcels: [{
        presetId: "box",
        presetName: "Carton S",
        netWeightGrams: 200,
        shippingWeightGrams: 380,
        lengthCm: 24,
        widthCm: 18,
        heightCm: 10,
        lines: [{ variantId: "66666666-6666-4666-8666-666666666666", quantity: 1, unitWeightGrams: 200 }],
      }],
      rates: [rate],
      subtotalCents: 1_250,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const rpc = vi.fn(async () => ({ data: { id: orderId, order_number: "ZCL-TMP-ORDER" }, error: null }));
    const insertPayment = vi.fn(async () => ({ error: null }));
    vi.mocked(createServiceSupabase).mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        expect(table).toBe("payments");
        return { insert: insertPayment };
      }),
    } as never);
    const createSession = vi.fn(async () => ({
      id: "cs_live_checkout",
      url: "https://checkout.stripe.com/c/pay/cs_live_checkout",
    }));
    vi.mocked(createStripe).mockReturnValue({
      checkout: { sessions: { create: createSession, expire: vi.fn() } },
    } as never);

    const result = await createCheckout({
      cartId: "44444444-4444-4444-8444-444444444444",
      shippingRateId: rateId,
      audience: "retail",
    });

    expect(result).toEqual({ ok: true, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_live_checkout" });
    expect(rpc).toHaveBeenCalledWith("create_checkout_order", expect.objectContaining({
      p_quote_id: quoteId,
      p_shipping_rate: rate,
    }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment",
      client_reference_id: orderId,
      metadata: { order_id: orderId, quote_id: quoteId, audience: "retail" },
      success_url: "https://zencoffeelab.com/commande/confirmation?session_id={CHECKOUT_SESSION_ID}",
      line_items: expect.arrayContaining([
        expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 878 }) }),
      ]),
    }));
    expect(insertPayment).toHaveBeenCalledWith({
      order_id: orderId,
      provider: "stripe",
      provider_checkout_id: "cs_live_checkout",
      status: "pending",
      amount_cents: 2_128,
    });
  });

  it("finalizes a paid Stripe event so the order is available to the back office", async () => {
    vi.mocked(constructStripeEvent).mockResolvedValue({
      id: "evt_paid_order",
      type: "checkout.session.completed",
      created: 1_786_400_000,
      data: { object: {
        id: "cs_live_checkout",
        metadata: { order_id: orderId },
        payment_status: "paid",
        currency: "eur",
        amount_total: 2_128,
        payment_intent: "pi_paid_order",
      } },
    } as never);
    const paymentIntentUpdate = vi.fn(async () => ({ latest_charge: null }));
    vi.mocked(createStripe).mockReturnValue({ paymentIntents: { update: paymentIntentUpdate } } as never);

    const webhookInsert = vi.fn(async () => ({ error: null }));
    const processedEvent = vi.fn(async () => ({ error: null }));
    const webhookUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({ eq: processedEvent })),
    }));
    const paymentLookup = vi.fn(async () => ({ data: { order_id: orderId, amount_cents: 2_128 }, error: null }));
    const orderSnapshot = vi.fn(async () => ({
      data: {
        order_number: "ZCL-202608-000001",
        locale: "fr-FR",
        email: "ada@example.com",
        shipping_address: { line1: "1 rue de Rivoli", postalCode: "75001", city: "Paris", countryCode: "FR" },
        shipping_carrier: "Colissimo",
        shipping_service: "Domicile",
        subtotal_cents: 1_250,
        shipping_charged_cents: 878,
        total_cents: 2_128,
        order_lines: [{ product_name: "Café test", variant_label: "200g", quantity: 1, line_total_cents: 1_250 }],
      },
      error: null,
    }));
    const finalizeOrder = vi.fn(async () => ({
      data: { id: orderId, order_number: "ZCL-202608-000001", email: "ada@example.com", locale: "fr-FR" },
      error: null,
    }));
    vi.mocked(createServiceSupabase).mockReturnValue({
      rpc: finalizeOrder,
      from: vi.fn((table: string) => {
        if (table === "webhook_events") return { insert: webhookInsert, update: webhookUpdate };
        if (table === "payments") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: paymentLookup })) })) };
        if (table === "orders") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: orderSnapshot })) })) };
        throw new Error(`Unexpected table ${table}`);
      }),
    } as never);

    const response = await stripeWebhookAction({
      request: new Request("https://zencoffeelab.com/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "signed" },
        body: "signed-payload",
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(finalizeOrder).toHaveBeenCalledWith("finalize_paid_order", expect.objectContaining({
      p_order_id: orderId,
      p_payment_intent_id: "pi_paid_order",
      p_provider_event_id: "evt_paid_order",
    }));
    expect(paymentIntentUpdate).toHaveBeenCalledWith("pi_paid_order", expect.objectContaining({
      metadata: { order_id: orderId, order_number: "ZCL-202608-000001" },
    }));
    expect(generateInvoicePdfSafely).toHaveBeenCalledWith(orderId);
    expect(enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: "order_confirmation",
      to: "ada@example.com",
      payload: { orderId },
    }));
    expect(webhookUpdate).toHaveBeenCalledWith(expect.objectContaining({ processing_error: null }));
    expect(processedEvent).toHaveBeenCalledWith("provider_event_id", "evt_paid_order");
  });
});
