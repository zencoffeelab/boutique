import { Buffer } from "node:buffer";
import type { Locale, PickupPoint } from "~/domain/types";
import { env } from "~/lib/env.server";

const SERVICE_POINTS_ENDPOINT = "https://servicepoints.sendcloud.sc/api/v2/service-points";

type SendcloudServicePoint = {
  id?: unknown;
  is_active?: unknown;
  name?: unknown;
  street?: unknown;
  house_number?: unknown;
  postal_code?: unknown;
  city?: unknown;
  country?: unknown;
  carrier?: unknown;
  shop_type?: unknown;
  general_shop_type?: unknown;
  distance?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function authorization(): string {
  const config = env();
  if (!config.SENDCLOUD_PUBLIC_KEY || !config.SENDCLOUD_SECRET_KEY) throw new Error("Sendcloud service points are not configured.");
  return `Basic ${Buffer.from(`${config.SENDCLOUD_PUBLIC_KEY}:${config.SENDCLOUD_SECRET_KEY}`).toString("base64")}`;
}

function pointTypeLabel(value: string, locale: Locale): string {
  if (value === "locker") return locale === "en-GB" ? "Locker" : "Consigne";
  if (value === "post_office") return locale === "en-GB" ? "Post office" : "Bureau de poste";
  return locale === "en-GB" ? "Pickup point" : "Point relais";
}

function mapPoint(value: unknown, locale: Locale): PickupPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as SendcloudServicePoint;
  const id = asText(point.id);
  const name = asText(point.name);
  const carrier = asText(point.carrier);
  const countryCode = asText(point.country).toUpperCase();
  if (!/^\d+$/.test(id) || !name || !carrier || !countryCode || point.is_active === false) return null;
  const type = asText(point.general_shop_type) || asText(point.shop_type) || "servicepoint";
  return {
    id,
    name,
    address1: [asText(point.house_number), asText(point.street)].filter(Boolean).join(" "),
    address2: "",
    address3: "",
    postalCode: asText(point.postal_code),
    city: asText(point.city),
    countryCode,
    type,
    network: carrier,
    locationHint: pointTypeLabel(type, locale),
    distanceMeters: finiteNumber(point.distance),
    latitude: finiteNumber(point.latitude),
    longitude: finiteNumber(point.longitude),
    accessible: false,
    maxWeightGrams: null,
  };
}

function mockPoints(input: { locale: Locale; address: { postalCode: string; city: string; countryCode: string } }): PickupPoint[] {
  const common = {
    address2: "", address3: "", postalCode: input.address.postalCode, city: input.address.city,
    countryCode: input.address.countryCode, latitude: null, longitude: null, accessible: false, maxWeightGrams: null,
  };
  return [
    { ...common, id: "100001", name: "Point Relais démo", address1: "1 rue du Café", type: "servicepoint", network: "mondial_relay", locationHint: input.locale === "en-GB" ? "Pickup point" : "Point relais", distanceMeters: 250 },
    { ...common, id: "100002", name: "Consigne démo", address1: "2 rue du Café", type: "locker", network: "mondial_relay", locationHint: input.locale === "en-GB" ? "Locker" : "Consigne", distanceMeters: 600 },
  ];
}

export function pickupPointsConfigured(): boolean {
  const config = env();
  return config.SHIPPING_MOCK || Boolean(config.SENDCLOUD_PUBLIC_KEY && config.SENDCLOUD_SECRET_KEY);
}

export async function searchPickupPoints(input: { locale: Locale; address: { line1: string; line2?: string; postalCode: string; city: string; countryCode: string }; weightGrams: number }): Promise<PickupPoint[]> {
  if (env().SHIPPING_MOCK) return mockPoints(input);
  const url = new URL(SERVICE_POINTS_ENDPOINT);
  url.search = new URLSearchParams({
    country: input.address.countryCode,
    address: `${input.address.postalCode} ${input.address.city}`.trim(),
    radius: "15000",
  }).toString();
  const response = await fetch(url, { headers: { authorization: authorization(), accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  const data = await response.json().catch(() => null) as unknown;
  if (!response.ok || !Array.isArray(data)) throw new Error(`Sendcloud service-point search failed (${response.status}).`);
  return data
    .map((point) => mapPoint(point, input.locale))
    .filter((point): point is PickupPoint => point !== null && point.countryCode === input.address.countryCode && point.network === "mondial_relay")
    .toSorted((left, right) => (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (right.distanceMeters ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 12);
}

export async function getPickupPointById(input: { id: string; locale: Locale; countryCode: string }): Promise<PickupPoint> {
  if (env().SHIPPING_MOCK) {
    const point = mockPoints({ locale: input.locale, address: { postalCode: "37000", city: "Tours", countryCode: input.countryCode } }).find((candidate) => candidate.id === input.id);
    if (!point) throw new Error("Pickup point is not available.");
    return point;
  }
  if (!/^\d+$/.test(input.id)) throw new Error("Invalid Sendcloud service-point identifier.");
  const headers = { authorization: authorization(), accept: "application/json" };
  const [detailResponse, availabilityResponse] = await Promise.all([
    fetch(`${SERVICE_POINTS_ENDPOINT}/${encodeURIComponent(input.id)}`, { headers, signal: AbortSignal.timeout(10_000) }),
    fetch(`${SERVICE_POINTS_ENDPOINT}/${encodeURIComponent(input.id)}/check-availability`, { headers, signal: AbortSignal.timeout(10_000) }),
  ]);
  const [detail, available] = await Promise.all([
    detailResponse.json().catch(() => null),
    availabilityResponse.json().catch(() => false),
  ]);
  const point = mapPoint(detail, input.locale);
  if (!detailResponse.ok || !availabilityResponse.ok || available !== true || !point || point.id !== input.id || point.countryCode !== input.countryCode || point.network !== "mondial_relay") {
    throw new Error("Pickup point is not available.");
  }
  return point;
}
