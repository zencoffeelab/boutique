import type { Money } from "./types";
import { SHIPPING_COUNTRY_CODES } from "./shipping-countries";

export function assertCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("A monetary amount must be a non-negative integer in cents.");
  }
  return value;
}

export function euros(amount: number): Money {
  return { amount: assertCents(amount), currency: "EUR" };
}

export function multiplyCents(unitAmount: number, quantity: number): number {
  assertCents(unitAmount);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError("Quantity must be a non-negative integer.");
  }
  return assertCents(unitAmount * quantity);
}

export function formatMoney(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(assertCents(cents) / 100);
}

export function formatSignedMoney(cents: number, locale: string): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError("A signed monetary amount must be an integer in cents.");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function calculateContribution(input: {
  productRevenueCents: number;
  shippingChargedCents: number;
  costOfGoodsCents: number;
  actualShippingCostCents: number;
  stripeFeeCents: number;
}): number {
  for (const value of Object.values(input)) assertCents(value);
  return (
    input.productRevenueCents +
    input.shippingChargedCents -
    input.costOfGoodsCents -
    input.actualShippingCostCents -
    input.stripeFeeCents
  );
}

export function freeShippingThresholdCents(countryCode: string, thresholds = { fr: 7_500, euUk: 15_000 }): number | null {
  if (countryCode.toUpperCase() === "FR") return thresholds.fr;
  const euAndUk = new Set<string>(SHIPPING_COUNTRY_CODES);
  return euAndUk.has(countryCode.toUpperCase()) ? thresholds.euUk : null;
}
