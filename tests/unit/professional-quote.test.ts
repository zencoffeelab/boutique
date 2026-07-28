import { describe, expect, it } from "vitest";
import { demoProducts } from "~/data/demo-catalog";
import {
  buildVariantOffers,
  discountedProfessionalPrice,
  getProfessionalQuoteVariant,
  professionalDiscountPercent,
} from "~/domain/professional-quote";

describe("professional quote pricing", () => {
  it("automatically adds a professional offer when the product is enabled", () => {
    expect(buildVariantOffers({
      variantId: "variant-1",
      retailPriceCents: 6750,
      productProfessionalEnabled: true,
    })).toEqual([
      { variant_id: "variant-1", audience: "retail", price_cents: 6750, minimum_quantity: 1, active: true },
      { variant_id: "variant-1", audience: "professional", price_cents: 6750, minimum_quantity: 1, active: true },
    ]);
  });

  it.each([
    [1, 0],
    [9, 0],
    [10, 10],
    [19, 10],
    [20, 20],
    [29, 20],
    [30, 30],
    [100, 30],
  ])("applies the capped tier to %s kg", (kilograms, expected) => {
    expect(professionalDiscountPercent(kilograms)).toBe(expected);
  });

  it("calculates each coffee line independently", () => {
    expect(discountedProfessionalPrice(2_000, 12)).toEqual({
      discountPercent: 10,
      unitPriceCents: 1_800,
      totalCents: 21_600,
    });
    expect(discountedProfessionalPrice(2_000, 25).discountPercent).toBe(20);
  });

  it("selects the lowest professional price normalized per kilogram", () => {
    const selection = getProfessionalQuoteVariant(demoProducts[0]);
    expect(selection?.offer.audience).toBe("professional");
    expect(selection?.basePriceCentsPerKg).toBeGreaterThan(0);
  });
});
