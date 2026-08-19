import { describe, expect, it } from "vitest";
import { getProductRibbons } from "~/lib/product-ribbons";

describe("product ribbons", () => {
  it("shows the last-stock ribbon below one kilogram", () => {
    expect(getProductRibbons({ stockOnHandGrams: 900, ribbonNew: false, ribbonBackSoon: false })).toEqual(["last-stock"]);
  });

  it("shows back soon under sold out when on-hand stock reaches zero", () => {
    expect(getProductRibbons({ stockOnHandGrams: 0, ribbonNew: true, ribbonBackSoon: true })).toEqual(["new", "sold-out", "back-soon"]);
  });

  it("does not show back soon while stock remains", () => {
    expect(getProductRibbons({ stockOnHandGrams: 2_000, ribbonNew: true, ribbonBackSoon: true })).toEqual(["new"]);
  });
});
