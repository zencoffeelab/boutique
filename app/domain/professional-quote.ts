import type { Product, ProductVariant, VariantOffer } from "~/domain/types";

export const professionalQuoteValidityDays = 30;

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
