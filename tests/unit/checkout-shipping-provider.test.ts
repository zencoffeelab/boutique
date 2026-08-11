import { describe, expect, it } from "vitest";
import { shippingRateLabel, shippingRatePromotionLabel } from "~/domain/shipping-rate-label";
import type { ShippingRate } from "~/domain/types";

function rate(deliveryMethod: "home" | "pickup" = "home"): ShippingRate {
  return {
    id: "rate-1", provider: "shippo", carrier: "Colissimo", service: "Internal Shippo service", deliveryMethod,
    amountCents: 625, currency: "EUR", estimatedDays: 2, freeShippingApplied: false,
  };
}

describe("checkout shipping rate labels", () => {
  it("uses explicit bilingual Colissimo labels", () => {
    expect(shippingRateLabel(rate("home"), "fr-FR")).toBe("Colissimo — Domicile");
    expect(shippingRateLabel(rate("pickup"), "fr-FR")).toBe("Colissimo — Point Retrait");
    expect(shippingRateLabel(rate("home"), "en-GB")).toBe("Colissimo — Home Delivery");
    expect(shippingRateLabel(rate("pickup"), "en-GB")).toBe("Colissimo — Pickup Point");
  });

  it("labels only rates receiving free shipping", () => {
    expect(shippingRatePromotionLabel(rate(), "fr-FR")).toBeNull();
    expect(shippingRatePromotionLabel({ ...rate(), freeShippingApplied: true }, "fr-FR")).toBe("Offert");
    expect(shippingRatePromotionLabel({ ...rate(), freeShippingApplied: true }, "en-GB")).toBe("Free");
  });
});
