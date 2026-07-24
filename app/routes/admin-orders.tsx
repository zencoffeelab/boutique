import {
  Download,
  ExternalLink,
  PackageCheck,
  RotateCcw,
  Search,
} from "lucide-react";
import { z } from "zod";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { labelIsRefundable } from "~/domain/label-refunds";
import { formatMoney, formatSignedMoney } from "~/domain/money";
import { orderStatuses } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import {
  getLabelRefundStates,
  type LabelRefundState,
} from "~/services/label-refunds.server";

const updateSchema = z.object({
  intent: z.literal("update_order"),
  orderId: z.uuid(),
  status: z.enum(orderStatuses),
  notes: z.string().max(5_000).default(""),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "";
  if (admin.demo) return { demo: true, orders: [], search, status };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  let query = client
    .from("orders")
    .select("*,order_lines(*),shipments(*),payments(*)")
    .order("created_at", { ascending: false })
    .limit(100);
  const safeSearch = search.replace(/[^\p{L}\p{N}@._+\- ]/gu, "").slice(0, 120);
  if (status && orderStatuses.includes(status as never))
    query = query.eq("status", status);
  if (safeSearch)
    query = query.or(
      `order_number.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`,
    );
  const { data, error } = await query;
  if (error) throw new Response(error.message, { status: 500 });
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
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo)
    return { ok: false, message: "Lecture seule en démonstration." };
  const parsed = updateSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success) return { ok: false, message: "Mise à jour invalide." };
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };
  const { data: before } = await client
    .from("orders")
    .select("status,notes")
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

function OrderActions({ order }: { order: any }) {
  const label = useFetcher<{
    ok?: boolean;
    message?: string;
    labels?: Array<{ url: string }>;
  }>();
  const refund = useFetcher<{ ok?: boolean; message?: string }>();
  return (
    <div className="admin-order-actions">
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
      <refund.Form
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
          Motif
          <input name="reason" minLength={3} required />
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
                  "Demander le remboursement réel de cette étiquette ? Elle ne devra plus jamais être utilisée.",
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
                  ? "Rembourser l’étiquette"
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
  const { demo, orders, search, status } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <AdminShell active="orders">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Commerce</p>
          <h1>Commandes</h1>
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
      <Form className="admin-filter" method="get">
        <label>
          <span className="sr-only">Rechercher</span>
          <input name="q" defaultValue={search} placeholder="N° ou e-mail" />
        </label>
        <label>
          <span className="sr-only">Statut</span>
          <select name="status" defaultValue={status}>
            <option value="">Tous les statuts</option>
            {orderStatuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="ui-button ui-button--default" type="submit">
          <Search aria-hidden="true" /> Filtrer
        </button>
      </Form>
      <div className="admin-order-list">
        {orders.map((order) => {
          const contribution =
            order.subtotal_cents +
            order.shipping_charged_cents -
            order.cost_of_goods_cents -
            order.actual_shipping_cost_cents -
            order.stripe_fee_cents;
          const pickupPoint = order.shipping_address?.pickupPoint;
          return (
            <details className="ui-card admin-order" key={order.id}>
              <summary>
                <span>
                  <strong>{order.order_number}</strong>
                  <small>
                    {order.email} ·{" "}
                    {new Date(order.created_at).toLocaleDateString("fr-FR")}
                  </small>
                  <small className="admin-order__products">
                    {orderContentsLabel(order.order_lines)}
                  </small>
                </span>
                <Badge>{order.status}</Badge>
                <strong>{formatMoney(order.total_cents, "fr-FR")}</strong>
              </summary>
              <div className="admin-order__content">
                <div>
                  <h2>Lignes</h2>
                  {order.order_lines.map((line: any) => (
                    <p key={line.id}>
                      {line.quantity} × {line.product_name} ·{" "}
                      {line.variant_label}{" "}
                      <strong>
                        {formatMoney(line.line_total_cents, "fr-FR")}
                      </strong>
                    </p>
                  ))}
                  <p>
                    <strong>Livraison :</strong> {order.shipping_carrier} ·{" "}
                    {order.shipping_service}
                  </p>
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
                  <p>
                    Port facturé :{" "}
                    {formatMoney(order.shipping_charged_cents, "fr-FR")} · Port
                    réel :{" "}
                    {formatMoney(order.actual_shipping_cost_cents, "fr-FR")}
                  </p>
                  <p>
                    Contribution :{" "}
                    <strong>{formatSignedMoney(contribution, "fr-FR")}</strong>
                  </p>
                  <OrderActions order={order} />
                  {order.shipments?.length ? (
                    <section className="admin-shipments">
                      <h3>Étiquettes achetées</h3>
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
                  ) : null}
                </div>
                <Form method="post" className="form-grid">
                  <input type="hidden" name="intent" value="update_order" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <div className="field field--wide">
                    <label>
                      Statut
                      <select name="status" defaultValue={order.status}>
                        {orderStatuses.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="field field--wide">
                    <label>
                      Notes
                      <textarea name="notes" defaultValue={order.notes ?? ""} />
                    </label>
                  </div>
                  <button
                    className="ui-button ui-button--default"
                    type="submit"
                  >
                    Enregistrer
                  </button>
                </Form>
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
    </AdminShell>
  );
}
