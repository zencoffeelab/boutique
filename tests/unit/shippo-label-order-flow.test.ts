import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin", demo: false })),
}));
vi.mock("~/lib/env.server", () => ({ env: vi.fn(() => ({ SHIPPING_MOCK: false })) }));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));
vi.mock("~/services/shippo-labels.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/shippo-labels.server")>();
  return { ...actual, createShippoLabel: vi.fn() };
});
vi.mock("~/services/email-templates.server", () => ({
  orderStatusEmail: vi.fn(() => ({ subject: "Commande prête", html: "<p>Prête</p>" })),
}));
vi.mock("~/services/notifications.server", () => ({
  dispatchNotificationQueue: vi.fn(),
  enqueueNotification: vi.fn(async () => ({ queued: true })),
}));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/api.admin-order-label";
import { enqueueNotification } from "~/services/notifications.server";
import { createShippoLabel } from "~/services/shippo-labels.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const quoteId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => vi.clearAllMocks());

describe("paid order to Shippo label", () => {
  it("purchases the stored Shippo rate and exposes the label in the back office", async () => {
    const order = {
      id: orderId,
      order_number: "ZCL-202608-000001",
      email: "ada@example.com",
      locale: "fr-FR",
      status: "paid",
      paid_at: "2026-08-11T08:00:00.000Z",
      shipping_quote_id: quoteId,
      shipping_rate_id: "rate-public",
    };
    const quote = {
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
      lines: [{ productId: "product", variantId: "variant", quantity: 1 }],
      parcels: [{ presetId: "box", presetName: "Carton S", netWeightGrams: 200, shippingWeightGrams: 380, lengthCm: 24, widthCm: 18, heightCm: 10 }],
      rates: [{
        id: "rate-public",
        provider: "shippo",
        carrier: "Colissimo",
        service: "Domicile",
        deliveryMethod: "home",
        amountCents: 878,
        currency: "EUR",
        serviceToken: "colissimo_home",
        shippoRateIds: ["rate_shippo_private"],
        shippoShipmentIds: ["shipment_shippo_private"],
      }],
      created_at: "2026-08-11T08:00:00.000Z",
    };

    vi.mocked(createShippoLabel).mockResolvedValue({
      provider: "shippo",
      transactionId: "transaction_shippo",
      documentUrl: "https://labels.example/label.pdf",
      commercialInvoiceUrl: null,
      trackingNumber: "TRACK123",
      trackingUrl: "https://tracking.example/TRACK123",
      status: "PRE_TRANSIT",
      carrier: "Colissimo",
      actualCostCents: 878,
    });

    const storeShipment = vi.fn(async () => ({ error: null }));
    const insertShipment = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "shipment-row" }, error: null })) })),
    }));
    const shipmentSelect = vi.fn((columns: string) => ({
      eq: vi.fn(async () => columns === "actual_cost_cents"
        ? { data: [{ actual_cost_cents: 878 }], error: null }
        : { data: [], error: null }),
    }));
    const updateOrder = vi.fn(async () => ({ error: null }));
    const insertAudit = vi.fn(async () => ({ error: null }));

    vi.mocked(createServiceSupabase).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "orders") return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: order, error: null })) })) })),
          update: vi.fn(() => ({ eq: updateOrder })),
        };
        if (table === "shipping_quotes") return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: quote, error: null })) })) })),
        };
        if (table === "shipments") return {
          select: shipmentSelect,
          insert: insertShipment,
          update: vi.fn(() => ({ eq: storeShipment })),
          delete: vi.fn(),
        };
        if (table === "audit_log") return { insert: insertAudit };
        throw new Error(`Unexpected table ${table}`);
      }),
    } as never);

    const response = await action({
      request: new Request(`https://zencoffeelab.com/api/admin/orders/${orderId}/label`, { method: "POST" }),
      params: { id: orderId },
      context: {},
    } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      labels: [{ parcel: 1, url: "https://labels.example/label.pdf", trackingNumber: "TRACK123", provider: "shippo" }],
    });
    expect(createShippoLabel).toHaveBeenCalledWith({
      orderNumber: "ZCL-202608-000001",
      rateId: "rate_shippo_private",
      parcelIndex: 0,
    });
    expect(insertShipment).toHaveBeenCalledWith(expect.objectContaining({
      order_id: orderId,
      label_provider: "shippo",
      shippo_rate_id: "rate_shippo_private",
      status: "PURCHASE_IN_PROGRESS",
    }));
    expect(storeShipment).toHaveBeenCalledWith("id", "shipment-row");
    expect(updateOrder).toHaveBeenCalledWith("id", orderId);
    expect(enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: "order_status",
      payload: { orderId, status: "ready_to_ship" },
    }));
    expect(insertAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "order.labels_purchased",
      entity_id: orderId,
      after_data: expect.objectContaining({ provider: "shippo", actualShippingCostCents: 878 }),
    }));
  });
});
