import { describe, expect, it } from "vitest";
import { configuredShippingServices, configuredShippingServicesForDelivery, customerShippingPriceCents, shippingZoneForCountry, supportsPickupDelivery } from "~/domain/shipping-zones";

describe("commercial shipping zones", () => {
  it("maps every configured country to the requested zone", () => {
    expect(["FR"].map(shippingZoneForCountry)).toEqual([1]);
    expect(["DE", "BE", "LU", "NL"].map(shippingZoneForCountry)).toEqual(Array(4).fill(2));
    expect(["AT", "DK", "ES", "FI", "IE", "IT", "PL", "PT", "GB", "SE"].map(shippingZoneForCountry)).toEqual(Array(10).fill(3));
    expect(["BG", "HR", "EE", "GR", "HU", "LV", "LT", "RO", "SK", "SI", "CH", "CZ"].map(shippingZoneForCountry)).toEqual(Array(12).fill(4));
    expect(["CY", "LI", "MT", "NO"].map(shippingZoneForCountry)).toEqual(Array(4).fill(5));
    expect(shippingZoneForCountry("US")).toBeNull();
  });

  it("keeps exactly the requested services in each zone", () => {
    expect(configuredShippingServices("FR")).toEqual(["mondial_relay", "fedex"]);
    expect(configuredShippingServices("DE")).toEqual(["mondial_relay", "fedex", "fedex_signature"]);
    expect(configuredShippingServices("ES")).toEqual(["mondial_relay", "fedex", "fedex_signature"]);
    expect(configuredShippingServices("CZ")).toEqual(["fedex"]);
    expect(configuredShippingServices("CY")).toEqual(["colissimo"]);
  });

  it("replaces Mondial Relay home with pickup delivery in Zone 2", () => {
    expect(configuredShippingServicesForDelivery("DE", "home")).toEqual(["fedex", "fedex_signature"]);
    expect(configuredShippingServicesForDelivery("DE", "pickup")).toEqual(["mondial_relay"]);
    expect(configuredShippingServicesForDelivery("FR", "home")).toEqual(["mondial_relay", "fedex"]);
    expect(["FR", "DE", "BE", "LU", "NL"].every(supportsPickupDelivery)).toBe(true);
    expect(supportsPickupDelivery("ES")).toBe(false);
  });

  it("applies every weight tier and flat price in cents", () => {
    expect([999, 1_000, 1_001, 2_000, 2_001].map((weight) => customerShippingPriceCents("FR", "mondial_relay", weight))).toEqual([390, 390, 490, 490, null]);
    expect([1_000, 1_001, 2_000, 2_001].map((weight) => customerShippingPriceCents("DE", "mondial_relay", weight))).toEqual([450, 550, 550, 750]);
    expect([1_000, 1_001, 2_000, 2_001].map((weight) => customerShippingPriceCents("ES", "mondial_relay", weight))).toEqual([650, 750, 750, 950]);
    expect(customerShippingPriceCents("FR", "fedex", 8_000)).toBe(950);
    expect(customerShippingPriceCents("DE", "fedex", 500)).toBe(850);
    expect(customerShippingPriceCents("DE", "fedex_signature", 500)).toBe(1_150);
    expect(customerShippingPriceCents("ES", "fedex", 500)).toBe(990);
    expect(customerShippingPriceCents("ES", "fedex_signature", 500)).toBe(1_290);
    expect(customerShippingPriceCents("CZ", "fedex", 500)).toBe(1_190);
    expect([1_000, 1_001, 2_000, 2_001].map((weight) => customerShippingPriceCents("CY", "colissimo", weight))).toEqual([1_650, 1_850, 1_850, 2_050]);
  });
});
