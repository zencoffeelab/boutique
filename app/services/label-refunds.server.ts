import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const REFUND_EVENT_PROVIDER = "shippo-label-refund";
const SENDCLOUD_REFUND_EVENT_PROVIDER = "sendcloud-label-refund";
const FINAL_REFUND_STATUSES = new Set(["SUCCESS", "ERROR"]);
const REFUNDABLE_TRACKING_STATUSES = new Set(["", "UNKNOWN", "PRE_TRANSIT", "READY_TO_SEND"]);

export type LabelRefundStatus = "REQUESTING" | "QUEUED" | "PENDING" | "SUCCESS" | "ERROR";

export type LabelRefundState = Readonly<{
  refundId: string | null;
  status: LabelRefundStatus;
  message: string | null;
  requestedAt: string;
  updatedAt: string;
  originalCostCents: number;
}>;

type ShippoTransaction = {
  status?: unknown;
  tracking_status?: unknown;
  messages?: unknown;
};

type ShippoRefund = {
  object_id?: unknown;
  status?: unknown;
  object_created?: unknown;
  object_updated?: unknown;
  transaction?: unknown;
};

export class LabelRefundError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export function normalizeLabelRefundStatus(value: unknown): LabelRefundStatus {
  const normalized = text(value).toUpperCase();
  if (normalized === "QUEUED" || normalized === "PENDING" || normalized === "SUCCESS" || normalized === "ERROR" || normalized === "REQUESTING") return normalized;
  return "PENDING";
}

export function normalizedTrackingStatus(value: unknown): string {
  if (value && typeof value === "object" && "status" in value) return text((value as { status?: unknown }).status).toUpperCase();
  return text(value).toUpperCase();
}

export function labelRefundStatusFromTransaction(value: unknown): LabelRefundStatus | null {
  const status = text(value).toUpperCase();
  if (status === "REFUNDED") return "SUCCESS";
  if (status === "REFUNDPENDING") return "PENDING";
  if (status === "REFUNDREJECTED") return "ERROR";
  return null;
}

export function labelIsRefundable(input: { trackingStatus: unknown; purchasedAt: string; now?: number }): boolean {
  if (!REFUNDABLE_TRACKING_STATUSES.has(normalizedTrackingStatus(input.trackingStatus))) return false;
  const purchasedAt = new Date(input.purchasedAt).getTime();
  const now = input.now ?? Date.now();
  return Number.isFinite(purchasedAt) && purchasedAt <= now && now - purchasedAt <= 90 * 24 * 60 * 60_000;
}

function shippoMessages(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const messages = value.flatMap((item) => item && typeof item === "object" && "text" in item ? [text((item as { text?: unknown }).text)] : []).filter(Boolean);
  return messages.length ? messages.join(" · ") : null;
}

function temporaryShippoRefundDelay(cause: unknown): boolean {
  return cause instanceof Error && /refund requests are not available within 60 minutes/i.test(cause.message);
}

