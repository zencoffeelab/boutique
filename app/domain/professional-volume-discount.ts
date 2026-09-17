export const professionalVolumeDiscount = (weightGrams: number) => {
  if (weightGrams >= 60_000) return 30;
  if (weightGrams >= 30_000) return 25;
  if (weightGrams >= 15_000) return 20;
  if (weightGrams >= 5_000) return 15;
  if (weightGrams >= 1_000) return 10;
  return 0;
};

export function professionalVolumePricing(lines: readonly { quantity: number; unitWeightGrams: number; unitPriceCents: number }[], professional: boolean) {
  const subtotalBeforeDiscountCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const totalWeightGrams = lines.reduce((sum, line) => sum + line.quantity * line.unitWeightGrams, 0);
  const percent = professional ? professionalVolumeDiscount(totalWeightGrams) : 0;
  const discountCents = Math.round(subtotalBeforeDiscountCents * percent / 100);
  return { totalWeightGrams, percent, discountCents, subtotalBeforeDiscountCents, subtotalCents: subtotalBeforeDiscountCents - discountCents };
}
