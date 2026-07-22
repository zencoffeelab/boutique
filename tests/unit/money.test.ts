import { describe, expect, it } from "vitest";
import { assertCents, calculateContribution, formatSignedMoney, freeShippingThresholdCents, multiplyCents } from "~/domain/money";

describe("integer money", () => {
  it("rejects fractional and negative amounts", () => {
    expect(() => assertCents(10.5)).toThrow();
    expect(() => assertCents(-1)).toThrow();
  });
  it("multiplies cents without floating point arithmetic", () => expect(multiplyCents(1_300, 3)).toBe(3_900));
  it("calculates order contribution from frozen costs", () => expect(calculateContribution({ productRevenueCents: 10_000, shippingChargedCents: 700, costOfGoodsCents: 4_000, actualShippingCostCents: 650, stripeFeeCents: 250 })).toBe(5_800));
  it("formats a negative contribution without hiding it", () => expect(formatSignedMoney(-250, "fr-FR")).toContain("2,50"));
  it("applies the configured free-shipping thresholds", () => {
    expect(freeShippingThresholdCents("FR")).toBe(7_500);
    expect(freeShippingThresholdCents("DE")).toBe(15_000);
    expect(freeShippingThresholdCents("GB")).toBe(15_000);
    expect(freeShippingThresholdCents("US")).toBeNull();
  });
});
