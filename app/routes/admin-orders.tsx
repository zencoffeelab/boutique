import {
  Download,
  ExternalLink,
  PackageCheck,
  RotateCcw,
  Search,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { labelIsRefundable } from "~/domain/label-refunds";
import { formatMoney } from "~/domain/money";
import { orderStatuses, type OrderStatus } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { orderStatusEmail } from "~/services/email-templates.server";
import {
  getLabelRefundStates,
  type LabelRefundState,
} from "~/services/label-refunds.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";

const updateSchema = z.object({
  intent: z.literal("update_order"),
  orderId: z.uuid(),
  status: z.enum(orderStatuses),
  notes: z.string().max(5_000).default(""),
});
const archiveSchema = z.object({
  intent: z.literal("archive_order"),
  orderId: z.uuid(),
});
const archiveSelectedSchema = z.object({
  intent: z.literal("archive_selected"),
  orderIds: z.array(z.uuid()).min(1),
});
const restoreSchema = z.object({
  intent: z.literal("restore_order"),
  orderId: z.uuid(),
});
const restoreSelectedSchema = z.object({
  intent: z.literal("restore_selected"),
  orderIds: z.array(z.uuid()).min(1),
});
const prepareSelectedSchema = z.object({
  intent: z.literal("prepare_selected"),
  orderIds: z.array(z.uuid()).min(1),
});
const shipSelectedSchema = z.object({
  intent: z.literal("ship_selected"),
  orderIds: z.array(z.uuid()).min(1),
});

const validatedOrderStatuses = ["paid", "preparing", "ready_to_ship", "shipped", "delivered", "partially_refunded", "refunded"] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "";
  const requestedView = url.searchParams.get("view");
  const view = requestedView === "archived" || requestedView === "preparing" || requestedView === "to_ship" ? requestedView : "active";
  const pageSize = 50;
  const page = view === "archived" ? Math.max(0, Math.min(Number(url.searchParams.get("page") ?? 0) || 0, 100_000)) : 0;
  if (admin.demo) return { demo: true, orders: [], search, status, view, pagination: { page, pageSize, total: 0, hasNext: false, hasPrevious: page > 0 }, cartStats: { unvalidated: 0, total: 0 } };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { error: viewedUpdateError } = await client.from("orders").update({ admin_viewed_at: new Date().toISOString() }).not("paid_at", "is", null).is("admin_viewed_at", null);
  // La page Commandes reste disponible pendant le court intervalle entre le
  // déploiement du Worker et l'application de la migration associée.
  const notificationColumnUnavailable = viewedUpdateError?.code === "42703"
    || (viewedUpdateError?.code === "PGRST204" && viewedUpdateError.message.includes("admin_viewed_at"));
  if (viewedUpdateError && !notificationColumnUnavailable) throw new Response(viewedUpdateError.message, { status: 500 });
  let query = client
    .from("orders")
    .select("*,order_lines(*),shipments(*),payments(*)")
    .order("created_at", { ascending: false })
    .limit(view === "archived" ? 0 : 100);
  if (view !== "archived") {
    query = query.is("archived_at", null).neq("status", "pending_payment");
    if (view === "active") query = query.not("status", "in", "(preparing,ready_to_ship)");
    if (view === "preparing") query = query.eq("status", "preparing");
    if (view === "to_ship") query = query.eq("status", "ready_to_ship");
  }
  const safeSearch = search.replace(/[^\p{L}\p{N}@._+\- ]/gu, "").slice(0, 120);
  if (view === "archived") query = query.not("archived_at", "is", null);
  if (status && orderStatuses.includes(status as never))
    query = query.eq("status", status);
  if (safeSearch)
    query = query.or(
      `order_number.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`,
    );
  let { data, error } = await query;
  const archiveColumnUnavailable = error?.code === "42703"
    || (error?.code === "PGRST204" && error.message.includes("archived_at"));
  if (archiveColumnUnavailable && view === "active") {
    // Keep the page usable during the short interval before the migration is applied.
    ({ data, error } = await client
      .from("orders")
      .select("*,order_lines(*),shipments(*),payments(*)")
      .neq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(100));
  }
  if (error) throw new Response(error.message, { status: 500 });
  if (view === "archived") {
    let archivedQuery = client
      .from("orders")
      .select("id,order_number,email,status,total_cents,created_at,archived_at,archived_snapshot", { count: "exact" })
      .not("archived_at", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (status && orderStatuses.includes(status as never)) archivedQuery = archivedQuery.eq("status", status);
    if (safeSearch) archivedQuery = archivedQuery.or(`order_number.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
    const { data: archivedData, error: archivedError, count: archivedCount } = await archivedQuery;
    if (archivedError) throw new Response(archivedError.message, { status: 500 });
    const archivedOrders = (archivedData ?? []).map((order: any) => {
      const snapshot = order.archived_snapshot ?? {};
      return {
        ...order,
        shipping_address: snapshot.shipping_address ?? null,
        shipping_carrier: snapshot.shipping_carrier ?? "",
        shipping_service: snapshot.shipping_service ?? "",
        shipping_charged_cents: snapshot.shipping_charged_cents ?? 0,
        actual_shipping_cost_cents: 0,
        order_lines: Array.isArray(snapshot.lines) ? snapshot.lines : [],
        shipments: [],
        payments: [],
      };
    });
    return {
      demo: false,
      orders: archivedOrders,
      search,
      status,
      view,
      pagination: { page, pageSize, total: archivedCount ?? 0, hasNext: (archivedCount ?? 0) > (page + 1) * pageSize, hasPrevious: page > 0 },
      cartStats: { unvalidated: 0, total: 0 },
    };
  }
  const [unvalidatedResult, validatedResult] = await Promise.all([
    client.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
    client.from("orders").select("id", { count: "exact", head: true }).in("status", [...validatedOrderStatuses]).is("archived_at", null),
  ]);
  const countError = unvalidatedResult.error ?? validatedResult.error;
  if (countError) throw new Response(countError.message, { status: 500 });
  const unvalidated = unvalidatedResult.count ?? 0;
  const validated = validatedResult.count ?? 0;
  const orders = data ?? [];
  const transactionIds = [
    ...new Set(
      orders
        .flatMap((order) => order.shipments ?? [])
        .flatMap((shipment: any) =>
          shipment.shippo_transaction_id
            ? [shipment.shippo_transaction_id]
            : [],
        ),
    ),
  ];
  const sendcloudShipmentIds = [
    ...new Set(
      orders
        .flatMap((order) => order.shipments ?? [])
        .flatMap((shipment: any) =>
          shipment.sendcloud_shipment_id
            ? [shipment.sendcloud_shipment_id]
            : [],
        ),
    ),
  ];
  const [refunds, sendcloudRefunds] = await Promise.all([
    getLabelRefundStates(transactionIds),
    getLabelRefundStates(sendcloudShipmentIds, "sendcloud-label-refund"),
  ]);
  return {
    demo: false,
    orders: orders.map((order) => ({
      ...order,
      shipments: (order.shipments ?? []).map((shipment: any) => ({
        ...shipment,
        label_refund: shipment.shippo_transaction_id
          ? refunds[shipment.shippo_transaction_id]
          : shipment.sendcloud_shipment_id
            ? sendcloudRefunds[shipment.sendcloud_shipment_id]
            : undefined,
      })),
    })),
    search,
    status,
    view,
    pagination: { page: 0, pageSize, total: orders.length, hasNext: false, hasPrevious: false },
    cartStats: { unvalidated, total: unvalidated + validated },
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo)
    return { ok: false, message: "Lecture seule en démonstration." };
  const requestFormData = await request.formData();
  const formData = Object.fromEntries(requestFormData);
  const archive = archiveSchema.safeParse(formData);
  const archiveSelected = archiveSelectedSchema.safeParse({
    intent: requestFormData.get("intent"),
    orderIds: requestFormData.getAll("orderId"),
  });
  const restore = restoreSchema.safeParse(formData);
  const restoreSelected = restoreSelectedSchema.safeParse({
    intent: requestFormData.get("intent"),
    orderIds: requestFormData.getAll("orderId"),
  });
  const prepareSelected = prepareSelectedSchema.safeParse({
    intent: requestFormData.get("intent"),
    orderIds: requestFormData.getAll("orderId"),
  });
  const shipSelected = shipSelectedSchema.safeParse({
    intent: requestFormData.get("intent"),
    orderIds: requestFormData.getAll("orderId"),
  });
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };
  if (archive.success) {
    const { error } = await client.rpc("archive_order", { p_order_id: archive.data.orderId });
    if (error) return { ok: false, message: error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "order.archived", entity_type: "order", entity_id: archive.data.orderId, after_data: { archived: true } });
    return { ok: true, message: "Commande archivée. Elle reste disponible dans l’onglet Archivées." };
  }
  if (archiveSelected.success) {
    let archivedCount = 0;
    for (const orderId of archiveSelected.data.orderIds) {
      const { error } = await client.rpc("archive_order", { p_order_id: orderId });
      if (error) return { ok: false, message: error.message };
      archivedCount += 1;
    }
    await client.from("audit_log").insert({ actor_id: admin.id, action: "orders.archived_bulk", entity_type: "order", entity_id: archiveSelected.data.orderIds.join(","), after_data: { archived_count: archivedCount } });
    return { ok: true, message: `${archivedCount} commande${archivedCount > 1 ? "s" : ""} archivée${archivedCount > 1 ? "s" : ""}.` };
  }
  if (restore.success) {
    const { error } = await client.from("orders").update({ archived_at: null, archived_snapshot: null, updated_at: new Date().toISOString() }).eq("id", restore.data.orderId).not("archived_at", "is", null);
    if (error) return { ok: false, message: error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "order.restored", entity_type: "order", entity_id: restore.data.orderId, after_data: { archived: false } });
    return { ok: true, message: "Commande désarchivée. Elle est de nouveau visible dans Actives." };
  }
  if (restoreSelected.success) {
    const { data, error } = await client.from("orders").update({ archived_at: null, archived_snapshot: null, updated_at: new Date().toISOString() }).in("id", restoreSelected.data.orderIds).not("archived_at", "is", null).select("id");
    if (error) return { ok: false, message: error.message };
    const restoredCount = data?.length ?? 0;
    await client.from("audit_log").insert({ actor_id: admin.id, action: "orders.restored_bulk", entity_type: "order", entity_id: restoreSelected.data.orderIds.join(","), after_data: { restored_count: restoredCount } });
    return { ok: true, message: `${restoredCount} commande${restoredCount > 1 ? "s" : ""} désarchivée${restoredCount > 1 ? "s" : ""}.` };
  }
  if (prepareSelected.success) {
    const { data, error } = await client.from("orders").update({ status: "preparing", updated_at: new Date().toISOString() }).in("id", prepareSelected.data.orderIds).is("archived_at", null).neq("status", "pending_payment").select("id");
    if (error) return { ok: false, message: error.message };
    const preparedCount = data?.length ?? 0;
    await client.from("audit_log").insert({ actor_id: admin.id, action: "orders.preparing_bulk", entity_type: "order", entity_id: prepareSelected.data.orderIds.join(","), after_data: { prepared_count: preparedCount } });
    return { ok: true, message: `${preparedCount} commande${preparedCount > 1 ? "s" : ""} passée${preparedCount > 1 ? "s" : "e"} en préparation.` };
  }
  if (shipSelected.success) {
    const { data, error } = await client.from("orders").update({ status: "ready_to_ship", updated_at: new Date().toISOString() }).in("id", shipSelected.data.orderIds).eq("status", "preparing").is("archived_at", null).select("id");
    if (error) return { ok: false, message: error.message };
    const shippedCount = data?.length ?? 0;
    await client.from("audit_log").insert({ actor_id: admin.id, action: "orders.ready_to_ship_bulk", entity_type: "order", entity_id: shipSelected.data.orderIds.join(","), after_data: { ready_to_ship_count: shippedCount } });
    return { ok: true, message: `${shippedCount} commande${shippedCount > 1 ? "s" : ""} passée${shippedCount > 1 ? "s" : "e"} à expédier.` };
  }
  const parsed = updateSchema.safeParse(formData);
  if (!parsed.success) return { ok: false, message: "Mise à jour invalide." };
  const { data: before } = await client
    .from("orders")
    .select("status,notes,email,locale,order_number")
    .eq("id", parsed.data.orderId)
    .single();
  const { error } = await client
    .from("orders")
    .update({
      status: parsed.data.status,
      notes: parsed.data.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.orderId);
  if (error) return { ok: false, message: error.message };
  if (before?.email && before.status !== parsed.data.status && ["preparing", "ready_to_ship", "canceled"].includes(parsed.data.status)) {
    const content = orderStatusEmail({ locale: before.locale, orderNumber: before.order_number, status: parsed.data.status as "preparing" | "ready_to_ship" | "canceled" });
    await enqueueNotification({ kind: "order_status", to: before.email, locale: before.locale, ...content, payload: { orderId: parsed.data.orderId, status: parsed.data.status }, dedupeKey: `order-status/${parsed.data.orderId}/${parsed.data.status}` });
    dispatchNotificationQueue(context, "order_status_notification_delivery_failed");
  }
  await client
    .from("audit_log")
    .insert({
      actor_id: admin.id,
      action: "order.updated",
      entity_type: "order",
      entity_id: parsed.data.orderId,
      before_data: before,
      after_data: parsed.data,
    });
  return { ok: true, message: "Commande mise à jour." };
}

export const meta: MetaFunction = () => [
  { title: "Commandes | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

function LabelPurchaseAction({ order }: { order: any }) {
  const label = useFetcher<{
    ok?: boolean;
    message?: string;
    labels?: Array<{ url: string }>;
  }>();
  const revalidator = useRevalidator();
  const handledResult = useRef<unknown>(undefined);

  useEffect(() => {
    if (!label.data?.ok || label.data === handledResult.current) return;
    handledResult.current = label.data;
    revalidator.revalidate();
  }, [label.data, revalidator]);

  return (
    <div className="admin-order-actions admin-order-label-purchase">
      <label.Form method="post" action={`/api/admin/orders/${order.id}/label`}>
        <button
          className="ui-button ui-button--outline ui-button--sm"
          type="submit"
          disabled={
            label.state !== "idle" ||
            !order.paid_at ||
            !["paid", "preparing", "ready_to_ship"].includes(order.status)
          }
        >
          <PackageCheck aria-hidden="true" /> Acheter les étiquettes
        </button>
      </label.Form>
      {label.data?.message ? <small>{label.data.message}</small> : null}
      {label.data?.labels?.map((item, index) => (
        <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
          Colis {index + 1} <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function RefundOrderAction({ order }: { order: any }) {
  const refund = useFetcher<{ ok?: boolean; message?: string }>();
  return (
    <div className="admin-order-actions admin-order-refund-action">
      <refund.Form
        className="admin-order-refund-form"
        method="post"
        action={`/api/admin/orders/${order.id}/refund`}
      >
        <label>
          Montant à rembourser (centimes)
          <input
            name="amountCents"
            type="number"
            min="1"
            max={order.total_cents}
            required
          />
        </label>
        <label>
          <span>Motif<br /><small>(facultatif)</small></span>
          <input name="reason" maxLength={500} />
        </label>
        <button
          className="ui-button ui-button--danger ui-button--sm"
          type="submit"
          disabled={refund.state !== "idle" || !order.paid_at}
        >
          <RotateCcw aria-hidden="true" /> Rembourser
        </button>
      </refund.Form>
      {refund.data?.message ? <small>{refund.data.message}</small> : null}
    </div>
  );
}

const refundStatusLabels: Record<LabelRefundState["status"], string> = {
  REQUESTING: "Demande en cours",
  QUEUED: "Demande enregistrée",
  PENDING: "En attente du transporteur",
  SUCCESS: "Étiquette remboursée",
  ERROR: "Remboursement refusé ou en erreur",
};

const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  paid: "Payée",
  preparing: "En préparation",
  ready_to_ship: "Prête à expédier",
  shipped: "Expédiée",
  delivered: "Livrée",
  canceled: "Annulée",
  partially_refunded: "Partiellement remboursée",
  refunded: "Remboursée",
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={`admin-order-status admin-order-status--${status}`}>{orderStatusLabels[status]}</Badge>;
}

export function orderContentsLabel(
  lines: readonly {
    quantity: number;
    product_name: string;
    variant_label: string;
  }[],
) {
  if (lines.length === 0) return "Aucun article";
  return lines
    .map(
      (line) =>
        `${line.quantity} × ${line.product_name} · ${line.variant_label}`,
    )
    .join(" | ");
}

function OrderContents({
  lines,
  compact = false,
}: {
  lines: readonly { quantity: number; product_name: string; variant_label: string; unit_price_cents?: number; line_total_cents?: number }[];
  compact?: boolean;
}) {
  if (lines.length === 0) return <span className="admin-order__empty-lines">Aucun article</span>;
  return (
    <span className={`admin-order__line-list${compact ? " admin-order__line-list--compact" : ""}`}>
      {lines.map((line, index) => (
        <span className="admin-order__line" key={`${line.product_name}-${line.variant_label}-${index}`}>
          <strong>{line.quantity} ×</strong>
          <span>{line.product_name} · {line.variant_label}</span>
          {!compact && typeof line.line_total_cents === "number" ? <span className="admin-order__line-price">{formatMoney(line.line_total_cents, "fr-FR")}</span> : null}
        </span>
      ))}
    </span>
  );
}

function ShipmentActions({
  orderId,
  shipment,
}: {
  orderId: string;
  shipment: any;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    message?: string | null;
    refund?: LabelRefundState;
  }>();
  const refund =
    fetcher.data?.refund ??
    (shipment.label_refund as LabelRefundState | undefined);
  const pending =
    refund && ["REQUESTING", "QUEUED", "PENDING"].includes(refund.status);
  const canRequest = Boolean(
    (shipment.shippo_transaction_id || shipment.sendcloud_parcel_id) &&
    shipment.label_url &&
    !refund &&
    labelIsRefundable({
      trackingStatus: shipment.status,
      purchasedAt: shipment.created_at,
    }),
  );
  const canRefresh = Boolean(pending);
  const formAction = `/api/admin/orders/${orderId}/shipments/${shipment.id}/refund-label`;
  return (
    <article className="admin-shipment">
      <div>
        <strong>Colis {Number(shipment.parcel_index) + 1}</strong>
        <small>
          {shipment.carrier} · {shipment.service} ·{" "}
          {formatMoney(shipment.actual_cost_cents, "fr-FR")}
        </small>
      </div>
      <div className="admin-shipment__actions">
        {shipment.label_url && !refund ? (
          <a
            className="text-link"
            href={shipment.label_url}
            target="_blank"
            rel="noreferrer"
          >
            Télécharger l’étiquette <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
        {refund ? (
          <span
            className={`ui-badge label-refund-status label-refund-status--${refund.status.toLowerCase()}`}
          >
            {refundStatusLabels[refund.status]}
          </span>
        ) : null}
        {canRequest || canRefresh ? (
          <fetcher.Form
            method="post"
            action={formAction}
            onSubmit={(event) => {
              if (
                canRequest &&
                !window.confirm(
                  "Annuler cette étiquette et la livraison prévue ? Sendcloud sera averti et le remboursement sera demandé. Cette étiquette ne devra plus jamais être utilisée.",
                )
              )
                event.preventDefault();
            }}
          >
            <button
              className={
                canRequest
                  ? "ui-button ui-button--danger ui-button--sm"
                  : "ui-button ui-button--outline ui-button--sm"
              }
              type="submit"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? "Traitement…"
                : canRequest
                  ? "Annuler l’étiquette"
                  : "Actualiser le remboursement"}
            </button>
          </fetcher.Form>
        ) : null}
        {refund?.message || fetcher.data?.message ? (
          <small className="form-error">
            {refund?.message ?? fetcher.data?.message}
          </small>
        ) : null}
        {pending ? (
          <small>
            Ne déposez plus ce colis avec cette étiquette. Le crédit
            transporteur peut prendre plusieurs jours.
          </small>
        ) : null}
      </div>
    </article>
  );
}

export default function AdminOrders() {
  const { demo, orders, search, status, view, pagination, cartStats } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const revalidator = useRevalidator();
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const selectedProductTotals = orders
    .filter((order) => selectedOrderIds.includes(order.id))
    .flatMap((order) => order.order_lines ?? [])
    .reduce<Record<string, number>>((totals, line: any) => {
      const key = `${line.product_name} · ${line.variant_label}`;
      totals[key] = (totals[key] ?? 0) + Number(line.quantity ?? 0);
      return totals;
    }, {});
  const preparingProductTotals = orders
    .flatMap((order) => order.order_lines ?? [])
    .reduce<Record<string, number>>((totals, line: any) => {
      const key = `${line.product_name} · ${line.variant_label}`;
      totals[key] = (totals[key] ?? 0) + Number(line.quantity ?? 0) * Number(line.unit_weight_grams ?? 0);
      return totals;
    }, {});
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.includes(order.id));
  const toggleAllOrders = () => setSelectedOrderIds(allVisibleSelected ? [] : orders.map((order) => order.id));
  const toggleOrder = (orderId: string) => setSelectedOrderIds((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]);
  useEffect(() => {
    setSelectedOrderIds((current) => current.filter((id) => orders.some((order) => order.id === id)));
  }, [orders]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (revalidator.state === "idle") revalidator.revalidate(); }, 15_000);
    return () => window.clearInterval(interval);
  }, [revalidator]);
  return (
    <AdminShell active="orders">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Commerce</p>
          <h1>{view === "archived" ? "Commandes archivées" : view === "preparing" ? "Commandes en préparation" : view === "to_ship" ? "Commandes à expédier" : "Commandes"}</h1>
          <p className="admin-order-cart-indicator" aria-live="polite"><strong>{cartStats.unvalidated}/{cartStats.total}</strong><span>paniers non validés / commandes validées + paniers non validés</span></p>
        </div>
        <a className="ui-button ui-button--outline" href="/admin/commandes.csv">
          <Download aria-hidden="true" /> Export CSV
        </a>
      </header>
      {demo ? (
        <p className="admin-notice">
          Les commandes réelles apparaîtront après connexion à Supabase.
        </p>
      ) : null}
      {result?.message ? (
        <p className={result.ok ? "form-message" : "form-message form-error"}>
          {result.message}
        </p>
      ) : null}
      <nav className="admin-order-tabs" aria-label="Vue des commandes">
        <a className={view === "active" ? "is-active" : ""} href="/admin/commandes">Actives</a>
        <a className={view === "preparing" ? "is-active" : ""} href="/admin/commandes?view=preparing">En préparation</a>
        <a className={view === "to_ship" ? "is-active" : ""} href="/admin/commandes?view=to_ship">À expédier</a>
        <a className={view === "archived" ? "is-active" : ""} href="/admin/commandes?view=archived">Archivées</a>
      </nav>
      {orders.length > 0 ? (
        <div className="admin-order-bulk-actions">
          <label>
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllOrders} />
            {allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </label>
          <Form id="bulk-archive-form" method="post" onSubmit={(event) => {
            const actionLabel = view === "archived" ? "Désarchiver" : "Archiver";
            if (!selectedOrderIds.length || !window.confirm(`${actionLabel} ${selectedOrderIds.length} commande${selectedOrderIds.length > 1 ? "s" : ""} ?`)) event.preventDefault();
          }}>
            <input type="hidden" name="intent" value={view === "archived" ? "restore_selected" : "archive_selected"} />
            <button className="ui-button ui-button--outline ui-button--sm" type="submit" disabled={!selectedOrderIds.length}>
              {view === "archived" ? <><ArchiveRestore aria-hidden="true" /> Désarchiver la sélection</> : <><Archive aria-hidden="true" /> Archiver la sélection</>} ({selectedOrderIds.length})
            </button>
          </Form>
          {view === "active" ? (
            <Form method="post" onSubmit={(event) => {
              if (!selectedOrderIds.length || !window.confirm("Calculer les quantités sélectionnées et passer ces commandes en préparation ?")) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="prepare_selected" />
              {selectedOrderIds.map((orderId) => <input key={orderId} type="hidden" name="orderId" value={orderId} />)}
              <button className="ui-button ui-button--default ui-button--sm" type="submit" disabled={!selectedOrderIds.length}>Calculer les cafés et préparer</button>
            </Form>
          ) : null}
          {view === "preparing" ? (
            <Form method="post" onSubmit={(event) => {
              if (!selectedOrderIds.length || !window.confirm("Passer les commandes sélectionnées à expédier ?")) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="ship_selected" />
              {selectedOrderIds.map((orderId) => <input key={orderId} type="hidden" name="orderId" value={orderId} />)}
              <button className="ui-button ui-button--default ui-button--sm" type="submit" disabled={!selectedOrderIds.length}>Passer à expédier</button>
            </Form>
          ) : null}
        </div>
      ) : null}
      {view === "active" && selectedOrderIds.length > 0 ? (
        <div className="admin-order-selection-summary">
          <strong>Quantités sélectionnées</strong>
          {Object.entries(selectedProductTotals).map(([label, quantity]) => <span key={label}>{quantity} × {label}</span>)}
        </div>
      ) : null}
      {view === "preparing" && orders.length > 0 ? (
        <div className="admin-order-selection-summary admin-order-preparing-summary">
          <strong>Quantités totales à préparer</strong>
          <table>
            <thead><tr><th>Café et poids total</th></tr></thead>
            <tbody>{Object.entries(preparingProductTotals).sort(([left], [right]) => left.localeCompare(right, "fr-FR")).map(([label, grams]) => <tr key={label}><td><span>{label}</span><strong>{grams.toLocaleString("fr-FR")} g</strong></td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      <Form className="admin-filter" method="get">
        {view === "archived" ? <input type="hidden" name="view" value="archived" /> : null}
        <label>
          <span className="sr-only">Rechercher</span>
          <input name="q" defaultValue={search} placeholder="N° ou e-mail" />
        </label>
        <label>
          <span className="sr-only">Statut</span>
          <select name="status" defaultValue={status}>
            <option value="">Tous les statuts</option>
            {orderStatuses.filter((item) => item !== "pending_payment").map((item) => (
              <option key={item} value={item}>{orderStatusLabels[item]}</option>
            ))}
          </select>
        </label>
        <button className="ui-button ui-button--default" type="submit">
          <Search aria-hidden="true" /> Filtrer
        </button>
      </Form>
      <div className="admin-order-list">
        {orders.map((order) => {
          const pickupPoint = order.shipping_address?.pickupPoint;
          return (
            <details className={`ui-card admin-order admin-order--${order.status}`} key={order.id}>
              <summary>
                <span className="admin-order__summary-main has-selection">
                  <input type="checkbox" name="orderId" value={order.id} form="bulk-archive-form" checked={selectedOrderIds.includes(order.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleOrder(order.id)} aria-label={`Sélectionner la commande ${order.order_number}`} />
                  <span className="admin-order__identity">
                    <strong>{order.order_number}</strong>
                    <small>
                      {order.email} ·{" "}
                      {new Date(order.created_at).toLocaleDateString("fr-FR")}
                    </small>
                    <OrderContents lines={order.order_lines} compact />
                  </span>
                </span>
                <OrderStatusBadge status={order.status as OrderStatus} />
                <strong>{formatMoney(order.total_cents, "fr-FR")}</strong>
                {view !== "archived" ? (
                  <Form method="post" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
                    if (!window.confirm("Archiver cette commande ? Elle restera consultable dans Archivées.")) event.preventDefault();
                  }}>
                    <input type="hidden" name="intent" value="archive_order" />
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="ui-button ui-button--outline ui-button--sm" type="submit"><Archive aria-hidden="true" /> Archiver</button>
                  </Form>
                ) : (
                  <Form method="post" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
                    if (!window.confirm("Désarchiver cette commande ? Elle sera de nouveau visible dans Actives.")) event.preventDefault();
                  }}>
                    <input type="hidden" name="intent" value="restore_order" />
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="ui-button ui-button--outline ui-button--sm" type="submit"><ArchiveRestore aria-hidden="true" /> Désarchiver</button>
                  </Form>
                )}
              </summary>
              <div className="admin-order__content">
                <section className="admin-order__column admin-order__column--summary">
                    <h2>Résumé de la commande</h2>
                    <OrderContents lines={order.order_lines} />
                  <section className="admin-order-delivery">
                    <h2>Livraison</h2>
                    <p><strong>{order.shipping_carrier}</strong> · {order.shipping_service}</p>
                  {pickupPoint ? (
                    <p>
                      <strong>Point relais :</strong> {pickupPoint.name}
                      <br />
                      {[
                        pickupPoint.address1,
                        pickupPoint.address2,
                        pickupPoint.address3,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      <br />
                      {pickupPoint.postalCode} {pickupPoint.city} · ID{" "}
                      {pickupPoint.id}
                    </p>
                  ) : (
                    <p>
                      <strong>Adresse :</strong> {order.shipping_address.line1},{" "}
                      {order.shipping_address.postalCode}{" "}
                      {order.shipping_address.city}
                    </p>
                  )}
                  <p>Port facturé : {formatMoney(order.shipping_charged_cents, "fr-FR")}</p>
                  <p className="admin-order__shipping-cost--actual">Port réel : {formatMoney(order.actual_shipping_cost_cents, "fr-FR")}</p>
                  <p className="admin-order__total"><strong>Total :</strong> {formatMoney(order.total_cents, "fr-FR")}</p>
                  </section>
                </section>
                <aside className="admin-order__column admin-order__operations">
                  <h2>Actions</h2>
                  <RefundOrderAction order={order} />
                  <LabelPurchaseAction order={order} />
                  <Form method="post" className="admin-order__update-form">
                  <input type="hidden" name="intent" value="update_order" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <div className="field">
                    <label>
                      Statut
                      <select name="status" defaultValue={order.status}>
                        {orderStatuses.map((item) => (
                          <option key={item} value={item}>{orderStatusLabels[item]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="field">
                    <label>
                      Notes
                      <textarea name="notes" defaultValue={order.notes ?? ""} rows={1} />
                    </label>
                  </div>
                  <button
                    className="ui-button ui-button--default ui-button--sm"
                    type="submit"
                  >
                    Enregistrer
                  </button>
                  </Form>
                </aside>
                <section className="admin-order__column admin-order-labels">
                  <h2>Étiquettes achetées</h2>
                  {order.shipments?.length ? (
                    <section className="admin-shipments">
                      <p>
                        <small>
                          L’annulation crédite le transporteur ayant émis
                          l’étiquette. Elle ne rembourse pas le paiement du client.
                        </small>
                      </p>
                      {order.shipments
                        .toSorted(
                          (a: any, b: any) => a.parcel_index - b.parcel_index,
                        )
                        .map((shipment: any) => (
                          <ShipmentActions
                            orderId={order.id}
                            shipment={shipment}
                            key={shipment.id}
                          />
                        ))}
                    </section>
                  ) : <p className="admin-order__no-labels">Aucune étiquette achetée</p>}
                </section>
              </div>
            </details>
          );
        })}
        {orders.length === 0 ? (
          <div className="empty-state">
            <h2>Aucune commande</h2>
          </div>
        ) : null}
      </div>
      {view === "archived" && pagination.total > 0 ? (
        <nav className="admin-order-pagination" aria-label="Pagination des commandes archivées">
          {pagination.hasPrevious ? <Link className="ui-button ui-button--outline ui-button--sm" to={`/admin/commandes?view=archived&page=${pagination.page - 1}${search ? `&q=${encodeURIComponent(search)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`}>Précédente</Link> : <span />}
          <span>Page {pagination.page + 1} · {pagination.total} commande{pagination.total > 1 ? "s" : ""}</span>
          {pagination.hasNext ? <Link className="ui-button ui-button--outline ui-button--sm" to={`/admin/commandes?view=archived&page=${pagination.page + 1}${search ? `&q=${encodeURIComponent(search)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`}>Suivante</Link> : <span />}
        </nav>
      ) : null}
    </AdminShell>
  );
}
