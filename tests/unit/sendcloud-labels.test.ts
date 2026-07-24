import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackedParcel, ResolvedCartLine } from "~/domain/types";

const line: ResolvedCartLine = {
  productId: "coffee", productSlug: "coffee", productName: "Coffee", variantId: "coffee-250", variantLabel: "250 g", audience: "retail", quantity: 1,
  unitPriceCents: 1_200, unitCostCents: 400, unitWeightGrams: 250, hsCode: "090121", customsOriginCountry: "BR", availableStock: 1, imageUrl: "/coffee.jpg",
};
const parcel: PackedParcel = {
  presetId: "box", presetName: "Box", netWeightGrams: 250, shippingWeightGrams: 380, lengthCm: 25, widthCm: 18, heightCm: 8,
  lines: [{ variantId: "coffee-250", quantity: 1, unitWeightGrams: 250 }],
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Sendcloud labels", () => {
  it("creates a synchronous label with the option returned by the Sendcloud quote", async () => {
    vi.stubEnv("SENDCLOUD_PUBLIC_KEY", "public-key");
    vi.stubEnv("SENDCLOUD_SECRET_KEY", "private-key");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 17 }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        id: "shipment-51",
        carrier: { name: "Colissimo" },
        parcels: [{
          id: 42,
          status: { code: "READY_TO_SEND" },
          documents: [{ type: "label", link: "https://panel.sendcloud.sc/api/v3/parcels/42/documents/label" }],
          tracking_number: "6A123",
          tracking_url: "https://track.example/6A123",
        }],
      } }), { status: 201, headers: { "content-type": "application/json" } })));
    vi.resetModules();
    const { createSendcloudLabel } = await import("~/services/sendcloud-labels.server");

    const result = await createSendcloudLabel({
      orderNumber: "ZCL-2026-000001", address: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+33600000000", line1: "1 rue du Café", postalCode: "37000", city: "Tours", countryCode: "FR" },
      lines: [line], parcel, rate: { sendcloudShippingOptionCode: "colissimo:home/fr", sendcloudActualCostCents: 887 },
    });

    expect(result).toMatchObject({
      provider: "sendcloud",
      shipmentId: "shipment-51",
      parcelId: "42",
      documentUrl: "https://panel.sendcloud.sc/api/v3/parcels/42/documents/label",
      trackingNumber: "6A123",
      actualCostCents: 887,
    });
    const [, init] = vi.mocked(fetch).mock.calls[1];
    expect(init?.headers).toMatchObject({ authorization: `Basic ${Buffer.from("public-key:private-key").toString("base64")}` });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      external_reference_id: "ZCL-2026-000001-box-380",
      from_address: { sender_address_id: "17" },
      to_address: { address_line_1: "rue du Café", house_number: "1" },
      ship_with: { properties: { shipping_option_code: "colissimo:home/fr" } },
      parcels: [{ weight: { value: "0.380", unit: "kg" } }],
    });
  });

  it("attaches the selected service point to a pickup shipment", async () => {
    vi.stubEnv("SENDCLOUD_PUBLIC_KEY", "public-key");
    vi.stubEnv("SENDCLOUD_SECRET_KEY", "private-key");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 17 }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        id: "shipment-52", carrier: { name: "Mondial Relay" },
        parcels: [{ id: 43, status: { code: "READY_TO_SEND" }, documents: [{ type: "label", link: "https://panel.sendcloud.sc/api/v3/parcels/43/documents/label" }] }],
      } }), { status: 201, headers: { "content-type": "application/json" } })));
    vi.resetModules();
    const { createSendcloudLabel } = await import("~/services/sendcloud-labels.server");

    await createSendcloudLabel({
      orderNumber: "ZCL-2026-000002", address: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+33600000000", line1: "1 rue du Café", postalCode: "37000", city: "Tours", countryCode: "FR" },
      lines: [line], parcel, pickupPointId: "10575092", rate: { sendcloudShippingOptionCode: "mondial_relay:service_point", sendcloudActualCostCents: 391 },
    });

    const [, init] = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({ to_service_point: { id: 10575092 } });
  });
});
