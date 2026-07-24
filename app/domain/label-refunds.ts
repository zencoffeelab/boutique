const REFUNDABLE_TRACKING_STATUSES = new Set(["", "UNKNOWN", "PRE_TRANSIT", "READY_TO_SEND"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizedTrackingStatus(value: unknown): string {
  if (value && typeof value === "object" && "status" in value) return text((value as { status?: unknown }).status).toUpperCase();
  return text(value).toUpperCase();
}

export function trackingStatusAllowsLabelRefund(value: unknown): boolean {
  return REFUNDABLE_TRACKING_STATUSES.has(normalizedTrackingStatus(value));
}

export function labelIsRefundable(input: { trackingStatus: unknown; purchasedAt: string; now?: number }): boolean {
  if (!trackingStatusAllowsLabelRefund(input.trackingStatus)) return false;
  const purchasedAt = new Date(input.purchasedAt).getTime();
  const now = input.now ?? Date.now();
  return Number.isFinite(purchasedAt) && purchasedAt <= now && now - purchasedAt <= 90 * 24 * 60 * 60_000;
}
