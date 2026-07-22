import { randomUUID } from "node:crypto";
import type { Audience, Locale, PackedParcel, ResolvedCartLine, ShippingRate } from "~/domain/types";
import { packCartByWeight } from "~/domain/packing";
import { freeShippingThresholdCents } from "~/domain/money";
import { getPackagingPresets, resolveCartLines } from "~/lib/catalog.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export type QuoteAddress = {
  firstName: string; lastName: string; company?: string; email: string; phone: string;
  line1: string; line2?: string; postalCode: string; city: string; countryCode: string;
};

type StoredRate = ShippingRate & { shippoRateIds: string[] };
export type ShippingQuoteRecord = {
  id: string; cartId: string; locale: Locale; audience: Audience; address: QuoteAddress;
  lines: ResolvedCartLine[]; parcels: PackedParcel[]; rates: StoredRate[]; subtotalCents: number; expiresAt: string;
};

const localQuotes = new Map<string, ShippingQuoteRecord>();

function mockRates(parcels: PackedParcel[], subtotalCents: number, countryCode: string): StoredRate[] {
  const totalWeight = parcels.reduce((sum, parcel) => sum + parcel.shippingWeightGrams, 0);
  const parcelSupplement = Math.max(0, parcels.length - 1) * 390;
  const baseEconomy = 490 + Math.ceil(totalWeight / 1000) * 110 + parcelSupplement;
  const config = env(); const threshold = freeShippingThresholdCents(countryCode, { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS });
  const free = threshold !== null && subtotalCents >= threshold;
  return [
    { id: randomUUID(), provider: "mock", carrier: "Colissimo", service: "Domicile", amountCents: free ? 0 : baseEconomy, currency: "EUR", estimatedDays: countryCode === "FR" ? 2 : 5, freeShippingApplied: free, shippoRateIds: [] },
    { id: randomUUID(), provider: "mock", carrier: "Chronopost", service: "Express", amountCents: baseEconomy + 890, currency: "EUR", estimatedDays: countryCode === "FR" ? 1 : 2, freeShippingApplied: false, shippoRateIds: [] },
  ];
}

function fromAddress() {
  const config = env();
  if (!config.SHIP_FROM_STREET1 || !config.SHIP_FROM_POSTAL_CODE || !config.SHIP_FROM_PHONE) throw new Error("The Shippo sender address is incomplete.");
  return { name: config.SHIP_FROM_NAME, company: config.SHIP_FROM_COMPANY, street1: config.SHIP_FROM_STREET1, street2: config.SHIP_FROM_STREET2 ?? "", city: config.SHIP_FROM_CITY, zip: config.SHIP_FROM_POSTAL_CODE, country: config.SHIP_FROM_COUNTRY, phone: config.SHIP_FROM_PHONE, email: config.SHIP_FROM_EMAIL };
}

function customsDeclaration(parcel: PackedParcel, lines: ResolvedCartLine[]) {
  const config = env();
  const items = parcel.lines.map((parcelLine) => {
    const line = lines.find((candidate) => candidate.variantId === parcelLine.variantId)!;
    return { description: `${line.productName} roasted coffee`, quantity: parcelLine.quantity, net_weight: String(parcelLine.quantity * parcelLine.unitWeightGrams), mass_unit: "g", value_amount: ((line.unitPriceCents * parcelLine.quantity) / 100).toFixed(2), value_currency: "EUR", tariff_number: line.hsCode, origin_country: line.customsOriginCountry };
  });
  return { certify: true, certifier: config.SHIP_FROM_NAME, contents_type: "MERCHANDISE", non_delivery_option: "RETURN", incoterm: "DDU", eel_pfc: "NOEEI_30_37_a", items };
}

type ShippoRate = { object_id: string; amount: string; currency: string; provider: string; estimated_days?: number; servicelevel?: { name?: string; token?: string } };

