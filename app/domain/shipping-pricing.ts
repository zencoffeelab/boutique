import type { ShippingCountryCode } from "./shipping-countries";

export type ShippingZone = 1 | 2 | 3 | 4;

export const SHIPPING_ZONE_COUNTRIES: Readonly<Record<ShippingZone, readonly ShippingCountryCode[]>> = {
  1: ["FR"],
  2: ["DE", "BE", "LU", "NL"],
  3: ["AT", "DK", "ES", "FI", "IE", "IT", "PL", "PT", "SE"],
  4: ["BG", "HR", "EE", "GR", "HU", "LV", "LT", "RO", "SK", "SI", "CZ", "CY", "MT"],
};

const countryZones = new Map<string, ShippingZone>(
  (Object.entries(SHIPPING_ZONE_COUNTRIES) as Array<[`${ShippingZone}`, readonly ShippingCountryCode[]]>)
    .flatMap(([zone, countries]) => countries.map((country) => [country, Number(zone) as ShippingZone] as const)),
);

export type ShippingPriceRule = Readonly<{
  minimumWeightGrams: number;
  maximumWeightGrams: number;
  minimumDiscountCents: number;
  maximumDiscountCents: number;
  minimumDiscountBasisPoints: number;
  maximumDiscountBasisPoints: number;
}>;

export const DEFAULT_SHIPPING_PRICE_RULE: ShippingPriceRule = {
  minimumWeightGrams: 500,
  maximumWeightGrams: 23_000,
  minimumDiscountCents: 100,
  maximumDiscountCents: 2_300,
  minimumDiscountBasisPoints: 1_000,
  maximumDiscountBasisPoints: 2_500,
};

export type ShippingPriceAdjustment = Readonly<{
  zone: ShippingZone;
  discountBasisPoints: number;
  targetDiscountCents: number;
  discountCents: number;
  amountCents: number;
}>;

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function normalizeShippingPriceRule(value: unknown): ShippingPriceRule {
  if (!value || typeof value !== "object") return DEFAULT_SHIPPING_PRICE_RULE;
  const rule = value as Partial<ShippingPriceRule>;
  if (
    !isNonNegativeInteger(rule.minimumWeightGrams)
    || !isNonNegativeInteger(rule.maximumWeightGrams)
    || !isNonNegativeInteger(rule.minimumDiscountCents)
    || !isNonNegativeInteger(rule.maximumDiscountCents)
    || !isNonNegativeInteger(rule.minimumDiscountBasisPoints)
    || !isNonNegativeInteger(rule.maximumDiscountBasisPoints)
    || rule.minimumWeightGrams <= 0
    || rule.maximumWeightGrams <= rule.minimumWeightGrams
    || rule.maximumDiscountCents < rule.minimumDiscountCents
    || rule.maximumDiscountBasisPoints < rule.minimumDiscountBasisPoints
    || rule.maximumDiscountBasisPoints > 10_000
  ) return DEFAULT_SHIPPING_PRICE_RULE;
  return rule as ShippingPriceRule;
}

export function shippingZoneForCountry(countryCode: string): ShippingZone | null {
  return countryZones.get(countryCode.toUpperCase()) ?? null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundCommercialPriceCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const amount = Math.round(amountCents);
  const euro = Math.floor(amount / 100) * 100;
  const candidates = [euro, euro + 50, euro + 90, euro + 100];
  return candidates.toSorted((left, right) => {
    const difference = Math.abs(left - amount) - Math.abs(right - amount);
    return difference || right - left;
  })[0];
}

function commercialPriceAtOrBelow(amountCents: number): number {
  if (amountCents <= 0) return 0;
  const amount = Math.floor(amountCents);
  const euro = Math.floor(amount / 100) * 100;
  return [euro + 90, euro + 50, euro]
    .filter((candidate) => candidate <= amount)
    .toSorted((left, right) => right - left)[0] ?? Math.max(0, euro - 10);
}

export function adjustShippingPrice(input: {
  amountCents: number;
  countryCode: string;
  totalWeightGrams: number;
  rule: ShippingPriceRule;
}): ShippingPriceAdjustment {
  const zone = shippingZoneForCountry(input.countryCode);
  if (zone === null) throw new Error("Ce pays ne possède pas de zone tarifaire.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new RangeError("Le tarif transporteur est invalide.");
  if (!Number.isSafeInteger(input.totalWeightGrams) || input.totalWeightGrams <= 0) throw new RangeError("Le poids total expédié est invalide.");

  const rule = normalizeShippingPriceRule(input.rule);
  const zoneProgress = (zone - 1) / 3;
  const weightProgress = clamp(
    (input.totalWeightGrams - rule.minimumWeightGrams) / (rule.maximumWeightGrams - rule.minimumWeightGrams),
    0,
    1,
  );
  const progress = (zoneProgress + weightProgress) / 2;
  const discountBasisPoints = Math.round(
    rule.minimumDiscountBasisPoints
      + (rule.maximumDiscountBasisPoints - rule.minimumDiscountBasisPoints) * progress,
  );
  let targetDiscountCents = Math.round(input.amountCents * discountBasisPoints / 10_000);
  targetDiscountCents = clamp(targetDiscountCents, rule.minimumDiscountCents, rule.maximumDiscountCents);
  if (zone === 1 && input.totalWeightGrams <= rule.minimumWeightGrams) {
    targetDiscountCents = rule.minimumDiscountCents;
  }
  if (zone === 4 && input.totalWeightGrams >= rule.maximumWeightGrams) {
    targetDiscountCents = rule.maximumDiscountCents;
  }
  targetDiscountCents = Math.min(targetDiscountCents, input.amountCents);

  const discountedAmount = input.amountCents - targetDiscountCents;
  let amountCents = roundCommercialPriceCents(discountedAmount);
  if (input.amountCents - amountCents < targetDiscountCents) {
    amountCents = commercialPriceAtOrBelow(discountedAmount);
  }
  amountCents = clamp(amountCents, 0, input.amountCents);
  return {
    zone,
    discountBasisPoints,
    targetDiscountCents,
    discountCents: input.amountCents - amountCents,
    amountCents,
  };
}
