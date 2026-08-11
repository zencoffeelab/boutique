import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelSendcloudShipment, labelIsRefundable, labelRefundStatusFromTransaction, normalizedTrackingStatus, normalizeLabelRefundStatus } from "~/services/label-refunds.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Shippo label refunds", () => {
  it("normalizes refund and tracking statuses", () => {
    expect(normalizeLabelRefundStatus("queued")).toBe("QUEUED");
    expect(normalizeLabelRefundStatus("unknown-value")).toBe("PENDING");
    expect(normalizedTrackingStatus({ status: "pre_transit" })).toBe("PRE_TRANSIT");
    expect(labelRefundStatusFromTransaction("REFUNDPENDING")).toBe("PENDING");
    expect(labelRefundStatusFromTransaction("REFUNDED")).toBe("SUCCESS");
  });

  it("only allows unused labels purchased during the last 90 days", () => {
    const now = Date.UTC(2026, 6, 22);
    expect(labelIsRefundable({ trackingStatus: "PRE_TRANSIT", purchasedAt: new Date(now - 89 * 24 * 60 * 60_000).toISOString(), now })).toBe(true);
    expect(labelIsRefundable({ trackingStatus: "READY_TO_SEND", purchasedAt: new Date(now - 1_000).toISOString(), now })).toBe(true);
    expect(labelIsRefundable({ trackingStatus: "TRANSIT", purchasedAt: new Date(now - 1_000).toISOString(), now })).toBe(false);
    expect(labelIsRefundable({ trackingStatus: "UNKNOWN", purchasedAt: new Date(now - 91 * 24 * 60 * 60_000).toISOString(), now })).toBe(false);
  });
});

describe("Sendcloud label cancellations", () => {
  it("cancels a v3 shipment synchronously", async () => {
    vi.stubEnv("SENDCLOUD_PUBLIC_KEY", "public-key");
    vi.stubEnv("SENDCLOUD_SECRET_KEY", "private-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: "cancelled", message: "Shipment cancelled" } }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(cancelSendcloudShipment("shipment-51")).resolves.toEqual({ status: "SUCCESS", message: "Shipment cancelled" });
    expect(fetch).toHaveBeenCalledWith("https://panel.sendcloud.sc/api/v3/shipments/shipment-51/cancel", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: `Basic ${Buffer.from("public-key:private-key").toString("base64")}` }),
    }));
  });

  it("keeps an asynchronous cancellation pending", async () => {
    vi.stubEnv("SENDCLOUD_PUBLIC_KEY", "public-key");
    vi.stubEnv("SENDCLOUD_SECRET_KEY", "private-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: "queued", message: "Cancellation queued" } }), { status: 202, headers: { "content-type": "application/json" } })));

    await expect(cancelSendcloudShipment("shipment-52")).resolves.toEqual({ status: "PENDING", message: "Cancellation queued" });
  });
});
