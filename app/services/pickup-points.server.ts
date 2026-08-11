import { randomUUID } from "node:crypto";
import { isShippingCountry } from "~/domain/shipping-countries";
import type { Locale, PickupPoint } from "~/domain/types";
import { env } from "~/lib/env.server";

const SEARCH_ENDPOINT = "https://ws.colissimo.fr/pointretrait-ws-cxf/rest/v2/pointretrait/findRDVPointRetraitAcheminement";
const DETAIL_ENDPOINT = "https://ws.colissimo.fr/pointretrait-ws-cxf/rest/v2/pointretrait/findPointRetraitAcheminementByID";

type ColissimoPoint = {
  identifiant?: unknown;
  nom?: unknown;
  adresse1?: unknown;
  adresse2?: unknown;
  adresse3?: unknown;
  codePostal?: unknown;
  localite?: unknown;
  codePays?: unknown;
  typeDePoint?: unknown;
  reseau?: unknown;
  indiceDeLocalisation?: unknown;
  distanceEnMetre?: unknown;
  coordGeolocalisationLatitude?: unknown;
  coordGeolocalisationLongitude?: unknown;
  accesPersonneMobiliteReduite?: unknown;
  poidsMaxi?: unknown;
  congesTotal?: unknown;
};

type ColissimoResponse = {
  errorCode?: unknown;
  errorMessage?: unknown;
  listePointRetraitAcheminement?: unknown;
  pointRetraitAcheminement?: unknown;
};

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isClosed(value: unknown): boolean {
  return value === true || value === 1 || asText(value).toLowerCase() === "true";
}

function pointTypeLabel(type: string, locale: Locale): string {
  if (["BPR", "BDP"].includes(type)) return locale === "en-GB" ? "Post office" : "Bureau de poste";
  if (["CDI", "ACP"].includes(type)) return locale === "en-GB" ? "Locker" : "Consigne";
  return locale === "en-GB" ? "Pickup point" : "Point retrait";
}

function mapPoint(value: unknown, locale: Locale): PickupPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as ColissimoPoint;
  const id = asText(point.identifiant);
  const name = asText(point.nom);
  const countryCode = asText(point.codePays).toUpperCase();
  const type = asText(point.typeDePoint).toUpperCase();
  if (!/^\d{6}$/.test(id) || !name || !isShippingCountry(countryCode) || isClosed(point.congesTotal)) return null;
  return {
    id,
    name,
    address1: asText(point.adresse1),
    address2: asText(point.adresse2),
    address3: asText(point.adresse3),
    postalCode: asText(point.codePostal),
    city: asText(point.localite),
    countryCode,
    type,
    network: asText(point.reseau) || "Colissimo",
    locationHint: asText(point.indiceDeLocalisation) || pointTypeLabel(type, locale),
    distanceMeters: finiteNumber(point.distanceEnMetre),
    latitude: finiteNumber(point.coordGeolocalisationLatitude),
    longitude: finiteNumber(point.coordGeolocalisationLongitude),
    accessible: point.accesPersonneMobiliteReduite === true || asText(point.accesPersonneMobiliteReduite) === "1",
    maxWeightGrams: finiteNumber(point.poidsMaxi),
  };
}

function mockPoints(input: { locale: Locale; postalCode: string; city: string; countryCode: string }): PickupPoint[] {
  const common = {
    address2: "",
    address3: "",
    postalCode: input.postalCode,
    city: input.city,
    countryCode: input.countryCode,
    latitude: null,
    longitude: null,
    maxWeightGrams: 20_000,
  };
  return [
    {
      ...common,
      id: "370000",
      name: input.locale === "en-GB" ? "Colissimo Post Office" : "Bureau de poste Colissimo",
      address1: "1 rue du Café",
      type: "BPR",
      network: "R01",
      locationHint: pointTypeLabel("BPR", input.locale),
      distanceMeters: 250,
      accessible: true,
    },
    {
      ...common,
      id: "370001",
      name: input.locale === "en-GB" ? "Colissimo Pickup" : "Relais Colissimo",
      address1: "2 rue du Café",
      type: "A2P",
      network: "R03",
      locationHint: pointTypeLabel("A2P", input.locale),
      distanceMeters: 600,
      accessible: false,
    },
  ];
}

