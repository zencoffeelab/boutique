import { afterEach, describe, expect, it, vi } from "vitest";
import { createShippoLabel, ShippoAmbiguousPurchaseError, ShippoLabelError } from "~/services/shippo-labels.server";
import { shippoRateNeedsRefresh } from "~/routes/api.admin-order-label";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Shippo label purchase", () => {
  it("refreshes a stored Shippo rate once it reaches seven days", () => {
    const now = Date.UTC(2026, 7, 11, 12);
    expect(shippoRateNeedsRefresh(new Date(now - 7 * 24 * 60 * 60_000).toISOString(), now)).toBe(true);
    expect(shippoRateNeedsRefresh(new Date(now - 6 * 24 * 60 * 60_000).toISOString(), now)).toBe(false);
  });

  it("purchases the exact Shippo rate stored in the Colissimo quote", async () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/transactions")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ rate: "rate-colissimo", metadata: "ZCL-2026-42/parcel/2" });
        return new Response(JSON.stringify({ object_id: "transaction-42", status: "SUCCESS", provider: "Colissimo", label_url: "https://labels.goshippo.com/42.pdf", tracking_number: "8R123", tracking_url_provider: "https://tracking.example/8R123", tracking_status: "PRE_TRANSIT" }), { status: 200 });
      }
      return new Response(JSON.stringify({ amount: "5.85", currency: "EUR" }), { status: 200 });
    }));

    await expect(createShippoLabel({ orderNumber: "ZCL-2026-42", rateId: "rate-colissimo", parcelIndex: 1 })).resolves.toMatchObject({
      provider: "shippo", transactionId: "transaction-42", carrier: "Colissimo", actualCostCents: 585,
    });
  });

  it("surfaces Shippo purchase errors without creating a fake label", async () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/transactions")
      ? new Response(JSON.stringify({ status: "ERROR", messages: [{ text: "Rate expired" }] }), { status: 200 })
      : new Response(JSON.stringify({ amount: "5.85", currency: "EUR" }), { status: 200 })));
    await expect(createShippoLabel({ orderNumber: "ZCL-2026-43", rateId: "expired" })).rejects.toEqual(expect.objectContaining<Partial<ShippoLabelError>>({ message: "Rate expired", status: 502 }));
  });

  it("blocks automatic retry when the purchase result is ambiguous", async () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo-token");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ amount: "5.85", currency: "EUR" }), { status: 200 }))
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError")));
    await expect(createShippoLabel({ orderNumber: "ZCL-2026-44", rateId: "rate-colissimo" })).rejects.toEqual(expect.objectContaining<Partial<ShippoAmbiguousPurchaseError>>({ status: 504 }));
  });
});
