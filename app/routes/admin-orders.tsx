import { Download, ExternalLink, PackageCheck, RotateCcw, Search } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData } from "react-router";
import { Logo } from "~/components/logo";
import { Badge } from "~/components/ui/badge";
import { formatMoney, formatSignedMoney } from "~/domain/money";
import { orderStatuses } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const updateSchema = z.object({ intent: z.literal("update_order"), orderId: z.uuid(), status: z.enum(orderStatuses), notes: z.string().max(5_000).default("") });

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request); const url = new URL(request.url); const search = url.searchParams.get("q")?.trim() ?? ""; const status = url.searchParams.get("status") ?? "";
  if (admin.demo) return { demo: true, orders: [], search, status };
  const client = createServiceSupabase(); if (!client) throw new Response("Database unavailable.", { status: 503 });
  let query = client.from("orders").select("*,order_lines(*),shipments(*),payments(*)").order("created_at", { ascending: false }).limit(100);
  const safeSearch = search.replace(/[^\p{L}\p{N}@._+\- ]/gu, "").slice(0, 120);
  if (status && orderStatuses.includes(status as never)) query = query.eq("status", status); if (safeSearch) query = query.or(`order_number.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
  const { data, error } = await query; if (error) throw new Response(error.message, { status: 500 }); return { demo: false, orders: data ?? [], search, status };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request); if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const parsed = updateSchema.safeParse(Object.fromEntries(await request.formData())); if (!parsed.success) return { ok: false, message: "Mise à jour invalide." };
  const client = createServiceSupabase(); if (!client) return { ok: false, message: "Base indisponible." };
  const { data: before } = await client.from("orders").select("status,notes").eq("id", parsed.data.orderId).single(); const { error } = await client.from("orders").update({ status: parsed.data.status, notes: parsed.data.notes, updated_at: new Date().toISOString() }).eq("id", parsed.data.orderId); if (error) return { ok: false, message: error.message };
  await client.from("audit_log").insert({ actor_id: admin.id, action: "order.updated", entity_type: "order", entity_id: parsed.data.orderId, before_data: before, after_data: parsed.data }); return { ok: true, message: "Commande mise à jour." };
}

export const meta: MetaFunction = () => [{ title: "Commandes | Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function OrderActions({ order }: { order: any }) {
  const label = useFetcher<{ ok?: boolean; message?: string; labels?: Array<{ url: string }> }>(); const refund = useFetcher<{ ok?: boolean; message?: string }>();
  return <div className="admin-order-actions"><label.Form method="post" action={`/api/admin/orders/${order.id}/label`}><button className="ui-button ui-button--outline ui-button--sm" type="submit" disabled={label.state !== "idle" || !["paid", "preparing", "ready_to_ship"].includes(order.status)}><PackageCheck aria-hidden="true" /> Acheter les étiquettes</button></label.Form>{label.data?.message ? <small>{label.data.message}</small> : null}{label.data?.labels?.map((item, index) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">Colis {index + 1} <ExternalLink aria-hidden="true" /></a>)}<refund.Form method="post" action={`/api/admin/orders/${order.id}/refund`}><label>Montant à rembourser (centimes)<input name="amountCents" type="number" min="1" max={order.total_cents} required /></label><label>Motif<input name="reason" minLength={3} required /></label><button className="ui-button ui-button--danger ui-button--sm" type="submit" disabled={refund.state !== "idle" || !order.paid_at}><RotateCcw aria-hidden="true" /> Rembourser</button></refund.Form>{refund.data?.message ? <small>{refund.data.message}</small> : null}</div>;
}

export default function AdminOrders() {
  const { demo, orders, search, status } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>();
  return <div className="admin-shell"><aside className="admin-sidebar"><Logo /><nav><Link to="/admin">Tableau de bord</Link><Link aria-current="page" to="/admin/commandes">Commandes</Link><Link to="/admin/contenus">Contenus</Link></nav></aside><main className="admin-main"><header className="admin-heading"><div><p className="eyebrow">Commerce</p><h1>Commandes</h1></div><a className="ui-button ui-button--outline" href="/admin/commandes.csv"><Download aria-hidden="true" /> Export CSV</a></header>{demo ? <p className="admin-notice">Les commandes réelles apparaîtront après connexion à Supabase.</p> : null}{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}<Form className="admin-filter" method="get"><label><span className="sr-only">Rechercher</span><input name="q" defaultValue={search} placeholder="N° ou e-mail" /></label><label><span className="sr-only">Statut</span><select name="status" defaultValue={status}><option value="">Tous les statuts</option>{orderStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><button className="ui-button ui-button--default" type="submit"><Search aria-hidden="true" /> Filtrer</button></Form><div className="admin-order-list">{orders.map((order) => { const contribution = order.subtotal_cents + order.shipping_charged_cents - order.cost_of_goods_cents - order.actual_shipping_cost_cents - order.stripe_fee_cents; const pickupPoint = order.shipping_address?.pickupPoint; return <details className="ui-card admin-order" key={order.id}><summary><span><strong>{order.order_number}</strong><small>{order.email} · {new Date(order.created_at).toLocaleDateString("fr-FR")}</small></span><Badge>{order.status}</Badge><strong>{formatMoney(order.total_cents, "fr-FR")}</strong></summary><div className="admin-order__content"><div><h2>Lignes</h2>{order.order_lines.map((line: any) => <p key={line.id}>{line.quantity} × {line.product_name} · {line.variant_label} <strong>{formatMoney(line.line_total_cents, "fr-FR")}</strong></p>)}<p><strong>Livraison :</strong> {order.shipping_carrier} · {order.shipping_service}</p>{pickupPoint ? <p><strong>Point relais :</strong> {pickupPoint.name}<br />{[pickupPoint.address1, pickupPoint.address2, pickupPoint.address3].filter(Boolean).join(", ")}<br />{pickupPoint.postalCode} {pickupPoint.city} · ID {pickupPoint.id}</p> : <p><strong>Adresse :</strong> {order.shipping_address.line1}, {order.shipping_address.postalCode} {order.shipping_address.city}</p>}<p>Port facturé : {formatMoney(order.shipping_charged_cents, "fr-FR")} · Port réel : {formatMoney(order.actual_shipping_cost_cents, "fr-FR")}</p><p>Contribution : <strong>{formatSignedMoney(contribution, "fr-FR")}</strong></p><OrderActions order={order} /></div><Form method="post" className="form-grid"><input type="hidden" name="intent" value="update_order" /><input type="hidden" name="orderId" value={order.id} /><div className="field field--wide"><label>Statut<select name="status" defaultValue={order.status}>{orderStatuses.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="field field--wide"><label>Notes<textarea name="notes" defaultValue={order.notes ?? ""} /></label></div><button className="ui-button ui-button--default" type="submit">Enregistrer</button></Form></div></details>; })}{orders.length === 0 ? <div className="empty-state"><h2>Aucune commande</h2></div> : null}</div></main></div>;
}
