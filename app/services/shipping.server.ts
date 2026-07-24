import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { Audience, Locale, PackedParcel, PickupPoint, ResolvedCartLine, ShippingRate } from "~/domain/types";
import { packCartByWeight } from "~/domain/packing";
import { freeShippingThresholdCents } from "~/domain/money";
import { getPackagingPresets, resolveCartLines } from "~/lib/catalog.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { getPickupPointById } from "~/services/pickup-points.server";

export type QuoteAddress = {
  firstName: string; lastName: string; company?: string; email: string; phone: string;
  line1: string; line2?: string; postalCode: string; city: string; countryCode: string;
};

type StoredRate = ShippingRate & {
  sendcloudShippingOptionCodes: string[];
  sendcloudParcelAmountsCents: number[];
};
export type ShippingQuoteRecord = {
  id: string; cartId: string; locale: Locale; audience: Audience; address: QuoteAddress;
  lines: ResolvedCartLine[]; parcels: PackedParcel[]; rates: StoredRate[]; subtotalCents: number; expiresAt: string;
};

type SendcloudOption = {
  code?: unknown;
  name?: unknown;
  carrier?: { code?: unknown; name?: unknown };
  functionalities?: { last_mile?: unknown; tracked?: unknown; form_factor?: unknown };
  quotes?: Array<{ price?: { total?: { value?: unknown; currency?: unknown } }; lead_time?: unknown }>;
};

const localQuotes = new Map<string, ShippingQuoteRecord>();

function mockRates(parcels: PackedParcel[], subtotalCents: number, countryCode: string, pickupPoint?: PickupPoint): StoredRate[] {
  const totalWeight = parcels.reduce((sum, parcel) => sum + parcel.shippingWeightGrams, 0);
  const parcelSupplement = Math.max(0, parcels.length - 1) * 390;
  const baseEconomy = 490 + Math.ceil(totalWeight / 1000) * 110 + parcelSupplement;
  const config = env();
  const threshold = freeShippingThresholdCents(countryCode, { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS });
  const free = threshold !== null && subtotalCents >= threshold;
  if (pickupPoint) return [{
    id: randomUUID(), provider: "mock", carrier: "Mondial Relay", service: pickupPoint.type === "locker" ? "Consigne" : "Point Relais",
    deliveryMethod: "pickup", pickupPoint, amountCents: free ? 0 : Math.max(0, baseEconomy - 150), currency: "EUR",
    estimatedDays: 3, freeShippingApplied: free, sendcloudShippingOptionCodes: parcels.map(() => "mock:pickup"),
    sendcloudParcelAmountsCents: parcels.map((_, index) => index === 0 ? baseEconomy - parcelSupplement - 150 : 390),
  }];
  return [
    {
      id: randomUUID(), provider: "mock", carrier: "Colissimo", service: "Domicile", deliveryMethod: "home",
      amountCents: free ? 0 : baseEconomy, currency: "EUR", estimatedDays: countryCode === "FR" ? 2 : 5,
      freeShippingApplied: free, sendcloudShippingOptionCodes: parcels.map(() => "mock:home"),
      sendcloudParcelAmountsCents: parcels.map((_, index) => index === 0 ? baseEconomy - parcelSupplement : 390),
    },
    {
      id: randomUUID(), provider: "mock", carrier: "Mondial Relay", service: "Domicile", deliveryMethod: "home",
      amountCents: baseEconomy + 80, currency: "EUR", estimatedDays: 3, freeShippingApplied: false,
      sendcloudShippingOptionCodes: parcels.map(() => "mock:mondial-relay-home"),
      sendcloudParcelAmountsCents: parcels.map((_, index) => index === 0 ? baseEconomy - parcelSupplement + 80 : 390),
    },
    {
      id: randomUUID(), provider: "mock", carrier: "FedEx", service: "Priority", deliveryMethod: "home",
      amountCents: baseEconomy + 750, currency: "EUR", estimatedDays: 1, freeShippingApplied: false,
      sendcloudShippingOptionCodes: parcels.map(() => "mock:fedex-priority"),
      sendcloudParcelAmountsCents: parcels.map((_, index) => index === 0 ? baseEconomy - parcelSupplement + 750 : 390),
    },
  ];
}

function asText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function sendcloudAuthorization() {
  const config = env();
  if (!config.SENDCLOUD_PUBLIC_KEY || !config.SENDCLOUD_SECRET_KEY) throw new Error("Sendcloud is not configured.");
  return `Basic ${Buffer.from(`${config.SENDCLOUD_PUBLIC_KEY}:${config.SENDCLOUD_SECRET_KEY}`).toString("base64")}`;
}

