import { env } from "~/lib/env.server";

type ShippoMessage = { text?: unknown };

export class ShippoLabelError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export class ShippoAmbiguousPurchaseError extends ShippoLabelError {
  constructor(message: string) {
    super(message, 504);
  }
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function trackingStatus(value: unknown) {
  if (typeof value === "object" && value !== null && "status" in value) return text(value.status);
  return text(value);
}

function headers(token: string) {
  return { authorization: `ShippoToken ${token}`, accept: "application/json", "content-type": "application/json", "shippo-api-version": "2018-02-08" };
}

function errorMessages(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const object = value as { detail?: unknown; messages?: unknown };
  const detail = text(object.detail);
  const messages = Array.isArray(object.messages)
    ? object.messages.flatMap((item) => item && typeof item === "object" && "text" in item ? [text((item as ShippoMessage).text)] : []).filter(Boolean)
    : [];
  return detail ? [detail, ...messages] : messages;
}

export async function createShippoLabel(input: { orderNumber: string; rateId: string; parcelIndex?: number }) {
  const token = env().SHIPPO_API_TOKEN;
  if (!token) throw new ShippoLabelError("Shippo n’est pas configuré.", 503);
  const requestHeaders = headers(token);
  const rateResponse = await fetch(`https://api.goshippo.com/rates/${encodeURIComponent(input.rateId)}`, { headers: requestHeaders, signal: AbortSignal.timeout(15_000) });
  const purchasedRate = await rateResponse.json().catch(() => null) as { amount?: unknown; currency?: unknown } | null;
  if (!rateResponse.ok || !purchasedRate) throw new ShippoLabelError(errorMessages(purchasedRate).join(" · ") || `Le tarif Shippo ne peut pas être relu (${rateResponse.status}).`);
  if (text(purchasedRate.currency).toUpperCase() !== "EUR") throw new ShippoLabelError("Le tarif Shippo stocké n’est pas libellé en euros.");

  let transactionResponse: Response;
  try {
    transactionResponse = await fetch("https://api.goshippo.com/transactions", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        rate: input.rateId,
        label_file_type: "PDF",
        async: false,
        metadata: input.parcelIndex === undefined ? input.orderNumber : `${input.orderNumber}/parcel/${input.parcelIndex + 1}`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ShippoAmbiguousPurchaseError(`Le résultat de l’achat est incertain (${detail}). Vérifiez la commande dans Shippo avant toute nouvelle tentative.`);
  }
  const transaction = await transactionResponse.json().catch(() => null) as {
    object_id?: unknown; status?: unknown; provider?: unknown; label_url?: unknown; commercial_invoice_url?: unknown;
    tracking_number?: unknown; tracking_url_provider?: unknown; tracking_status?: unknown; messages?: ShippoMessage[];
  } | null;
  const messages = errorMessages(transaction);
  const transactionStatus = text(transaction?.status).toUpperCase();
  if (!transactionResponse.ok || transactionStatus === "ERROR") {
    throw new ShippoLabelError(messages.join(" · ") || `Shippo a refusé l’achat de l’étiquette (${transactionResponse.status}).`);
  }
  if (!transaction || transactionStatus !== "SUCCESS") {
    throw new ShippoAmbiguousPurchaseError("Shippo n’a pas confirmé le résultat de l’achat. Vérifiez la commande dans Shippo avant toute nouvelle tentative.");
  }

  const transactionId = text(transaction.object_id);
  const documentUrl = text(transaction.label_url);
  if (!transactionId || !documentUrl) throw new ShippoAmbiguousPurchaseError("Shippo a confirmé l’achat sans renvoyer l’étiquette complète. Vérifiez la commande dans Shippo avant toute nouvelle tentative.");
  const amount = Math.round(Number(purchasedRate?.amount) * 100);
  return {
    provider: "shippo" as const,
    transactionId,
    carrier: text(transaction.provider) || "Colissimo",
    documentUrl,
    commercialInvoiceUrl: text(transaction.commercial_invoice_url) || null,
    trackingNumber: text(transaction.tracking_number) || null,
    trackingUrl: text(transaction.tracking_url_provider) || null,
    status: trackingStatus(transaction.tracking_status) || "PRE_TRANSIT",
    actualCostCents: Number.isFinite(amount) && amount >= 0 ? amount : 0,
  };
}
