import { describe, expect, it } from "vitest";
import { packCartByWeight } from "~/domain/packing";
import type { PackagingPreset } from "~/domain/types";

const presets: PackagingPreset[] = [
  { id: "small", name: "Small", maxNetWeightGrams: 1_000, tareWeightGrams: 180, lengthCm: 20, widthCm: 20, heightCm: 10, active: true },
  { id: "large", name: "Large", maxNetWeightGrams: 5_000, tareWeightGrams: 400, lengthCm: 40, widthCm: 30, heightCm: 20, active: true },
];

describe("deterministic parcel packing", () => {
  it("uses the smallest suitable package", () => {
    const parcels = packCartByWeight([{ variantId: "coffee-200", quantity: 3, unitWeightGrams: 200 }], presets);
    expect(parcels).toHaveLength(1); expect(parcels[0]).toMatchObject({ presetId: "small", netWeightGrams: 600, shippingWeightGrams: 780 });
  });
  it("splits a large professional order across parcels", () => {
    const parcels = packCartByWeight([{ variantId: "coffee-1kg", quantity: 11, unitWeightGrams: 1_000 }], presets);
    expect(parcels.map((parcel) => parcel.netWeightGrams)).toEqual([5_000, 5_000, 1_000]);
  });
  it("produces identical output regardless of line order", () => {
    const first = packCartByWeight([{ variantId: "b", quantity: 2, unitWeightGrams: 1_000 }, { variantId: "a", quantity: 5, unitWeightGrams: 200 }], presets);
    const second = packCartByWeight([{ variantId: "a", quantity: 5, unitWeightGrams: 200 }, { variantId: "b", quantity: 2, unitWeightGrams: 1_000 }], presets);
    expect(first).toEqual(second);
  });
  it("rejects a unit that no configured package can carry", () => expect(() => packCartByWeight([{ variantId: "oversize", quantity: 1, unitWeightGrams: 6_000 }], presets)).toThrow());
});
