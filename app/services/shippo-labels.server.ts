import { env } from "~/lib/env.server";

type ShippoMessage = { text?: unknown };

export class ShippoLabelError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function trackingStatus(value: unknown) {
  if (typeof value === "object" && value !== null && "status" in value) return text(value.status);
  return text(value);
}

export async function createShippoLabel(input: { orderNumber: string; rateId: string }) {
  const token = env().SHIPPO_API_TOKEN;
  if (!token) throw new ShippoLabelError("Shippo n’est pas configuré.", 503);
  const headers = { authorization: `ShippoToken ${token}`, "content-type": "application/json", "shippo-api-version": "2018-02-08" };
  const [transactionResponse, rateResponse] = await Promise.all([
    fetch("https://api.goshippo.com/transactions", { method: "POST", headers, body: JSON.stringify({ rate: input.rateId, label_file_type: "PDF", async: false, metadata: input.orderNumber }), signal: AbortSignal.timeout(15_000) }),
    fetch(`https://api.goshippo.com/rates/${encodeURIComponent(input.rateId)}`, { headers, signal: AbortSignal.timeout(15_000) }),
  ]);
  const transaction = await transactionResponse.json().catch(() => null) as {
    object_id?: unknown; status?: unknown; provider?: unknown; label_url?: unknown; commercial_invoice_url?: unknown;
    tracking_number?: unknown; tracking_url_provider?: unknown; tracking_status?: unknown; messages?: ShippoMessage[];
  } | null;
  const purchasedRate = rateResponse.ok ? await rateResponse.json().catch(() => null) as { amount?: unknown } | null : null;
  const messages = Array.isArray(transaction?.messages) ? transaction.messages.map((item) => text(item.text)).filter(Boolean) : [];
  if (!transactionResponse.ok || transaction?.status !== "SUCCESS") throw new ShippoLabelError(messages.join(" · ") || `Shippo a refusé l’achat de l’étiquette (${transactionResponse.status}).`);

  const transactionId = text(transaction.object_id);
  const documentUrl = text(transaction.label_url);
  if (!transactionId || !documentUrl) throw new ShippoLabelError("Shippo n’a pas renvoyé l’étiquette complète.");
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
