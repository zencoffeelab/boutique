import type { ShippingRate } from "./types";

export function shippingRateLabel(rate: Pick<ShippingRate, "carrier" | "signatureRequired">) {
  return `${rate.carrier}${rate.signatureRequired ? " - Signature" : ""}`;
}