function estimatedShippingDate(): string {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}

function credentials() {
  const config = env();
  if (!config.COLISSIMO_PICKUP_API_KEY) throw new Error("L’annuaire Point Retrait Colissimo n’est pas configuré.");
  return {
    apiKey: config.COLISSIMO_PICKUP_API_KEY,
    partnerCode: config.COLISSIMO_PICKUP_PARTNER_CLIENT_CODE,
  };
}

async function postColissimo(endpoint: string, body: Record<string, unknown>): Promise<ColissimoResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as ColissimoResponse | null;
  if (!response.ok || !data || Number(data.errorCode) !== 0) {
    const detail = asText(data?.errorMessage);
    throw new Error(detail || `L’annuaire Point Retrait Colissimo a refusé la demande (${response.status}).`);
  }
  return data;
}

export function pickupPointsConfigured(): boolean {
  const config = env();
  return config.SHIPPING_MOCK || Boolean(config.COLISSIMO_PICKUP_API_KEY);
}

export async function searchPickupPoints(input: {
  locale: Locale;
  address: { line1: string; line2?: string; postalCode: string; city: string; countryCode: string };
  weightGrams: number;
}): Promise<PickupPoint[]> {
  const countryCode = input.address.countryCode.toUpperCase();
  if (!isShippingCountry(countryCode)) return [];
  if (env().SHIPPING_MOCK) return mockPoints({ ...input.address, locale: input.locale, countryCode });
  const { apiKey, partnerCode } = credentials();
  const data = await postColissimo(SEARCH_ENDPOINT, {
    apiKey,
    ...(partnerCode ? { codTiersPourPartenaire: partnerCode } : {}),
    address: [input.address.line1, input.address.line2].filter(Boolean).join(" "),
    zipCode: input.address.postalCode,
    city: input.address.city,
    countryCode,
    weight: String(input.weightGrams),
    shippingDate: estimatedShippingDate(),
    filterRelay: "1",
    requestId: randomUUID().replaceAll("-", ""),
    lang: input.locale === "en-GB" ? "EN" : "FR",
    optionInter: countryCode === "FR" ? "0" : "1",
    origin: "CMS",
  });
  const points = Array.isArray(data.listePointRetraitAcheminement) ? data.listePointRetraitAcheminement : [];
  return points
    .map((point) => mapPoint(point, input.locale))
    .filter((point): point is PickupPoint => point !== null
      && point.countryCode === countryCode
      && (point.maxWeightGrams === null || point.maxWeightGrams >= input.weightGrams))
    .toSorted((left, right) => (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (right.distanceMeters ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 12);
}

export async function getPickupPointById(input: {
  id: string;
  locale: Locale;
  countryCode: string;
  weightGrams: number;
}): Promise<PickupPoint> {
  const countryCode = input.countryCode.toUpperCase();
  if (!/^\d{6}$/.test(input.id) || !isShippingCountry(countryCode)) throw new Error("Identifiant Point Retrait Colissimo invalide.");
  if (env().SHIPPING_MOCK) {
    const point = mockPoints({ locale: input.locale, postalCode: "37000", city: "Tours", countryCode })
      .find((candidate) => candidate.id === input.id);
    if (!point || (point.maxWeightGrams !== null && point.maxWeightGrams < input.weightGrams)) throw new Error("Ce point retrait n’est pas disponible.");
    return point;
  }
  const { apiKey, partnerCode } = credentials();
  const data = await postColissimo(DETAIL_ENDPOINT, {
    apikey: apiKey,
    ...(partnerCode ? { codTiersPourPartenaire: partnerCode } : {}),
    id: input.id,
    weight: String(input.weightGrams),
    date: estimatedShippingDate(),
    filterRelay: "1",
    reseau: "",
    langue: input.locale === "en-GB" ? "EN" : "FR",
    countryCode,
    optionInter: countryCode === "FR" ? "0" : "1",
  });
  const point = mapPoint(data.pointRetraitAcheminement, input.locale);
  if (!point || point.id !== input.id || point.countryCode !== countryCode) throw new Error("Ce point retrait n’est pas disponible.");
  if (point.maxWeightGrams !== null && point.maxWeightGrams < input.weightGrams) throw new Error("Ce point retrait n’accepte pas le poids de ce colis.");
  return point;
}
