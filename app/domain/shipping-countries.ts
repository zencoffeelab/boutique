import type { Locale } from "./types";

export const EU_SHIPPING_COUNTRY_CODES = [
  "FR", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;

export const SHIPPING_COUNTRY_CODES = [...EU_SHIPPING_COUNTRY_CODES, "GB"] as const;

type ShippingCountryCode = (typeof SHIPPING_COUNTRY_CODES)[number];

const labels: Record<ShippingCountryCode, Record<Locale, string>> = {
  AT: { "fr-FR": "Autriche", "en-GB": "Austria" },
  BE: { "fr-FR": "Belgique", "en-GB": "Belgium" },
  BG: { "fr-FR": "Bulgarie", "en-GB": "Bulgaria" },
  HR: { "fr-FR": "Croatie", "en-GB": "Croatia" },
  CY: { "fr-FR": "Chypre", "en-GB": "Cyprus" },
  CZ: { "fr-FR": "Tchéquie", "en-GB": "Czechia" },
  DK: { "fr-FR": "Danemark", "en-GB": "Denmark" },
  EE: { "fr-FR": "Estonie", "en-GB": "Estonia" },
  FI: { "fr-FR": "Finlande", "en-GB": "Finland" },
  FR: { "fr-FR": "France", "en-GB": "France" },
  DE: { "fr-FR": "Allemagne", "en-GB": "Germany" },
  GR: { "fr-FR": "Grèce", "en-GB": "Greece" },
  HU: { "fr-FR": "Hongrie", "en-GB": "Hungary" },
  IE: { "fr-FR": "Irlande", "en-GB": "Ireland" },
  IT: { "fr-FR": "Italie", "en-GB": "Italy" },
  LV: { "fr-FR": "Lettonie", "en-GB": "Latvia" },
  LT: { "fr-FR": "Lituanie", "en-GB": "Lithuania" },
  LU: { "fr-FR": "Luxembourg", "en-GB": "Luxembourg" },
  MT: { "fr-FR": "Malte", "en-GB": "Malta" },
  NL: { "fr-FR": "Pays-Bas", "en-GB": "Netherlands" },
  PL: { "fr-FR": "Pologne", "en-GB": "Poland" },
  PT: { "fr-FR": "Portugal", "en-GB": "Portugal" },
  RO: { "fr-FR": "Roumanie", "en-GB": "Romania" },
  SK: { "fr-FR": "Slovaquie", "en-GB": "Slovakia" },
  SI: { "fr-FR": "Slovénie", "en-GB": "Slovenia" },
  ES: { "fr-FR": "Espagne", "en-GB": "Spain" },
  SE: { "fr-FR": "Suède", "en-GB": "Sweden" },
  GB: { "fr-FR": "Royaume-Uni", "en-GB": "United Kingdom" },
};

export function shippingCountryLabel(code: ShippingCountryCode, locale: Locale) {
  return labels[code][locale];
}
