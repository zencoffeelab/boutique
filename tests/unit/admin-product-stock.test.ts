import { describe, expect, it } from "vitest";
import { adjustProductStockGrams } from "~/routes/admin-product";

describe("admin product stock synchronization", () => {
  it("adjusts the coffee total by the edited variant delta", () => {
    expect(adjustProductStockGrams({
      currentStockGrams: 3_000,
      currentThresholdGrams: 750,
      previousStock: 4,
      previousWeightGrams: 250,
      previousThreshold: 1,
      nextStock: 6,
      nextWeightGrams: 250,
      nextThreshold: 2,
    })).toEqual({ stockOnHandGrams: 3_500, lowStockThresholdGrams: 1_000 });
  });

  it("replaces only the edited format contribution when its weight changes", () => {
    expect(adjustProductStockGrams({
      currentStockGrams: 5_000,
      currentThresholdGrams: 1_000,
      previousStock: 4,
      previousWeightGrams: 250,
      previousThreshold: 1,
      nextStock: 2,
      nextWeightGrams: 1_000,
      nextThreshold: 1,
    })).toEqual({ stockOnHandGrams: 6_000, lowStockThresholdGrams: 1_750 });
  });
});
