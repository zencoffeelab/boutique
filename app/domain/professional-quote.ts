import type { Product, ProductVariant, VariantOffer } from "~/domain/types";

export const professionalQuoteValidityDays = 30;

export function buildVariantOffers({
  variantId,
  retailPriceCents,
  productProfessionalEnabled,
  professionalRequested = false,
  professionalPriceCents,
  professionalMinimumQuantity = 1,
}: {
  variantId: string;
  retailPriceCents: number;
  productProfessionalEnabled: boolean;
  professionalRequested?: boolean;
  professionalPriceCents?: number;
  professionalMinimumQuantity?: number;
}) {
  const offers: Array<{
    variant_id: string;
    audience: "retail" | "professional";
    price_cents: number;
    minimum_quantity: number;
    active: boolean;
  }> = [{
    variant_id: variantId,
    audience: "retail",
    price_cents: retailPriceCents,
    minimum_quantity: 1,
    active: true,
  }];
  if (productProfessionalEnabled || professionalRequested) {
    offers.push({
      variant_id: variantId,
      audience: "professional",
      price_cents: professionalPriceCents && professionalPriceCents > 0 ? professionalPriceCents : retailPriceCents,
      minimum_quantity: professionalMinimumQuantity,
      active: true,
    });
  }
  return offers;
}

export function professionalDiscountPercent(kilograms: number): 0 | 10 | 20 | 30 {
  if (kilograms >= 30) return 30;
  if (kilograms >= 20) return 20;
  if (kilograms >= 10) return 10;
  return 0;
}

export function discountedProfessionalPrice(
  basePriceCentsPerKg: number,
  kilograms: number,
): { discountPercent: 0 | 10 | 20 | 30; unitPriceCents: number; totalCents: number } {
  const discountPercent = professionalDiscountPercent(kilograms);
  const unitPriceCents = Math.round(basePriceCentsPerKg * (100 - discountPercent) / 100);
  return { discountPercent, unitPriceCents, totalCents: unitPriceCents * kilograms };
}

export function professionalBasePricePerKg(
  variant: ProductVariant,
  offer: VariantOffer,
): number {
  return Math.round(offer.price.amount * 1_000 / variant.weightGrams);
}

export function getProfessionalQuoteVariant(product: Product): {
  variant: ProductVariant;
  offer: VariantOffer;
  basePriceCentsPerKg: number;
} | null {
  const options = product.variants.flatMap((variant) =>
    variant.offers
      .filter((offer) => offer.audience === "professional" && offer.active)
      .map((offer) => ({
        variant,
        offer,
        basePriceCentsPerKg: professionalBasePricePerKg(variant, offer),
      })),
  );
  return options.toSorted(
    (left, right) =>
      left.basePriceCentsPerKg - right.basePriceCentsPerKg ||
      Math.abs(left.variant.weightGrams - 1_000) - Math.abs(right.variant.weightGrams - 1_000),
  )[0] ?? null;
}
