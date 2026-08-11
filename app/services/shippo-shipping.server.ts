import type { PackedParcel, PickupPoint } from "~/domain/types";
import { isShippingCountry } from "~/domain/shipping-countries";
import { env } from "~/lib/env.server";

export const COLISSIMO_SERVICE_TOKENS = [
  "colissimo_home",
  "colissimo_international_expert",
  "colissimo_pick_up_point",
] as const;

export type ColissimoServiceToken = (typeof COLISSIMO_SERVICE_TOKENS)[number];

export type ShippoAddress = {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  phone: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  countryCode: string;
};

export type ShippoParcelRate = {
  rateId: string;
  shipmentId: string;
  amountCents: number;
  estimatedDays: number | null;
  provider: string;
  serviceName: string;
  serviceToken: ColissimoServiceToken;
};

type CarrierAccount = {
  object_id?: unknown;
  carrier?: unknown;
  active?: unknown;
  test?: unknown;
  is_shippo_account?: unknown;
};

type ShippoRate = {
  object_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  provider?: unknown;
  estimated_days?: unknown;
  servicelevel?: { name?: unknown; token?: unknown };
};

type ShippoShipment = {
  object_id?: unknown;
  status?: unknown;
  rates?: unknown;
  messages?: Array<{ text?: unknown }>;
};

const accountCache = new Map<string, { accountId: string; expiresAt: number }>();
const accountRequests = new Map<string, Promise<string>>();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shippoToken(): string {
  const token = env().SHIPPO_API_TOKEN;
  if (!token) throw new Error("Shippo n’est pas configuré.");
  return token;
}

function shippoHeaders(token: string): Record<string, string> {
  return {
    authorization: `ShippoToken ${token}`,
    accept: "application/json",
    "content-type": "application/json",
    "shippo-api-version": "2018-02-08",
  };
}

function responseMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const object = value as { detail?: unknown; messages?: unknown };
  const detail = text(object.detail);
  if (detail) return detail;
  if (!Array.isArray(object.messages)) return "";
  return object.messages.flatMap((message) => message && typeof message === "object" && "text" in message
    ? [text((message as { text?: unknown }).text)]
    : []).filter(Boolean).join(" · ");
}

