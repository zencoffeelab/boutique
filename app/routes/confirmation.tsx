import { Check } from "lucide-react";
import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getLocale } from "~/lib/i18n";
import { useCart } from "~/components/cart/cart-provider";

export function loader({ request }: LoaderFunctionArgs) { const url = new URL(request.url); return { locale: getLocale(request), order: url.searchParams.get("order") }; }
export const meta: MetaFunction = () => [{ title: "Commande confirmée | Zen Coffee Lab" }, { name: "robots", content: "noindex" }];
export default function Confirmation() {
  const { locale, order } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const { clear } = useCart(); useEffect(() => { if (order) clear(); }, [clear, order]);
  return <div className="empty-state"><span style={{ display: "inline-grid", placeItems: "center", width: "5rem", height: "5rem", borderRadius: "50%", background: "var(--yellow)" }}><Check aria-hidden="true" /></span><p className="eyebrow" style={{ marginTop: "2rem" }}>{english ? "Payment received" : "Paiement reçu"}</p><h1>{english ? "Thank you." : "Merci."}</h1><p className="lede">{english ? "Your order has been recorded. A confirmation and invoice will arrive by email." : "Votre commande est enregistrée. Une confirmation et votre facture vont vous parvenir par e-mail."}</p>{order ? <p>{english ? "Order" : "Commande"} <strong>{order}</strong></p> : null}<Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Back to shop" : "Retour à la boutique"}</Link></div>;
}
