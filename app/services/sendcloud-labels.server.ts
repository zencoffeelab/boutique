import { Buffer } from "node:buffer";
import type { PackedParcel, ResolvedCartLine } from "~/domain/types";
import { env } from "~/lib/env.server";
import type { QuoteAddress } from "~/services/shipping.server";

export type SendcloudRate = {
  serviceToken?: string;
  service?: string;
  sendcloudShippingOptionCode?: string;
  sendcloudActualCostCents?: number;
};
export type SendcloudLabel = {
  provider: "sendcloud"; shipmentId: string; parcelId: string; carrier: string | null; documentUrl: string;
  commercialInvoiceUrl: null; trackingNumber: string | null; trackingUrl: string | null; status: string; actualCostCents: number;
};
type ShippingMethod = { id?: unknown; carrier?: unknown; name?: unknown };

export class SendcloudAmbiguousPurchaseError extends Error {}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function identifier(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function credentials() {
  const config = env();
  if (!config.SENDCLOUD_PUBLIC_KEY || !config.SENDCLOUD_SECRET_KEY) throw new Error("Sendcloud is not configured.");
  return Buffer.from(`${config.SENDCLOUD_PUBLIC_KEY}:${config.SENDCLOUD_SECRET_KEY}`).toString("base64");
}
function headers(json = false): Record<string, string> { return { authorization: `Basic ${credentials()}`, accept: "application/json", ...(json ? { "content-type": "application/json" } : {}) }; }
async function sendcloudJson<T>(path: string, init?: RequestInit, timeoutMs = 12_000): Promise<T> {
  const response = await fetch(`https://panel.sendcloud.sc/api${path}`, { ...init, headers: { ...headers(Boolean(init?.body)), ...init?.headers }, signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json().catch(() => null) as T | null;
  if (!response.ok || !data) {
    const errors = data && typeof data === "object" && "errors" in data && Array.isArray((data as { errors?: unknown[] }).errors) ? (data as { errors: Array<{ detail?: unknown }> }).errors.map((item) => text(item.detail)).filter(Boolean) : [];
    throw new Error(errors.join(" · ") || `Sendcloud request failed (${response.status}).`);
  }
  return data;
}
function configuredMethodId(rate: SendcloudRate) {
  const config = env(); let methods: unknown;
  try { methods = JSON.parse(config.SENDCLOUD_SHIPPING_METHODS); } catch { throw new Error("SENDCLOUD_SHIPPING_METHODS must be valid JSON."); }
  const mapped = methods && typeof methods === "object" && !Array.isArray(methods) && rate.serviceToken ? (methods as Record<string, unknown>)[rate.serviceToken] : undefined;
  const value = mapped ?? config.SENDCLOUD_SHIPPING_METHOD_ID;
  if (value === undefined) return undefined;
  const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw new Error("Invalid Sendcloud shipping method."); return number;
}
function weightBand(name: string) { const match = name.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*kg/i); return match ? { min: Number(match[1].replace(",", ".")), max: Number(match[2].replace(",", ".")) } : null; }
async function resolveMethodId(rate: SendcloudRate, parcel: PackedParcel, country: string) {
  const configured = configuredMethodId(rate); if (configured) return configured;
  const body = await sendcloudJson<{ shipping_methods: ShippingMethod[] }>("/v2/shipping_methods");
  const token = rate.serviceToken ?? ""; const pickup = /pick.?up|service.?point/i.test(token); const home = /home/i.test(token); const weight = parcel.shippingWeightGrams / 1000;
  const method = body.shipping_methods.find((candidate) => {
    const carrier = text(candidate.carrier).toLowerCase(); const name = text(candidate.name); const band = weightBand(name);
    return (!token.includes("colissimo") || carrier === "colissimo") && (!token.includes("chronopost") || carrier === "chronopost")
      && (!pickup || /service point|point retrait/i.test(name)) && (!home || (/home|domicile/i.test(name) && !/service point|point retrait/i.test(name)))
      && (country !== "FR" || !/overseas|international/i.test(name)) && Boolean(band && weight > band.min && weight <= band.max);
  });
  const id = Number(identifier(method?.id)); if (!Number.isInteger(id)) throw new Error(`No Sendcloud shipping method matches ${token} at ${weight.toFixed(3)} kg.`); return id;
}
async function shippingOptionCode(methodId: number) {
  const result = await sendcloudJson<{ data: Record<string, string | null> }>("/v3/compat/shipping-options", { method: "POST", body: JSON.stringify({ shipping_method_ids: [methodId] }) });
  const code = result.data[String(methodId)]; if (!code) throw new Error(`Sendcloud method ${methodId} has no v3 shipping option.`); return code;
}
async function senderAddressId() {
  const result = await sendcloudJson<{ data: Array<{ id?: unknown }> }>("/v3/addresses/sender-addresses"); const id = identifier(result.data[0]?.id);
  if (!id) throw new Error("No Sendcloud sender address is configured."); return id;
}
async function shippingCostCents(methodId: number, parcel: PackedParcel, address: QuoteAddress) {
  const params = new URLSearchParams({ shipping_method_id: String(methodId), weight: (parcel.shippingWeightGrams / 1000).toFixed(3), weight_unit: "kilogram", from_country: "FR", to_country: address.countryCode });
  if (address.postalCode) params.set("to_postal_code", address.postalCode);
  const result = await sendcloudJson<Array<{ price?: unknown; currency?: unknown; to_country?: unknown }>>(`/v2/shipping-price?${params}`);
  const quote = result.find((item) => text(item.currency).toUpperCase() === "EUR" && text(item.to_country).toUpperCase() === address.countryCode) ?? result.find((item) => text(item.currency).toUpperCase() === "EUR");
  const amount = Number(quote?.price);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}
function splitAddress(line: string) { const match = line.trim().match(/^(\d+[\p{L}\d/-]*)\s+(.+)$/u); return match ? { houseNumber: match[1], street: match[2] } : { houseNumber: "", street: line.trim() }; }
function items(parcel: PackedParcel, lines: ResolvedCartLine[]) { return parcel.lines.map((part) => { const line = lines.find((candidate) => candidate.variantId === part.variantId); if (!line) throw new Error(`Unknown variant ${part.variantId}.`); return { item_id: line.variantId, description: `${line.productName} roasted coffee`, quantity: part.quantity, weight: { value: (part.unitWeightGrams * part.quantity / 1000).toFixed(3), unit: "kg" }, price: { value: (line.unitPriceCents / 100).toFixed(2), currency: "EUR" }, hs_code: line.hsCode, origin_country: line.customsOriginCountry, sku: line.variantId, product_id: line.variantId }; }); }

export async function createSendcloudLabel(input: { orderNumber: string; address: QuoteAddress; lines: ResolvedCartLine[]; parcel: PackedParcel; rate: SendcloudRate; pickupPointId?: string }): Promise<SendcloudLabel> {
  const pickupPointId = input.pickupPointId ? Number(input.pickupPointId) : null;
  if (input.pickupPointId && !Number.isSafeInteger(pickupPointId)) throw new Error("Invalid Sendcloud service-point identifier.");
  const destination = splitAddress(input.address.line1);
  const directOption = text(input.rate.sendcloudShippingOptionCode);
  const method = directOption ? null : await resolveMethodId(input.rate, input.parcel, input.address.countryCode);
  const [option, senderId, actualCostCents] = await Promise.all([
    directOption || shippingOptionCode(method!),
    senderAddressId(),
    Number.isInteger(input.rate.sendcloudActualCostCents) && input.rate.sendcloudActualCostCents! >= 0
      ? input.rate.sendcloudActualCostCents!
      : method ? shippingCostCents(method, input.parcel, input.address) : 0,
  ]);
  const parcelItems = items(input.parcel, input.lines); const total = parcelItems.reduce((sum, item) => sum + Number(item.price.value) * item.quantity, 0).toFixed(2);
  let result: { data: { id?: unknown; carrier?: { name?: unknown }; errors?: Array<{ detail?: unknown }>; parcels?: Array<{ id?: unknown; status?: { code?: unknown }; documents?: Array<{ type?: unknown; link?: unknown }>; tracking_number?: unknown; tracking_url?: unknown }> } };
  try {
    result = await sendcloudJson("/v3/shipments/announce", { method: "POST", body: JSON.stringify({
      external_reference_id: `${input.orderNumber}-${input.parcel.presetId}-${input.parcel.shippingWeightGrams}`, label_details: { mime_type: "application/pdf", dpi: 72 },
      from_address: { sender_address_id: senderId },
      to_address: { name: `${input.address.firstName} ${input.address.lastName}`.trim(), company_name: input.address.company ?? "", address_line_1: destination.street, address_line_2: input.address.line2 ?? "", house_number: destination.houseNumber, postal_code: input.address.postalCode, city: input.address.city, country_code: input.address.countryCode, phone_number: input.address.phone, email: input.address.email },
      ...(pickupPointId ? { to_service_point: { id: pickupPointId } } : {}),
      ship_with: { type: "shipping_option_code", properties: { shipping_option_code: option } }, order_number: input.orderNumber, total_order_price: { currency: "EUR", value: total },
      parcels: [{ dimensions: { length: String(input.parcel.lengthCm), width: String(input.parcel.widthCm), height: String(input.parcel.heightCm), unit: "cm" }, weight: { value: (input.parcel.shippingWeightGrams / 1000).toFixed(3), unit: "kg" }, parcel_items: parcelItems }],
    }) }, 30_000);
  } catch (cause) {
    if (cause instanceof Error && ["AbortError", "TimeoutError"].includes(cause.name)) throw new SendcloudAmbiguousPurchaseError("Sendcloud n’a pas répondu à temps. Vérifiez l’expédition dans Sendcloud avant de relancer.");
    throw cause;
  }
  const shipmentId = identifier(result.data.id); const created = result.data.parcels?.[0]; const parcelId = identifier(created?.id); const documentUrl = text(created?.documents?.find((document) => document.type === "label")?.link);
  const error = result.data.errors?.map((item) => text(item.detail)).filter(Boolean).join(" · ");
  if (!shipmentId || !parcelId || !documentUrl) throw new Error(error || "Sendcloud v3 did not return a label document.");
  return { provider: "sendcloud", shipmentId, parcelId, carrier: text(result.data.carrier?.name) || null, documentUrl, commercialInvoiceUrl: null, trackingNumber: text(created?.tracking_number) || null, trackingUrl: text(created?.tracking_url) || null, status: text(created?.status?.code) || "PRE_TRANSIT", actualCostCents };
}

export async function downloadSendcloudLabel(documentUrl: string) {
  const url = new URL(documentUrl); if (url.origin !== "https://panel.sendcloud.sc" || !url.pathname.startsWith("/api/v3/parcels/")) throw new Error("Invalid Sendcloud document URL.");
  const response = await fetch(url, { headers: { authorization: `Basic ${credentials()}`, accept: "application/pdf" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Sendcloud label download failed (${response.status}).`); return response;
}
