import { afterEach, describe, expect, it, vi } from "vitest";
import { createShippoLabel, ShippoLabelError } from "~/services/shippo-labels.server";
import { labelProviderForRate } from "~/routes/api.admin-order-label";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Shippo label purchase", () => {
  it("routes stored Shippo rates to Shippo and all other rates to Sendcloud", () => {
    expect(labelProviderForRate({ provider: "shippo", shippoRateIds: ["rate-colissimo"] })).toBe("shippo");
    expect(labelProviderForRate({ provider: "sendcloud", shippoRateIds: undefined })).toBe("sendcloud");
  });

  it("purchases the exact Shippo rate stored in the Colissimo quote", async () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/transactions")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ rate: "rate-colissimo", metadata: "ZCL-2026-42" });
        return new Response(JSON.stringify({ object_id: "transaction-42", status: "SUCCESS", provider: "Colissimo", label_url: "https://labels.goshippo.com/42.pdf", tracking_number: "8R123", tracking_url_provider: "https://tracking.example/8R123", tracking_status: "PRE_TRANSIT" }), { status: 200 });
      }
      return new Response(JSON.stringify({ amount: "5.85" }), { status: 200 });
    }));

    await expect(createShippoLabel({ orderNumber: "ZCL-2026-42", rateId: "rate-colissimo" })).resolves.toMatchObject({
      provider: "shippo", transactionId: "transaction-42", carrier: "Colissimo", actualCostCents: 585,
    });
  });

  it("surfaces Shippo purchase errors without creating a fake label", async () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/transactions")
      ? new Response(JSON.stringify({ status: "ERROR", messages: [{ text: "Rate expired" }] }), { status: 200 })
      : new Response(JSON.stringify({ amount: "5.85" }), { status: 200 })));
    await expect(createShippoLabel({ orderNumber: "ZCL-2026-43", rateId: "expired" })).rejects.toEqual(expect.objectContaining<Partial<ShippoLabelError>>({ message: "Rate expired", status: 502 }));
  });
});