async function shippoJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = shippoToken();
  const response = await fetch(`https://api.goshippo.com${path}`, {
    ...init,
    headers: { ...shippoHeaders(token), ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null) as T | null;
  if (!response.ok || !data) throw new Error(responseMessage(data) || `Shippo a refusé la demande (${response.status}).`);
  return data;
}

function accountsFromResponse(value: unknown): CarrierAccount[] {
  if (Array.isArray(value)) return value as CarrierAccount[];
  if (value && typeof value === "object" && "results" in value && Array.isArray((value as { results?: unknown }).results)) {
    return (value as { results: CarrierAccount[] }).results;
  }
  return value && typeof value === "object" ? [value as CarrierAccount] : [];
}

export async function getColissimoCarrierAccountId(): Promise<string> {
  const token = shippoToken();
  const cached = accountCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.accountId;
  const pending = accountRequests.get(token);
  if (pending) return pending;

  const request = (async () => {
    const response = await shippoJson<unknown>("/carrier_accounts?carrier=colissimo");
    const accounts = accountsFromResponse(response).filter((account) =>
      text(account.carrier).toLowerCase() === "colissimo" && account.active === true && account.is_shippo_account === true,
    );
    const testMode = token.startsWith("shippo_test_");
    const selected = accounts.find((account) => account.test === testMode);
    const accountId = text(selected?.object_id);
    if (!accountId) throw new Error("Aucun compte Colissimo intégré actif n’est disponible dans Shippo.");
    accountCache.set(token, { accountId, expiresAt: Date.now() + 60 * 60_000 });
    return accountId;
  })();
  accountRequests.set(token, request);
  try {
    return await request;
  } finally {
    accountRequests.delete(token);
  }
}

export function colissimoServiceFor(input: { countryCode: string; pickupPoint?: PickupPoint }): ColissimoServiceToken {
  const countryCode = input.countryCode.toUpperCase();
  if (!isShippingCountry(countryCode)) throw new Error("Ce pays n’est pas desservi.");
  if (input.pickupPoint) return "colissimo_pick_up_point";
  return countryCode === "FR" ? "colissimo_home" : "colissimo_international_expert";
}

function senderAddress() {
  const config = env();
  if (!config.SHIP_FROM_STREET1 || !config.SHIP_FROM_POSTAL_CODE || !config.SHIP_FROM_PHONE) {
    throw new Error("L’adresse expéditeur Shippo est incomplète (rue, code postal ou téléphone manquant).");
  }
  return {
    name: config.SHIP_FROM_NAME,
    company: config.SHIP_FROM_COMPANY,
    street1: config.SHIP_FROM_STREET1,
    street2: config.SHIP_FROM_STREET2 || "",
    city: config.SHIP_FROM_CITY,
    zip: config.SHIP_FROM_POSTAL_CODE,
    country: config.SHIP_FROM_COUNTRY.toUpperCase(),
    phone: config.SHIP_FROM_PHONE,
    email: config.SHIP_FROM_EMAIL,
  };
}

function recipientAddress(address: ShippoAddress) {
  return {
    name: `${address.firstName} ${address.lastName}`.trim(),
    company: address.company || "",
    street1: address.line1,
    street2: address.line2 || "",
    city: address.city,
    zip: address.postalCode,
    country: address.countryCode.toUpperCase(),
    phone: address.phone,
    email: address.email,
  };
}

function rateFromShipment(shipment: ShippoShipment, serviceToken: ColissimoServiceToken): ShippoParcelRate {
  const rates = Array.isArray(shipment.rates) ? shipment.rates as ShippoRate[] : [];
  const matching = rates.filter((rate) =>
    text(rate.servicelevel?.token) === serviceToken && text(rate.currency).toUpperCase() === "EUR",
  ).map((rate) => ({ rate, amountCents: Math.round(Number(rate.amount) * 100) }))
    .filter(({ amountCents }) => Number.isSafeInteger(amountCents) && amountCents >= 0)
    .toSorted((left, right) => left.amountCents - right.amountCents)[0];
  const rateId = text(matching?.rate.object_id);
  const shipmentId = text(shipment.object_id);
  if (!matching || !rateId || !shipmentId) throw new Error(`Le service Colissimo ${serviceToken} n’est pas disponible pour ce colis.`);
  const estimatedDays = Number(matching.rate.estimated_days);
  return {
    rateId,
    shipmentId,
    amountCents: matching.amountCents,
    estimatedDays: Number.isFinite(estimatedDays) && estimatedDays >= 0 ? Math.ceil(estimatedDays) : null,
    provider: text(matching.rate.provider) || "Colissimo",
    serviceName: text(matching.rate.servicelevel?.name) || "Colissimo",
    serviceToken,
  };
}

export async function createColissimoRateForParcel(input: {
  address: ShippoAddress;
  parcel: PackedParcel;
  pickupPoint?: PickupPoint;
  serviceToken?: ColissimoServiceToken;
  reference?: string;
}): Promise<ShippoParcelRate> {
  const expectedService = colissimoServiceFor({ countryCode: input.address.countryCode, pickupPoint: input.pickupPoint });
  if (input.serviceToken && input.serviceToken !== expectedService) throw new Error("Le service Colissimo du devis ne correspond plus à la destination.");
  const accountId = await getColissimoCarrierAccountId();
  const shipment = await shippoJson<ShippoShipment>("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_from: senderAddress(),
      address_to: recipientAddress(input.address),
      parcels: [{
        length: String(input.parcel.lengthCm),
        width: String(input.parcel.widthCm),
        height: String(input.parcel.heightCm),
        distance_unit: "cm",
        weight: (input.parcel.shippingWeightGrams / 1_000).toFixed(3),
        mass_unit: "kg",
      }],
      extra: {
        ...(input.pickupPoint ? { location_external_id: input.pickupPoint.id } : {}),
        ...(input.reference ? { reference_1: input.reference.slice(0, 50) } : {}),
      },
      carrier_accounts: [accountId],
      async: false,
    }),
  });
  if (text(shipment.status).toUpperCase() !== "SUCCESS") throw new Error(responseMessage(shipment) || "Shippo n’a pas pu calculer ce colis.");
  return rateFromShipment(shipment, expectedService);
}

export async function createColissimoRates(input: {
  address: ShippoAddress;
  parcels: readonly PackedParcel[];
  pickupPoint?: PickupPoint;
}): Promise<ShippoParcelRate[]> {
  return Promise.all(input.parcels.map((parcel) => createColissimoRateForParcel({ ...input, parcel })));
}
