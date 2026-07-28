import { describe, expect, it } from "vitest";
import { productReturnLink } from "~/routes/product";

describe("product return navigation", () => {
  it("returns to the professional catalogue from a professional product", () => {
    expect(productReturnLink("fr-FR", "professional")).toEqual({
      href: "/professionnel",
      label: "Cafés professionnels",
    });
    expect(productReturnLink("en-GB", "professional")).toEqual({
      href: "/en/professional",
      label: "Professional coffees",
    });
  });

  it("keeps the regular shop return for a retail product", () => {
    expect(productReturnLink("fr-FR", "retail")).toEqual({
      href: "/boutique",
      label: "Tous les cafés",
    });
  });
});
