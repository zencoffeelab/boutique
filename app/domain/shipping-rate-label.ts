import type { ShippingRate } from "./types";

export function shippingRateLabel(rate: Pick<ShippingRate, "carrier" | "signatureRequired">) {
  return `${rate.carrier}${rate.signatureRequired ? " - Signature" : ""}`;
}

export function shippingRatePromotionLabel(rate: Pick<ShippingRate, "freeShippingApplied">, locale: string) {
  if (!rate.freeShippingApplied) return null;
  return locale === "en-GB" ? "Free" : "Offert";
}
