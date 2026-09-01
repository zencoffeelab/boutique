export type ShippingZone = 1 | 2 | 3 | 4 | 5;
export type ConfiguredShippingService = "mondial_relay" | "fedex" | "fedex_signature" | "colissimo";
export type ShippingDeliveryMethod = "home" | "pickup";

export type ShippingTariff = readonly [number, number, number | null];
export type ShippingTariffs = Readonly<Record<ShippingZone, Partial<Record<ConfiguredShippingService, ShippingTariff>>>>;

export const DEFAULT_SHIPPING_TARIFFS: ShippingTariffs = {
  1: { mondial_relay: [390, 490, null], fedex: [950, 950, 950] },
  2: { mondial_relay: [450, 550, 750], fedex: [850, 850, 850], fedex_signature: [1150, 1150, 1150] },
  3: { mondial_relay: [650, 750, 950], fedex: [990, 990, 990], fedex_signature: [1290, 1290, 1290] },
  4: { fedex: [1190, 1190, 1190] },
  5: { colissimo: [1650, 1850, 2050] },
};

export const PICKUP_SHIPPING_COUNTRY_CODES = ["FR", "DE", "BE", "LU", "NL"] as const;

const countryZones: Readonly<Record<string, ShippingZone>> = {
  FR: 1,
  DE: 2, BE: 2, LU: 2, NL: 2,
  AT: 3, DK: 3, ES: 3, FI: 3, IE: 3, IT: 3, PL: 3, PT: 3, GB: 3, SE: 3,
  BG: 4, HR: 4, EE: 4, GR: 4, HU: 4, LV: 4, LT: 4, RO: 4, SK: 4, SI: 4, CH: 4, CZ: 4,
  CY: 5, LI: 5, MT: 5, NO: 5,
};

export const SHIPPING_COUNTRY_CODES = Object.freeze(Object.keys(countryZones));

const zoneServices: Readonly<Record<ShippingZone, readonly ConfiguredShippingService[]>> = {
  1: ["mondial_relay", "fedex"],
  2: ["mondial_relay", "fedex", "fedex_signature"],
  3: ["mondial_relay", "fedex", "fedex_signature"],
  4: ["fedex"],
  5: ["colissimo"],
};

function tierPrice(weightGrams: number, prices: readonly [number, number, number | null]) {
  if (weightGrams <= 1_000) return prices[0];
  if (weightGrams <= 2_000) return prices[1];
  return prices[2];
}

export function shippingZoneForCountry(countryCode: string): ShippingZone | null {
  return countryZones[countryCode.toUpperCase()] ?? null;
}

export function configuredShippingServices(countryCode: string): readonly ConfiguredShippingService[] {
  const zone = shippingZoneForCountry(countryCode);
  return zone === null ? [] : zoneServices[zone];
}

export function supportsPickupDelivery(countryCode: string) {
  return (PICKUP_SHIPPING_COUNTRY_CODES as readonly string[]).includes(countryCode.toUpperCase());
}

export function configuredShippingServicesForDelivery(countryCode: string, deliveryMethod: ShippingDeliveryMethod): readonly ConfiguredShippingService[] {
  const services = configuredShippingServices(countryCode);
  if (deliveryMethod === "pickup") return supportsPickupDelivery(countryCode) && services.includes("mondial_relay") ? ["mondial_relay"] : [];
  const zone = shippingZoneForCountry(countryCode);
  return zone === 1 || zone === 2 ? services.filter((service) => service !== "mondial_relay") : services;
}

export function customerShippingPriceCents(countryCode: string, service: ConfiguredShippingService, weightGrams: number, tariffs: ShippingTariffs = DEFAULT_SHIPPING_TARIFFS): number | null {
  const zone = shippingZoneForCountry(countryCode);
  if (zone === null || !zoneServices[zone].includes(service)) return null;
  const prices = tariffs[zone][service];
  return prices ? tierPrice(weightGrams, prices) : null;
}
