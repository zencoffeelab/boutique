import { describe, expect, it } from "vitest";
import { demoProducts } from "~/data/demo-catalog";
import { hasPurchasableVariant } from "~/lib/catalog.server";

describe("catalog availability", () => {
  it("shows a coffee when at least one active format can be ordered", () => {
    expect(hasPurchasableVariant(demoProducts[0], "retail")).toBe(true);
  });

  it("hides a coffee when every format has zero available stock", () => {
    const soldOut = {
      ...demoProducts[0],
      variants: demoProducts[0].variants.map((variant) => ({
        ...variant,
        stockOnHand: variant.stockReserved,
      })),
    };

    expect(hasPurchasableVariant(soldOut, "retail")).toBe(false);
  });

  it("respects the professional minimum quantity", () => {
    const product = demoProducts.find((candidate) => candidate.variants.some((variant) => variant.offers.some((offer) => offer.audience === "professional")))!;
    const belowMinimum = {
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        stockOnHand: variant.offers.some((offer) => offer.audience === "professional") ? 4 : variant.stockOnHand,
        stockReserved: 0,
      })),
    };

    expect(hasPurchasableVariant(belowMinimum, "professional")).toBe(false);
  });
});
