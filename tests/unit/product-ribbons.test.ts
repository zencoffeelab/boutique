import { describe, expect, it } from "vitest";
import { getProductRibbons } from "~/lib/product-ribbons";

describe("product ribbons", () => {
  it("shows the last-stock ribbon below one kilogram", () => {
    expect(getProductRibbons({ stockOnHandGrams: 900, stockReservedGrams: 0, ribbonNew: false, ribbonBackSoon: false })).toEqual(["last-stock"]);
  });

  it("uses available stock and shows back soon under sold out", () => {
    expect(getProductRibbons({ stockOnHandGrams: 200, stockReservedGrams: 200, ribbonNew: true, ribbonBackSoon: true })).toEqual(["new", "sold-out", "back-soon"]);
  });

  it("does not show back soon while stock remains", () => {
    expect(getProductRibbons({ stockOnHandGrams: 2_000, stockReservedGrams: 0, ribbonNew: true, ribbonBackSoon: true })).toEqual(["new"]);
  });
});
