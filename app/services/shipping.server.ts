import { randomUUID } from "node:crypto";
import type { Audience, Locale, PackedParcel, PickupPoint, ResolvedCartLine, ShippingRate } from "~/domain/types";
import { packCartByWeight } from "~/domain/packing";
import { freeShippingThresholdCents } from "~/domain/money";
import { adjustShippingPrice } from "~/domain/shipping-pricing";
import { getPackagingPresets, resolveCartLines } from "~/lib/catalog.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { getPickupPointById } from "~/services/pickup-points.server";
import { getFreeShippingThresholds, getShippingPriceRule } from "~/services/site-settings.server";
import {
  colissimoServiceFor,
  createColissimoRates,
  type ColissimoServiceToken,
  type ShippoAddress,
} from "~/services/shippo-shipping.server";

export type QuoteAddress = ShippoAddress;

export type StoredShippingRate = ShippingRate & {
  shippoRateIds: string[];
  shippoShipmentIds: string[];
  serviceToken: ColissimoServiceToken;
};

export type ShippingQuoteRecord = {
  id: string;
  cartId: string;
  locale: Locale;
  audience: Audience;
  address: QuoteAddress;
  lines: ResolvedCartLine[];
  parcels: PackedParcel[];
  rates: StoredShippingRate[];
  subtotalCents: number;
  createdAt: string;
  expiresAt: string;
};

const localQuotes = new Map<string, ShippingQuoteRecord>();

function serviceName(serviceToken: ColissimoServiceToken): string {
  if (serviceToken === "colissimo_pick_up_point") return "Point Retrait";
  if (serviceToken === "colissimo_international_expert") return "International Expert";
  return "Domicile";
}

function mockRate(parcels: readonly PackedParcel[], countryCode: string, pickupPoint?: PickupPoint): StoredShippingRate {
  const serviceToken = colissimoServiceFor({ countryCode, pickupPoint });
  const pricePerParcel = serviceToken === "colissimo_home" ? 890
    : serviceToken === "colissimo_pick_up_point" ? (countryCode === "FR" ? 690 : 1_290)
    : 1_490;
  return {
    id: randomUUID(),
    provider: "mock",
    carrier: "Colissimo",
    service: serviceName(serviceToken),
    deliveryMethod: pickupPoint ? "pickup" : "home",
    ...(pickupPoint ? { pickupPoint } : {}),
    amountCents: pricePerParcel * parcels.length,
    currency: "EUR",
    estimatedDays: countryCode === "FR" ? 2 : 5,
    freeShippingApplied: false,
    signatureRequired: serviceToken === "colissimo_international_expert",
    shippoRateIds: parcels.map((_, index) => `mock:${serviceToken}:rate:${index}`),
    shippoShipmentIds: parcels.map((_, index) => `mock:${serviceToken}:shipment:${index}`),
    serviceToken,
  };
}

async function shippoRate(parcels: readonly PackedParcel[], address: QuoteAddress, pickupPoint?: PickupPoint): Promise<StoredShippingRate> {
  const parcelRates = await createColissimoRates({ address, parcels, pickupPoint });
  const serviceToken = colissimoServiceFor({ countryCode: address.countryCode, pickupPoint });
  if (parcelRates.length !== parcels.length || parcelRates.some((rate) => rate.serviceToken !== serviceToken)) {
    throw new Error("Le même service Colissimo n’est pas disponible pour tous les colis.");
  }
  const estimatedDays = parcelRates.map((rate) => rate.estimatedDays).filter((days): days is number => days !== null);
  return {
    id: randomUUID(),
    provider: "shippo",
    carrier: "Colissimo",
    service: serviceName(serviceToken),
    deliveryMethod: pickupPoint ? "pickup" : "home",
    ...(pickupPoint ? { pickupPoint } : {}),
    amountCents: parcelRates.reduce((sum, rate) => sum + rate.amountCents, 0),
    currency: "EUR",
    estimatedDays: estimatedDays.length ? Math.max(...estimatedDays) : null,
    freeShippingApplied: false,
    signatureRequired: serviceToken === "colissimo_international_expert",
    shippoRateIds: parcelRates.map((rate) => rate.rateId),
    shippoShipmentIds: parcelRates.map((rate) => rate.shipmentId),
    serviceToken,
  };
}

