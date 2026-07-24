import { describe, expect, it } from "vitest";
import type { ShippingRate } from "~/domain/types";
import { shippingProviderLabel } from "~/routes/checkout";

function rate(provider: ShippingRate["provider"], carrier = "Colissimo"): ShippingRate {
  return {
    id: "rate-1", provider, carrier, service: "Domicile", deliveryMethod: "home",
    amountCents: 625, currency: "EUR", estimatedDays: 2, freeShippingApplied: false,
  };
}

describe("checkout shipping provider labels", () => {
  it("distinguishes both Colissimo providers", () => {
    expect(shippingProviderLabel(rate("shippo"), false)).toBe("via Shippo");
    expect(shippingProviderLabel(rate("sendcloud"), false)).toBe("via Sendcloud");
  });

  it("does not add an internal provider label to other carriers or mock rates", () => {
    expect(shippingProviderLabel(rate("sendcloud", "FedEx"), false)).toBeNull();
    expect(shippingProviderLabel(rate("mock"), false)).toBeNull();
  });
});
