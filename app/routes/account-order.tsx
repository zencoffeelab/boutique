import { ArrowLeft, ExternalLink, Package, Truck } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, data, redirect, useLoaderData } from "react-router";
import { formatMoney } from "~/domain/money";
import { getViewer } from "~/lib/auth.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";
import { createServiceSupabase } from "~/lib/supabase.server";

type OrderDetail = {
  id: string;
  order_number: string;
  status: string;
  subtotal_cents: number;
  shipping_charged_cents: number;
  total_cents: number;
  created_at: string;
  paid_at?: string | null;
  shipping_address?: Record<string, unknown> | null;
  shipping_carrier?: string | null;
  shipping_service?: string | null;
  order_lines?: Array<{ product_name: string; variant_label?: string | null; quantity: number; unit_price_cents: number; line_total_cents: number }> | null;
  shipments?: Array<{ carrier?: string | null; service?: string | null; tracking_number?: string | null; tracking_url?: string | null; status?: string | null }> | null;
};

function statusLabel(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ["En attente de paiement", "Awaiting payment"], paid: ["Payée", "Paid"], preparing: ["En préparation", "Preparing"],
    ready_to_ship: ["Prête à expédier", "Ready to ship"], shipped: ["Expédiée", "Shipped"], delivered: ["Livrée", "Delivered"],
    canceled: ["Annulée", "Cancelled"], partially_refunded: ["Partiellement remboursée", "Partially refunded"], refunded: ["Remboursée", "Refunded"],
  };
  return labels[status]?.[english ? 1 : 0] ?? status;
}

function addressLines(address: Record<string, unknown> | null | undefined) {
  if (!address) return [];
  const value = (...keys: string[]) => keys.map((key) => address[key]).find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim();
  const identity = [value("first_name", "firstName"), value("last_name", "lastName")].filter(Boolean).join(" ");
  return [identity, value("company"), value("line1", "address1", "address"), value("line2", "address2"), [value("postal_code", "postalCode"), value("city")].filter(Boolean).join(" "), value("country", "country_code", "countryCode")].filter((line): line is string => Boolean(line));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const accountPath = locale === "en-GB" ? "/en/my-account" : "/mon-compte";
  const viewer = await getViewer(request);
  if (!viewer || !params.id) throw redirect(accountPath);
  const client = createServiceSupabase();
  if (!client) throw data(null, { status: 503, statusText: "Database unavailable" });
  const { data: order } = await client.from("orders")
    .select("id,order_number,status,subtotal_cents,shipping_charged_cents,total_cents,created_at,paid_at,shipping_address,shipping_carrier,shipping_service,order_lines(product_name,variant_label,quantity,unit_price_cents,line_total_cents),shipments(carrier,service,tracking_number,tracking_url,status)")
    .eq("id", params.id).eq("profile_id", viewer.user.id).maybeSingle();
  if (!order) throw data(null, { status: 404, statusText: "Order not found" });
  return { locale, order: order as OrderDetail };
}

export const meta: MetaFunction<typeof loader> = ({ data: loaderData }) => {
  const english = loaderData?.locale === "en-GB";
  return pageMeta(english ? "Order details | Zen Coffee Lab" : "Détail de la commande | Zen Coffee Lab", english ? "Your Zen Coffee Lab order details." : "Les informations de votre commande Zen Coffee Lab.", english ? "/en/my-account/orders" : "/mon-compte/commandes");
};

export default function AccountOrder() {
  const { locale, order } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const shipment = order.shipments?.[0];
  const deliveryAddress = addressLines(order.shipping_address);

  return <>
    <header className="page-hero account-order-hero"><p className="eyebrow">{english ? "Private space" : "Espace privé"}</p><h1>{order.order_number}</h1><p className="lede">{english ? `Placed on ${new Date(order.created_at).toLocaleDateString(locale)}.` : `Passée le ${new Date(order.created_at).toLocaleDateString(locale)}.`}</p></header>
    <main className="page-shell account-order-page">
      <Link className="account-order-back" to={`${accountPath}#account-orders`}><ArrowLeft aria-hidden="true" />{english ? "Back to my orders" : "Retour à mes commandes"}</Link>
      <section className="account-order-summary" aria-label={english ? "Order summary" : "Récapitulatif de la commande"}>
        <div><small>{english ? "Status" : "Statut"}</small><span className="ui-badge account-order-status">{statusLabel(order.status, english)}</span></div>
        <div><small>{english ? "Total" : "Total"}</small><strong>{formatMoney(order.total_cents, locale)}</strong></div>
        <div><small>{english ? "Payment" : "Paiement"}</small><strong>{order.paid_at ? (english ? "Paid" : "Payée") : (english ? "Pending" : "En attente")}</strong></div>
      </section>
      <section className="account-order-detail__section"><div className="account-order-detail__heading"><Package aria-hidden="true" /><div><p className="eyebrow">{english ? "Items" : "Articles"}</p><h2>{english ? "Your coffees" : "Vos cafés"}</h2></div></div><div className="account-order-lines">{order.order_lines?.map((line, index) => <article key={`${line.product_name}-${index}`}><div><strong>{line.product_name}</strong>{line.variant_label ? <small>{line.variant_label}</small> : null}</div><span>×{line.quantity}</span><strong>{formatMoney(line.line_total_cents, locale)}</strong></article>)}</div><div className="account-order-totals"><span>{english ? "Subtotal" : "Sous-total"}<strong>{formatMoney(order.subtotal_cents, locale)}</strong></span><span>{english ? "Delivery" : "Livraison"}<strong>{formatMoney(order.shipping_charged_cents, locale)}</strong></span><span>{english ? "Total" : "Total"}<strong>{formatMoney(order.total_cents, locale)}</strong></span></div></section>
      <section className="account-order-detail__section account-order-delivery"><div className="account-order-detail__heading"><Truck aria-hidden="true" /><div><p className="eyebrow">{english ? "Delivery" : "Livraison"}</p><h2>{english ? "Delivery information" : "Informations de livraison"}</h2></div></div><div className="account-order-delivery__grid"><div>{deliveryAddress.map((line) => <p key={line}>{line}</p>)}</div><div>{shipment?.carrier || order.shipping_carrier ? <p><strong>{shipment?.carrier ?? order.shipping_carrier}{shipment?.service || order.shipping_service ? ` · ${shipment?.service ?? order.shipping_service}` : ""}</strong></p> : null}{shipment?.tracking_number ? <p>{english ? "Tracking number:" : "Numéro de suivi :"} {shipment.tracking_number}</p> : null}{shipment?.tracking_url ? <a className="text-link" href={shipment.tracking_url} target="_blank" rel="noreferrer">{english ? "Track delivery" : "Suivre la livraison"}<ExternalLink aria-hidden="true" /></a> : null}</div></div></section>
      {order.paid_at ? <a className="ui-button ui-button--ghost account-order-invoice" href={`/api/orders/${order.id}/invoice`}>{english ? "Download invoice" : "Télécharger la facture"}</a> : null}
    </main>
  </>;
}
