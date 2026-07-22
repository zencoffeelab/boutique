import { describe, expect, it } from "vitest";
import { orderContentsLabel } from "~/routes/admin-orders";

describe("admin order summary", () => {
  it("shows each purchased coffee, format and quantity", () => {
    expect(orderContentsLabel([
      { quantity: 2, product_name: "Panama Finca Lorayne", variant_label: "200 g" },
      { quantity: 1, product_name: "Pérou El Laurel", variant_label: "1 kg" },
    ])).toBe("2 × Panama Finca Lorayne · 200 g | 1 × Pérou El Laurel · 1 kg");
  });

  it("handles an order without lines", () => {
    expect(orderContentsLabel([])).toBe("Aucun article");
  });
});
