import { describe, expect, it } from "vitest";
import {
  adjustShippingPrice,
  DEFAULT_SHIPPING_PRICE_RULE,
  roundCommercialPriceCents,
  SHIPPING_ZONE_COUNTRIES,
  shippingZoneForCountry,
} from "~/domain/shipping-pricing";
import { SHIPPING_COUNTRY_CODES } from "~/domain/shipping-countries";

describe("progressive shipping pricing", () => {
  it("maps the 27 EU countries to the four historical geographic zones", () => {
    expect(shippingZoneForCountry("FR")).toBe(1);
    expect(["DE", "BE", "LU", "NL"].map(shippingZoneForCountry)).toEqual(Array(4).fill(2));
    expect(["AT", "DK", "ES", "FI", "IE", "IT", "PL", "PT", "SE"].map(shippingZoneForCountry)).toEqual(Array(9).fill(3));
    expect(["BG", "HR", "EE", "GR", "HU", "LV", "LT", "RO", "SK", "SI", "CZ", "CY", "MT"].map(shippingZoneForCountry)).toEqual(Array(13).fill(4));
    expect(Object.values(SHIPPING_ZONE_COUNTRIES).flat().toSorted()).toEqual([...SHIPPING_COUNTRY_CODES].toSorted());
    expect(shippingZoneForCountry("GB")).toBeNull();
  });

  it("rounds to the closest .00, .50 or .90 commercial ending", () => {
    expect(roundCommercialPriceCents(545)).toBe(550);
    expect(roundCommercialPriceCents(582)).toBe(590);
    expect(roundCommercialPriceCents(596)).toBe(600);
    expect(roundCommercialPriceCents(575)).toBe(590);
  });

  it("increases the discount percentage with both zone and total weight", () => {
    const zone1Light = adjustShippingPrice({ amountCents: 10_000, countryCode: "FR", totalWeightGrams: 500, rule: DEFAULT_SHIPPING_PRICE_RULE });
    const zone2Light = adjustShippingPrice({ amountCents: 10_000, countryCode: "DE", totalWeightGrams: 500, rule: DEFAULT_SHIPPING_PRICE_RULE });
    const zone4Light = adjustShippingPrice({ amountCents: 10_000, countryCode: "CY", totalWeightGrams: 500, rule: DEFAULT_SHIPPING_PRICE_RULE });
    const zone4Heavy = adjustShippingPrice({ amountCents: 10_000, countryCode: "CY", totalWeightGrams: 23_000, rule: DEFAULT_SHIPPING_PRICE_RULE });

    expect(zone1Light.discountBasisPoints).toBe(1_000);
    expect(zone2Light.discountBasisPoints).toBe(1_250);
    expect(zone4Light.discountBasisPoints).toBe(1_750);
    expect(zone4Heavy.discountBasisPoints).toBe(2_500);
  });

  it("guarantees the low and high reduction targets before commercial rounding", () => {
    const low = adjustShippingPrice({ amountCents: 878, countryCode: "FR", totalWeightGrams: 500, rule: DEFAULT_SHIPPING_PRICE_RULE });
    const high = adjustShippingPrice({ amountCents: 10_000, countryCode: "MT", totalWeightGrams: 23_000, rule: DEFAULT_SHIPPING_PRICE_RULE });

    expect(low).toMatchObject({ zone: 1, targetDiscountCents: 100, amountCents: 750, discountCents: 128 });
    expect(high).toMatchObject({ zone: 4, targetDiscountCents: 2_300, amountCents: 7_700, discountCents: 2_300 });
  });
});