async function shippoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = env().SHIPPO_API_TOKEN;
  if (!token) throw new LabelRefundError("Shippo n’est pas configuré.", 503);
  const response = await fetch(`https://api.goshippo.com${path}`, {
    ...init,
    headers: {
      authorization: `ShippoToken ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      "shippo-api-version": "2018-02-08",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => null) as T | null;
  if (!response.ok || !data) {
    const detail = data && typeof data === "object" && "detail" in data ? text((data as { detail?: unknown }).detail) : "";
    throw new LabelRefundError(detail || `Shippo a refusé la demande (${response.status}).`, 502);
  }
  return data;
}

export async function cancelSendcloudShipment(shipmentId: string): Promise<{ message: string; status: "SUCCESS" | "PENDING" }> {
  const config = env();
  if (!config.SENDCLOUD_PUBLIC_KEY || !config.SENDCLOUD_SECRET_KEY) throw new LabelRefundError("Sendcloud n’est pas configuré.", 503);
  const credentials = Buffer.from(`${config.SENDCLOUD_PUBLIC_KEY}:${config.SENDCLOUD_SECRET_KEY}`).toString("base64");
  const response = await fetch(`https://panel.sendcloud.sc/api/v3/shipments/${encodeURIComponent(shipmentId)}/cancel`, { method: "POST", headers: { authorization: `Basic ${credentials}`, accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  const data = await response.json().catch(() => null) as { data?: { status?: unknown; message?: unknown }; errors?: Array<{ detail?: unknown }> } | null;
  const message = typeof data?.data?.message === "string" ? data.data.message.trim() : ""; const status = String(data?.data?.status ?? "").toLowerCase();
  if (!response.ok || !["cancelled", "queued"].includes(status)) throw new LabelRefundError(message || data?.errors?.map((item) => text(item.detail)).filter(Boolean).join(" · ") || `Sendcloud a refusé l’annulation (${response.status}).`, 502);
  return { message: message || "Annulation Sendcloud enregistrée.", status: status === "cancelled" ? "SUCCESS" : "PENDING" };
}

async function sendcloudShipmentIsCancelled(shipmentId: string): Promise<boolean> {
  const config = env();
  if (!config.SENDCLOUD_PUBLIC_KEY || !config.SENDCLOUD_SECRET_KEY) throw new LabelRefundError("Sendcloud n’est pas configuré.", 503);
  const credentials = Buffer.from(`${config.SENDCLOUD_PUBLIC_KEY}:${config.SENDCLOUD_SECRET_KEY}`).toString("base64");
  const response = await fetch(`https://panel.sendcloud.sc/api/v3/shipments/${encodeURIComponent(shipmentId)}`, { headers: { authorization: `Basic ${credentials}`, accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  const data = await response.json().catch(() => null) as { data?: { parcels?: Array<{ status?: { code?: unknown } }> }; errors?: Array<{ detail?: unknown }> } | null;
  if (!response.ok || !data?.data) throw new LabelRefundError(data?.errors?.map((item) => text(item.detail)).filter(Boolean).join(" · ") || `Le statut Sendcloud n’a pas pu être vérifié (${response.status}).`, 502);
  const parcels = data.data.parcels ?? [];
  return parcels.length > 0 && parcels.every((parcel) => text(parcel.status?.code).toUpperCase() === "CANCELLED");
}

function stateFromPayload(payload: unknown, fallback: { createdAt: string; originalCostCents: number }): LabelRefundState {
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    refundId: text(value.refundId) || null,
    status: normalizeLabelRefundStatus(value.status ?? "REQUESTING"),
    message: text(value.message) || null,
    requestedAt: text(value.requestedAt) || fallback.createdAt,
    updatedAt: text(value.updatedAt) || fallback.createdAt,
    originalCostCents: Number.isInteger(value.originalCostCents) ? Number(value.originalCostCents) : fallback.originalCostCents,
  };
}

async function storeState(client: NonNullable<ReturnType<typeof createServiceSupabase>>, transactionId: string, state: LabelRefundState) {
  const final = FINAL_REFUND_STATUSES.has(state.status);
  const { error } = await client.from("webhook_events").update({
    payload: state,
    processed_at: final ? new Date().toISOString() : null,
    processing_error: state.status === "ERROR" ? state.message : null,
  }).eq("provider", REFUND_EVENT_PROVIDER).eq("provider_event_id", transactionId);
  if (error) throw new LabelRefundError(`Le statut du remboursement n’a pas pu être enregistré : ${error.message}`, 500);
}

async function applySuccessfulRefund(client: NonNullable<ReturnType<typeof createServiceSupabase>>, input: { orderId: string; shipmentId: string; adminId: string; state: LabelRefundState }) {
  const { error: shipmentError } = await client.from("shipments").update({ actual_cost_cents: 0 }).eq("id", input.shipmentId).eq("order_id", input.orderId);
  if (shipmentError) throw new LabelRefundError(`Le coût de l’étiquette n’a pas pu être régularisé : ${shipmentError.message}`, 500);
  const { data: costs, error: costError } = await client.from("shipments").select("actual_cost_cents").eq("order_id", input.orderId);
  if (costError) throw new LabelRefundError(`Le coût de la commande n’a pas pu être recalculé : ${costError.message}`, 500);
  const actualShippingCostCents = (costs ?? []).reduce((sum, shipment) => sum + shipment.actual_cost_cents, 0);
  const { error: orderError } = await client.from("orders").update({ actual_shipping_cost_cents: actualShippingCostCents, updated_at: new Date().toISOString() }).eq("id", input.orderId);
  if (orderError) throw new LabelRefundError(`Le coût de la commande n’a pas pu être enregistré : ${orderError.message}`, 500);
  await client.from("audit_log").insert({
    actor_id: input.adminId,
    action: "shipment.label_refunded",
    entity_type: "shipment",
    entity_id: input.shipmentId,
    before_data: { actualCostCents: input.state.originalCostCents },
    after_data: { refundId: input.state.refundId, actualCostCents: 0, actualShippingCostCents },
  });
}

async function refreshExistingRefund(client: NonNullable<ReturnType<typeof createServiceSupabase>>, input: { orderId: string; shipmentId: string; transactionId: string; adminId: string; current: LabelRefundState }) {
  if (input.current.status === "SUCCESS" || input.current.status === "ERROR") return input.current;
  const now = new Date().toISOString();
  let next: LabelRefundState;
  if (input.current.refundId) {
    const refund = await shippoRequest<ShippoRefund>(`/refunds/${encodeURIComponent(input.current.refundId)}`);
    const status = normalizeLabelRefundStatus(refund.status);
    next = { ...input.current, status, updatedAt: text(refund.object_updated) || now, message: status === "ERROR" ? "Shippo a refusé le remboursement de cette étiquette." : null };
  } else {
    const transaction = await shippoRequest<ShippoTransaction>(`/transactions/${encodeURIComponent(input.transactionId)}`);
    const transactionStatus = text(transaction.status).toUpperCase();
    const existingStatus = labelRefundStatusFromTransaction(transactionStatus);
    if (!existingStatus && input.current.status === "PENDING" && transactionStatus === "SUCCESS" && REFUNDABLE_TRACKING_STATUSES.has(normalizedTrackingStatus(transaction.tracking_status))) {
      try {
        const refund = await shippoRequest<ShippoRefund>("/refunds/", { method: "POST", body: JSON.stringify({ transaction: input.transactionId, async: false }) });
        const refundId = text(refund.object_id);
        if (!refundId) throw new LabelRefundError("La réponse de Shippo ne contient pas d’identifiant de remboursement.", 502);
        next = { ...input.current, refundId, status: normalizeLabelRefundStatus(refund.status), updatedAt: text(refund.object_updated) || text(refund.object_created) || now, message: null };
      } catch (cause) {
        if (!temporaryShippoRefundDelay(cause)) throw cause;
        next = { ...input.current, status: "PENDING", updatedAt: now, message: cause instanceof Error ? cause.message : String(cause) };
      }
    } else {
      const status = existingStatus ?? input.current.status;
      next = { ...input.current, status, updatedAt: now, message: status === "ERROR" ? (shippoMessages(transaction.messages) || "Shippo a refusé le remboursement de cette étiquette.") : null };
    }
  }
  if (next.status === "SUCCESS") await applySuccessfulRefund(client, { ...input, state: next });
  await storeState(client, input.transactionId, next);
  return next;
}

async function requestSendcloudCancellation(input: { orderId: string; shipmentId: string; adminId: string; providerShipmentId: string; shipment: { status: unknown; actual_cost_cents: number; created_at: string } }): Promise<LabelRefundState> {
  const client = createServiceSupabase();
  if (!client) throw new LabelRefundError("La base de données est indisponible.", 503);
  if (!labelIsRefundable({ trackingStatus: input.shipment.status, purchasedAt: input.shipment.created_at })) throw new LabelRefundError("Cette étiquette est utilisée, scannée ou hors du délai de remboursement.");
  const { data: existing } = await client.from("webhook_events").select("payload,created_at").eq("provider", SENDCLOUD_REFUND_EVENT_PROVIDER).eq("provider_event_id", input.providerShipmentId).maybeSingle();
  if (existing) {
    const current = stateFromPayload(existing.payload, { createdAt: existing.created_at, originalCostCents: input.shipment.actual_cost_cents });
    if (current.status !== "PENDING" && current.status !== "REQUESTING") return current;
    if (!await sendcloudShipmentIsCancelled(input.providerShipmentId)) return current;
    const completed: LabelRefundState = { ...current, status: "SUCCESS", message: "Expédition annulée par Sendcloud.", updatedAt: new Date().toISOString() };
    await applySuccessfulRefund(client, { ...input, state: completed });
    const { error } = await client.from("webhook_events").update({ payload: completed, processed_at: new Date().toISOString(), processing_error: null }).eq("provider", SENDCLOUD_REFUND_EVENT_PROVIDER).eq("provider_event_id", input.providerShipmentId);
    if (error) throw new LabelRefundError(`Le statut de l’annulation n’a pas pu être enregistré : ${error.message}`, 500);
    return completed;
  }
  const now = new Date().toISOString();
  const requesting: LabelRefundState = { refundId: input.providerShipmentId, status: "REQUESTING", message: null, requestedAt: now, updatedAt: now, originalCostCents: input.shipment.actual_cost_cents };
  const { error: lockError } = await client.from("webhook_events").insert({ provider: SENDCLOUD_REFUND_EVENT_PROVIDER, provider_event_id: input.providerShipmentId, event_type: "label_cancellation", payload: requesting });
  if (lockError?.code === "23505") return requesting;
  if (lockError) throw new LabelRefundError(lockError.message, 500);
  try {
    const cancellation = await cancelSendcloudShipment(input.providerShipmentId);
    const state: LabelRefundState = { ...requesting, status: cancellation.status, message: cancellation.message, updatedAt: new Date().toISOString() };
    if (state.status === "SUCCESS") await applySuccessfulRefund(client, { ...input, state });
    await client.from("webhook_events").update({ payload: state, processed_at: state.status === "SUCCESS" ? new Date().toISOString() : null }).eq("provider", SENDCLOUD_REFUND_EVENT_PROVIDER).eq("provider_event_id", input.providerShipmentId);
    await client.from("audit_log").insert({ actor_id: input.adminId, action: "shipment.label_cancelled", entity_type: "shipment", entity_id: input.shipmentId, after_data: state });
    return state;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const state: LabelRefundState = { ...requesting, status: "ERROR", message, updatedAt: new Date().toISOString() };
    await client.from("webhook_events").update({ payload: state, processed_at: new Date().toISOString(), processing_error: message }).eq("provider", SENDCLOUD_REFUND_EVENT_PROVIDER).eq("provider_event_id", input.providerShipmentId);
    throw cause;
  }
}

export async function requestOrRefreshLabelRefund(input: { orderId: string; shipmentId: string; adminId: string }): Promise<LabelRefundState> {
  const client = createServiceSupabase();
  if (!client) throw new LabelRefundError("La base de données est indisponible.", 503);
  const { data: shipment, error: shipmentError } = await client.from("shipments")
    .select("id,order_id,label_provider,shippo_transaction_id,sendcloud_parcel_id,sendcloud_shipment_id,status,actual_cost_cents,created_at")
    .eq("id", input.shipmentId).eq("order_id", input.orderId).maybeSingle();
  if (shipmentError) throw new LabelRefundError(shipmentError.message, 500);
  if (!shipment) throw new LabelRefundError("Cette étiquette est introuvable.", 404);
  if (shipment.label_provider === "sendcloud" && shipment.sendcloud_shipment_id) return requestSendcloudCancellation({ ...input, providerShipmentId: shipment.sendcloud_shipment_id, shipment });
  if (!shipment.shippo_transaction_id) throw new LabelRefundError("Cette étiquette Shippo est introuvable.", 404);

  const { data: existing, error: existingError } = await client.from("webhook_events")
    .select("payload,created_at").eq("provider", REFUND_EVENT_PROVIDER).eq("provider_event_id", shipment.shippo_transaction_id).maybeSingle();
  if (existingError) throw new LabelRefundError(existingError.message, 500);
  if (existing) {
    const current = stateFromPayload(existing.payload, { createdAt: existing.created_at, originalCostCents: shipment.actual_cost_cents });
    return refreshExistingRefund(client, { ...input, transactionId: shipment.shippo_transaction_id, current });
  }

  if (!labelIsRefundable({ trackingStatus: shipment.status, purchasedAt: shipment.created_at })) throw new LabelRefundError("Cette étiquette est utilisée, scannée ou hors du délai de remboursement.");
  const now = new Date().toISOString();
  const requesting: LabelRefundState = { refundId: null, status: "REQUESTING", message: null, requestedAt: now, updatedAt: now, originalCostCents: shipment.actual_cost_cents };
  const { error: lockError } = await client.from("webhook_events").insert({ provider: REFUND_EVENT_PROVIDER, provider_event_id: shipment.shippo_transaction_id, event_type: "label_refund", payload: requesting });
  if (lockError?.code === "23505") {
    const { data: locked } = await client.from("webhook_events").select("payload,created_at").eq("provider", REFUND_EVENT_PROVIDER).eq("provider_event_id", shipment.shippo_transaction_id).single();
    return stateFromPayload(locked?.payload, { createdAt: locked?.created_at ?? now, originalCostCents: shipment.actual_cost_cents });
  }
  if (lockError) throw new LabelRefundError(lockError.message, 500);

  try {
    const transaction = await shippoRequest<ShippoTransaction>(`/transactions/${encodeURIComponent(shipment.shippo_transaction_id)}`);
    const transactionStatus = text(transaction.status).toUpperCase();
    const trackingStatus = normalizedTrackingStatus(transaction.tracking_status);
    const existingRefundStatus = labelRefundStatusFromTransaction(transactionStatus);
    if (existingRefundStatus) {
      const existingRefund: LabelRefundState = { ...requesting, status: existingRefundStatus, message: existingRefundStatus === "ERROR" ? (shippoMessages(transaction.messages) || "Shippo a refusé le remboursement de cette étiquette.") : null, updatedAt: new Date().toISOString() };
      if (existingRefund.status === "SUCCESS") await applySuccessfulRefund(client, { ...input, state: existingRefund });
      await storeState(client, shipment.shippo_transaction_id, existingRefund);
      return existingRefund;
    }
    if (transactionStatus !== "SUCCESS" || !REFUNDABLE_TRACKING_STATUSES.has(trackingStatus)) {
      const message = shippoMessages(transaction.messages) || "Shippo indique que cette étiquette ne peut plus être remboursée.";
      const rejected: LabelRefundState = { ...requesting, status: "ERROR", message, updatedAt: new Date().toISOString() };
      await storeState(client, shipment.shippo_transaction_id, rejected);
      return rejected;
    }
    const refund = await shippoRequest<ShippoRefund>("/refunds/", { method: "POST", body: JSON.stringify({ transaction: shipment.shippo_transaction_id, async: false }) });
    const refundId = text(refund.object_id);
    if (!refundId) throw new LabelRefundError("La réponse de Shippo ne contient pas d’identifiant de remboursement.", 502);
    const state: LabelRefundState = {
      ...requesting,
      refundId,
      status: normalizeLabelRefundStatus(refund.status),
      updatedAt: text(refund.object_updated) || text(refund.object_created) || new Date().toISOString(),
    };
    if (state.status === "SUCCESS") await applySuccessfulRefund(client, { ...input, state });
    await storeState(client, shipment.shippo_transaction_id, state);
    await client.from("audit_log").insert({ actor_id: input.adminId, action: "shipment.label_refund_requested", entity_type: "shipment", entity_id: input.shipmentId, after_data: state });
    return state;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (temporaryShippoRefundDelay(cause)) {
      const pending: LabelRefundState = { ...requesting, status: "PENDING", message, updatedAt: new Date().toISOString() };
      await storeState(client, shipment.shippo_transaction_id, pending);
      return pending;
    }
    const failed: LabelRefundState = { ...requesting, status: "ERROR", message, updatedAt: new Date().toISOString() };
    await storeState(client, shipment.shippo_transaction_id, failed).catch(() => undefined);
    throw cause;
  }
}

export async function getLabelRefundStates(transactionIds: string[], provider = REFUND_EVENT_PROVIDER): Promise<Record<string, LabelRefundState>> {
  if (!transactionIds.length) return {};
  const client = createServiceSupabase(); if (!client) return {};
  const { data, error } = await client.from("webhook_events").select("provider_event_id,payload,created_at")
    .eq("provider", provider).in("provider_event_id", transactionIds);
  if (error) throw new LabelRefundError(error.message, 500);
  return Object.fromEntries((data ?? []).map((row) => [row.provider_event_id, stateFromPayload(row.payload, { createdAt: row.created_at, originalCostCents: 0 })]));
}
