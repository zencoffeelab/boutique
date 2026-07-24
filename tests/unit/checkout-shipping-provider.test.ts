import { describe, expect, it } from "vitest";
import { shippingRateLabel } from "~/domain/shipping-rate-label";
import type { ShippingRate } from "~/domain/types";

function rate(carrier: string, signatureRequired = false): ShippingRate {
  return {
    id: "rate-1", provider: "sendcloud", carrier, service: "Internal Sendcloud service", deliveryMethod: "home",
    amountCents: 625, currency: "EUR", estimatedDays: 2, freeShippingApplied: false, signatureRequired,
  };
}

describe("checkout shipping rate labels", () => {
  it("keeps only the carrier brand", () => {
    expect(shippingRateLabel(rate("Mondial Relay"))).toBe("Mondial Relay");
    expect(shippingRateLabel(rate("FedEx"))).toBe("FedEx");
  });

  it("keeps only the signature qualifier when required", () => {
    expect(shippingRateLabel(rate("FedEx", true))).toBe("FedEx - Signature");
    expect(shippingRateLabel(rate("Colissimo", true))).toBe("Colissimo - Signature");
  });
});
