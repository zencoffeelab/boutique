import { describe, expect, it } from "vitest";
import { labelIsRefundable, labelRefundStatusFromTransaction, normalizedTrackingStatus, normalizeLabelRefundStatus } from "~/services/label-refunds.server";

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
    expect(labelIsRefundable({ trackingStatus: "TRANSIT", purchasedAt: new Date(now - 1_000).toISOString(), now })).toBe(false);
    expect(labelIsRefundable({ trackingStatus: "UNKNOWN", purchasedAt: new Date(now - 91 * 24 * 60 * 60_000).toISOString(), now })).toBe(false);
  });
});
