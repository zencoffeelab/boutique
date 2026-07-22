import { describe, expect, it } from "vitest";
import type { PackedParcel, ResolvedCartLine } from "~/domain/types";
import { buildCustomsDeclaration } from "~/services/shipping.server";

const line: ResolvedCartLine = {
  productId: "product-panama",
  productSlug: "panama",
  productName: "Panama Finca Lorayne",
  variantId: "panama-200",
  variantLabel: "200 g",
  audience: "retail",
  quantity: 2,
  unitPriceCents: 1_300,
  unitCostCents: 500,
  unitWeightGrams: 200,
  hsCode: "090121",
  customsOriginCountry: "PA",
  availableStock: 10,
  imageUrl: "/panama.jpg",
};

const parcel: PackedParcel = {
  presetId: "small",
  presetName: "Small",
  netWeightGrams: 400,
  shippingWeightGrams: 580,
  lengthCm: 25,
  widthCm: 18,
  heightCm: 8,
  lines: [{ variantId: line.variantId, quantity: 2, unitWeightGrams: 200 }],
};

describe("Shippo customs declaration", () => {
  it("uses Shippo's certifier field and total customs weight and value", () => {
    const declaration = buildCustomsDeclaration(parcel, [line], "Zen Coffee Lab");

    expect(declaration).toMatchObject({
      certify: true,
      certify_signer: "Zen Coffee Lab",
      contents_type: "MERCHANDISE",
      non_delivery_option: "RETURN",
      incoterm: "DDU",
      items: [{
        quantity: 2,
        net_weight: "400",
        value_amount: "26.00",
        value_currency: "EUR",
        tariff_number: "090121",
        origin_country: "PA",
      }],
    });
    expect(declaration).not.toHaveProperty("certifier");
    expect(declaration).not.toHaveProperty("eel_pfc");
  });
});