async function applyFreeShipping(rate: StoredShippingRate, countryCode: string, subtotalCents: number): Promise<StoredShippingRate> {
  const threshold = freeShippingThresholdCents(countryCode, await getFreeShippingThresholds());
  if (threshold === null || subtotalCents < threshold) return rate;
  return { ...rate, amountCents: 0, freeShippingApplied: true };
}

async function storeQuote(quote: ShippingQuoteRecord) {
  const supabase = createServiceSupabase();
  if (!supabase) {
    localQuotes.set(quote.id, quote);
    return;
  }
  const { error } = await supabase.from("shipping_quotes").insert({
    id: quote.id,
    cart_id: quote.cartId,
    locale: quote.locale,
    audience: quote.audience,
    address: quote.address,
    lines: quote.lines,
    parcels: quote.parcels,
    rates: quote.rates,
    subtotal_cents: quote.subtotalCents,
    expires_at: quote.expiresAt,
  });
  if (error) throw new Error(`Unable to store shipping quote: ${error.message}`);
}

export async function createShippingQuote(input: {
  cartId: string;
  locale: Locale;
  audience: Audience;
  address: QuoteAddress;
  pickupPointId?: string;
  lines: { productId: string; variantId: string; audience: Audience; quantity: number }[];
}) {
  const lines = await resolveCartLines(input.lines, input.locale, input.audience);
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const parcels = packCartByWeight(lines, await getPackagingPresets());
  const maxParcelWeightGrams = Math.max(...parcels.map((parcel) => parcel.shippingWeightGrams));
  const pickupPoint = input.pickupPointId
    ? await getPickupPointById({
      id: input.pickupPointId,
      locale: input.locale,
      countryCode: input.address.countryCode,
      weightGrams: maxParcelWeightGrams,
    })
    : undefined;
  const [calculated, pricingRule] = await Promise.all([
    env().SHIPPING_MOCK
      ? Promise.resolve(mockRate(parcels, input.address.countryCode, pickupPoint))
      : shippoRate(parcels, input.address, pickupPoint),
    getShippingPriceRule(),
  ]);
  const totalWeightGrams = parcels.reduce((sum, parcel) => sum + parcel.shippingWeightGrams, 0);
  const commercialPrice = adjustShippingPrice({
    amountCents: calculated.amountCents,
    countryCode: input.address.countryCode,
    totalWeightGrams,
    rule: pricingRule,
  });
  const rate = await applyFreeShipping(
    { ...calculated, amountCents: commercialPrice.amountCents },
    input.address.countryCode,
    subtotalCents,
  );
  const createdAt = new Date().toISOString();
  const quote: ShippingQuoteRecord = {
    id: randomUUID(),
    cartId: input.cartId,
    locale: input.locale,
    audience: input.audience,
    address: input.address,
    lines,
    parcels,
    rates: [rate],
    subtotalCents,
    createdAt,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  await storeQuote(quote);
  return quote;
}

function quoteFromRow(data: any): ShippingQuoteRecord {
  return {
    id: data.id,
    cartId: data.cart_id,
    locale: data.locale,
    audience: data.audience,
    address: data.address,
    lines: data.lines,
    parcels: data.parcels,
    rates: data.rates,
    subtotalCents: data.subtotal_cents,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  };
}

export async function getShippingQuote(quoteId: string): Promise<ShippingQuoteRecord | null> {
  const supabase = createServiceSupabase();
  if (!supabase) return localQuotes.get(quoteId) ?? null;
  const { data } = await supabase.from("shipping_quotes").select("*").eq("id", quoteId).maybeSingle();
  return data ? quoteFromRow(data) : null;
}

export async function getLatestShippingQuote(cartId: string): Promise<ShippingQuoteRecord | null> {
  const supabase = createServiceSupabase();
  if (!supabase) return [...localQuotes.values()]
    .filter((quote) => quote.cartId === cartId)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const { data } = await supabase.from("shipping_quotes").select("*").eq("cart_id", cartId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? quoteFromRow(data) : null;
}

export function publicQuote(quote: ShippingQuoteRecord) {
  return {
    ok: true,
    quoteId: quote.id,
    expiresAt: quote.expiresAt,
    subtotalCents: quote.subtotalCents,
    parcels: quote.parcels.map(({ presetName, shippingWeightGrams }) => ({ presetName, shippingWeightGrams })),
    rates: quote.rates.map(({ shippoRateIds: _, shippoShipmentIds: __, serviceToken: ___, ...rate }) => rate),
  };
}