function pickupLastMile(point: PickupPoint): "locker" | "service_point" {
  return point.type === "locker" ? "locker" : "service_point";
}

async function sendcloudOptionsForParcel(parcel: PackedParcel, address: QuoteAddress, pickupPoint?: PickupPoint): Promise<SendcloudOption[]> {
  const config = env();
  const expectedLastMile = pickupPoint ? pickupLastMile(pickupPoint) : "home_delivery";
  const servicePointId = pickupPoint ? Number(pickupPoint.id) : null;
  if (pickupPoint && !Number.isSafeInteger(servicePointId)) throw new Error("Invalid Sendcloud service-point identifier.");
  const response = await fetch("https://panel.sendcloud.sc/api/v3/shipping-options", {
    method: "POST",
    headers: { authorization: sendcloudAuthorization(), accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      from_address: {
        country_code: config.SHIP_FROM_COUNTRY, postal_code: config.SHIP_FROM_POSTAL_CODE,
        city: config.SHIP_FROM_CITY, address_line_1: config.SHIP_FROM_STREET1,
      },
      to_address: {
        country_code: address.countryCode, postal_code: address.postalCode,
        city: address.city, address_line_1: address.line1,
      },
      functionalities: { last_mile: expectedLastMile },
      ...(pickupPoint ? { carrier_code: pickupPoint.network, to_service_point: { id: servicePointId } } : {}),
      calculate_quotes: true,
      parcels: [{
        dimensions: { length: String(parcel.lengthCm), width: String(parcel.widthCm), height: String(parcel.heightCm), unit: "cm" },
        weight: { value: (parcel.shippingWeightGrams / 1000).toFixed(3), unit: "kg" },
      }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as { data?: SendcloudOption[]; errors?: Array<{ detail?: unknown }> } | null;
  if (!response.ok || !result) {
    const detail = result?.errors?.map((error) => asText(error.detail)).filter(Boolean).join(" · ");
    throw new Error(detail || `Sendcloud rate request failed (${response.status}).`);
  }
  return (result.data ?? []).filter((option) => {
    const code = asText(option.code);
    const lastMile = asText(option.functionalities?.last_mile);
    const carrierCode = asText(option.carrier?.code);
    return Boolean(code) && code !== "sendcloud:letter" && lastMile === expectedLastMile
      && option.functionalities?.tracked !== false && option.functionalities?.form_factor !== "mailbox"
      && (!pickupPoint || carrierCode === pickupPoint.network);
  });
}

async function sendcloudRates(parcels: PackedParcel[], address: QuoteAddress, subtotalCents: number, pickupPoint?: PickupPoint): Promise<StoredRate[]> {
  const config = env();
  const optionsByParcel = await Promise.all(parcels.map((parcel) => sendcloudOptionsForParcel(parcel, address, pickupPoint)));
  if (optionsByParcel.some((options) => options.length === 0)) throw new Error("No matching Sendcloud service is available for this parcel.");

  const byCode = new Map<string, SendcloudOption[][]>();
  optionsByParcel.forEach((options, parcelIndex) => options.forEach((option) => {
    const code = asText(option.code);
    const groups = byCode.get(code) ?? Array.from({ length: parcels.length }, () => [] as SendcloudOption[]);
    groups[parcelIndex].push(option);
    byCode.set(code, groups);
  }));

  const rates = [...byCode.entries()].flatMap(([code, groups]) => {
    if (!groups.every((options) => options[0])) return [];
    const parcelOptions = groups.map((options) => options[0]);
    const parcelQuotes = parcelOptions.map((option) => option.quotes?.find((quote) => asText(quote.price?.total?.currency).toUpperCase() === "EUR"));
    if (parcelQuotes.some((quote) => !quote)) return [];
    const parcelAmounts = parcelQuotes.map((quote) => Math.round(Number(quote?.price?.total?.value) * 100));
    if (parcelAmounts.some((amount) => !Number.isFinite(amount) || amount < 0)) return [];
    const leadTimes = parcelQuotes.map((quote) => Number(quote?.lead_time)).filter(Number.isFinite);
    return [{
      id: randomUUID(), provider: "sendcloud" as const,
      carrier: asText(parcelOptions[0].carrier?.name) || "Sendcloud",
      service: asText(parcelOptions[0].name) || "Standard",
      deliveryMethod: pickupPoint ? "pickup" as const : "home" as const,
      ...(pickupPoint ? { pickupPoint } : {}),
      amountCents: parcelAmounts.reduce((sum, amount) => sum + amount, 0),
      currency: "EUR" as const,
      estimatedDays: leadTimes.length ? Math.max(...leadTimes.map((hours) => Math.ceil(hours / 24))) : null,
      freeShippingApplied: false,
      sendcloudShippingOptionCodes: parcels.map(() => code),
      sendcloudParcelAmountsCents: parcelAmounts,
    }];
  });

  const sortedRates = rates.toSorted((left, right) => left.amountCents - right.amountCents || left.carrier.localeCompare(right.carrier));
  const threshold = freeShippingThresholdCents(address.countryCode, { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS });
  if (threshold !== null && subtotalCents >= threshold && rates.length) {
    const cheapest = sortedRates[0];
    return sortedRates.map((rate) => rate.id === cheapest.id ? { ...rate, amountCents: 0, freeShippingApplied: true } : rate);
  }
  return sortedRates;
}

async function storeQuote(quote: ShippingQuoteRecord) {
  const supabase = createServiceSupabase();
  if (!supabase) { localQuotes.set(quote.id, quote); return; }
  const { error } = await supabase.from("shipping_quotes").insert({ id: quote.id, cart_id: quote.cartId, locale: quote.locale, audience: quote.audience, address: quote.address, lines: quote.lines, parcels: quote.parcels, rates: quote.rates, subtotal_cents: quote.subtotalCents, expires_at: quote.expiresAt });
  if (error) throw new Error(`Unable to store shipping quote: ${error.message}`);
}

export async function createShippingQuote(input: { cartId: string; locale: Locale; audience: Audience; address: QuoteAddress; pickupPointId?: string; lines: { productId: string; variantId: string; audience: Audience; quantity: number }[] }) {
  const lines = await resolveCartLines(input.lines, input.locale, input.audience);
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const parcels = packCartByWeight(lines, await getPackagingPresets());
  const pickupPoint = input.pickupPointId ? await getPickupPointById({ id: input.pickupPointId, locale: input.locale, countryCode: input.address.countryCode }) : undefined;
  const rates = env().SHIPPING_MOCK
    ? mockRates(parcels, subtotalCents, input.address.countryCode, pickupPoint)
    : await sendcloudRates(parcels, input.address, subtotalCents, pickupPoint);
  if (rates.length === 0) throw new Error("No matching Sendcloud shipping service is available for all parcels.");
  const quote: ShippingQuoteRecord = { id: randomUUID(), cartId: input.cartId, locale: input.locale, audience: input.audience, address: input.address, lines, parcels, rates, subtotalCents, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  await storeQuote(quote); return quote;
}

export async function getShippingQuote(quoteId: string): Promise<ShippingQuoteRecord | null> {
  const supabase = createServiceSupabase();
  if (!supabase) return localQuotes.get(quoteId) ?? null;
  const { data } = await supabase.from("shipping_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!data) return null;
  return { id: data.id, cartId: data.cart_id, locale: data.locale, audience: data.audience, address: data.address, lines: data.lines, parcels: data.parcels, rates: data.rates, subtotalCents: data.subtotal_cents, expiresAt: data.expires_at };
}

export async function getLatestShippingQuote(cartId: string): Promise<ShippingQuoteRecord | null> {
  const supabase = createServiceSupabase();
  if (!supabase) return [...localQuotes.values()].filter((quote) => quote.cartId === cartId).toSorted((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0] ?? null;
  const { data } = await supabase.from("shipping_quotes").select("*").eq("cart_id", cartId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { id: data.id, cartId: data.cart_id, locale: data.locale, audience: data.audience, address: data.address, lines: data.lines, parcels: data.parcels, rates: data.rates, subtotalCents: data.subtotal_cents, expiresAt: data.expires_at };
}

export function publicQuote(quote: ShippingQuoteRecord) {
  return {
    ok: true,
    quoteId: quote.id,
    expiresAt: quote.expiresAt,
    subtotalCents: quote.subtotalCents,
    parcels: quote.parcels.map(({ presetName, shippingWeightGrams }) => ({ presetName, shippingWeightGrams })),
    rates: quote.rates.map(({ sendcloudShippingOptionCodes: _, sendcloudParcelAmountsCents: __, ...rate }) => rate),
  };
}
