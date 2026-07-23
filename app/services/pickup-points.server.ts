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

function asText(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}

function mapPoint(value: unknown): PickupPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as ColissimoPoint; const id = asText(point.identifiant); const name = asText(point.nom);
  if (!id || !name || point.congesTotal === true) return null;
  return {
    id, name, address1: asText(point.adresse1), address2: asText(point.adresse2), address3: asText(point.adresse3),
    postalCode: asText(point.codePostal), city: asText(point.localite), countryCode: asText(point.codePays) || "FR",
    type: asText(point.typeDePoint), network: asText(point.reseau), locationHint: asText(point.indiceDeLocalisation),
    distanceMeters: finiteNumber(point.distanceEnMetre), latitude: finiteNumber(point.coordGeolocalisationLatitude),
    longitude: finiteNumber(point.coordGeolocalisationLongitude), accessible: point.accesPersonneMobiliteReduite === true,
    maxWeightGrams: finiteNumber(point.poidsMaxi),
  };
}

function estimatedShippingDate(): string {
  const date = new Date(); date.setDate(date.getDate() + 1);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }).format(date);
}

async function postColissimo(endpoint: string, body: Record<string, unknown>): Promise<ColissimoResponse> {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
  const data = await response.json().catch(() => null) as ColissimoResponse | null;
  if (!response.ok || !data || Number(data.errorCode) !== 0) {
    const detail = data ? asText(data.errorMessage) : "";
    throw new Error(detail ? `Colissimo pickup lookup failed: ${detail}` : `Colissimo pickup lookup failed (${response.status}).`);
  }
  return data;
}

function credentials() {
  const config = env();
  if (!config.COLISSIMO_PICKUP_API_KEY) throw new Error("Colissimo pickup lookup is not configured.");
  return { apiKey: config.COLISSIMO_PICKUP_API_KEY, partnerCode: config.COLISSIMO_PICKUP_PARTNER_CLIENT_CODE };
}

export function pickupPointsConfigured(): boolean {
  return false;
}

export async function searchPickupPoints(input: { locale: Locale; address: { line1: string; line2?: string; postalCode: string; city: string; countryCode: string }; weightGrams: number }): Promise<PickupPoint[]> {
  if (input.address.countryCode !== "FR") return [];
  const { apiKey, partnerCode } = credentials();
  const data = await postColissimo(SEARCH_ENDPOINT, {
    apiKey, ...(partnerCode ? { codTiersPourPartenaire: partnerCode } : {}),
    address: [input.address.line1, input.address.line2].filter(Boolean).join(" "), zipCode: input.address.postalCode,
    city: input.address.city, countryCode: "FR", weight: String(input.weightGrams), shippingDate: estimatedShippingDate(),
    filterRelay: "1", requestId: crypto.randomUUID().replaceAll("-", ""), lang: "FR", optionInter: "0", origin: "CMS",
  });
  const points = Array.isArray(data.listePointRetraitAcheminement) ? data.listePointRetraitAcheminement : [];
  return points.map(mapPoint).filter((point): point is PickupPoint => Boolean(point)).slice(0, 12);
}

export async function getPickupPointById(input: { id: string; locale: Locale; weightGrams: number }): Promise<PickupPoint> {
  const { apiKey, partnerCode } = credentials();
  const data = await postColissimo(DETAIL_ENDPOINT, {
    apikey: apiKey, ...(partnerCode ? { codTiersPourPartenaire: partnerCode } : {}), id: input.id,
    weight: String(input.weightGrams), date: estimatedShippingDate(), filterRelay: "1", reseau: "", langue: "FR",
  });
  const point = mapPoint(data.pointRetraitAcheminement);
  if (!point || point.id !== input.id || point.countryCode !== "FR") throw new Error("Pickup point is not available.");
  if (point.maxWeightGrams !== null && point.maxWeightGrams < input.weightGrams) throw new Error("Pickup point does not accept this parcel weight.");
  return point;
}