async function shippoRates(parcels: PackedParcel[], address: QuoteAddress, lines: ResolvedCartLine[], subtotalCents: number): Promise<StoredRate[]> {
  const config = env(); if (!config.SHIPPO_API_TOKEN) throw new Error("Shippo is not configured.");
  const allowed = new Set(config.SHIPPO_ALLOWED_SERVICE_TOKENS.split(",").map((token) => token.trim()).filter(Boolean));
  const shipments = await Promise.all(parcels.map(async (parcel) => {
    const payload: Record<string, unknown> = {
      address_from: fromAddress(),
      address_to: { name: `${address.firstName} ${address.lastName}`, company: address.company ?? "", street1: address.line1, street2: address.line2 ?? "", city: address.city, zip: address.postalCode, country: address.countryCode, phone: address.phone, email: address.email },
      parcels: [{ length: String(parcel.lengthCm), width: String(parcel.widthCm), height: String(parcel.heightCm), distance_unit: "cm", weight: String(parcel.shippingWeightGrams), mass_unit: "g" }],
      async: false,
    };
    if (address.countryCode === "GB") payload.customs_declaration = customsDeclaration(parcel, lines);
    const response = await fetch("https://api.goshippo.com/shipments/", { method: "POST", headers: { authorization: `ShippoToken ${config.SHIPPO_API_TOKEN}`, "content-type": "application/json", "shippo-api-version": "2018-02-08" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Shippo rate request failed (${response.status}).`);
    const data = await response.json() as { rates?: ShippoRate[] };
    return (data.rates ?? []).filter((rate) => rate.currency === "EUR" && (allowed.size === 0 || allowed.has(rate.servicelevel?.token ?? "")));
  }));
  if (shipments.some((rates) => rates.length === 0)) throw new Error("No shipping service is available for this parcel.");
  const byService = new Map<string, ShippoRate[][]>();
  shipments.forEach((rates, parcelIndex) => rates.forEach((rate) => {
    const key = `${rate.provider}:${rate.servicelevel?.token ?? rate.servicelevel?.name ?? "service"}`;
    const groups = byService.get(key) ?? Array.from({ length: shipments.length }, () => []);
    groups[parcelIndex].push(rate); byService.set(key, groups);
  }));
  const aggregated = [...byService.values()].flatMap((groups) => groups.every((rates) => rates[0]) ? [groups.map((rates) => rates[0]).reduce<StoredRate>((result, rate) => ({
    id: result.id || randomUUID(), provider: "shippo", carrier: result.carrier || rate.provider,
    service: result.service || rate.servicelevel?.name || "Standard",
    amountCents: result.amountCents + Math.round(Number(rate.amount) * 100), currency: "EUR",
    estimatedDays: Math.max(result.estimatedDays ?? 0, rate.estimated_days ?? 0) || null,
    freeShippingApplied: false, shippoRateIds: [...result.shippoRateIds, rate.object_id],
  }), { id: "", provider: "shippo", carrier: "", service: "", amountCents: 0, currency: "EUR", estimatedDays: null, freeShippingApplied: false, shippoRateIds: [] })] : []);
  const threshold = freeShippingThresholdCents(address.countryCode, { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS });
  if (threshold !== null && subtotalCents >= threshold && aggregated.length) {
    const cheapest = aggregated.reduce((best, rate) => rate.amountCents < best.amountCents ? rate : best);
    return aggregated.map((rate) => rate.id === cheapest.id ? { ...rate, amountCents: 0, freeShippingApplied: true } : rate);
  }
  return aggregated;
}

async function storeQuote(quote: ShippingQuoteRecord) {
  const supabase = createServiceSupabase();
  if (!supabase) { localQuotes.set(quote.id, quote); return; }
  const { error } = await supabase.from("shipping_quotes").insert({ id: quote.id, cart_id: quote.cartId, locale: quote.locale, audience: quote.audience, address: quote.address, lines: quote.lines, parcels: quote.parcels, rates: quote.rates, subtotal_cents: quote.subtotalCents, expires_at: quote.expiresAt });
  if (error) throw new Error(`Unable to store shipping quote: ${error.message}`);
}

export async function createShippingQuote(input: { cartId: string; locale: Locale; audience: Audience; address: QuoteAddress; lines: { productId: string; variantId: string; audience: Audience; quantity: number }[] }) {
  const lines = await resolveCartLines(input.lines, input.locale, input.audience);
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const parcels = packCartByWeight(lines, await getPackagingPresets());
  const rates = env().SHIPPO_MOCK ? mockRates(parcels, subtotalCents, input.address.countryCode) : await shippoRates(parcels, input.address, lines, subtotalCents);
  if (rates.length === 0) throw new Error("No matching shipping service is available for all parcels.");
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
  return { ok: true, quoteId: quote.id, expiresAt: quote.expiresAt, subtotalCents: quote.subtotalCents, parcels: quote.parcels.map(({ presetName, shippingWeightGrams }) => ({ presetName, shippingWeightGrams })), rates: quote.rates.map(({ shippoRateIds: _, ...rate }) => rate) };
}
