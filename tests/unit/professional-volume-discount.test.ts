import { describe, expect, it } from "vitest";
import { professionalVolumeDiscount, professionalVolumePricing } from "~/domain/professional-volume-discount";

describe("professional volume discount", () => {
  it.each([
    [999, 0], [1_000, 10], [5_000, 15], [15_000, 20], [30_000, 25], [60_000, 30],
  ])("uses %s g to apply %s%%", (weightGrams, percent) => {
    expect(professionalVolumeDiscount(weightGrams)).toBe(percent);
  });

  it("discounts the whole coffee subtotal for approved professional orders", () => {
    expect(professionalVolumePricing([
      { quantity: 2, unitWeightGrams: 1_000, unitPriceCents: 2_000 },
      { quantity: 3, unitWeightGrams: 1_000, unitPriceCents: 1_500 },
    ], true)).toEqual({
      totalWeightGrams: 5_000,
      percent: 15,
      discountCents: 1_275,
      subtotalBeforeDiscountCents: 8_500,
      subtotalCents: 7_225,
    });
  });

  it("does not apply the offer to retail orders", () => {
    expect(professionalVolumePricing([{ quantity: 1, unitWeightGrams: 60_000, unitPriceCents: 10_000 }], false).discountCents).toBe(0);
  });
});
