import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { getLocale } from "~/lib/i18n";
import { useCart } from "~/components/cart/cart-provider";
import { isTemporaryOrderNumber, resolveCheckoutOrderNumber } from "~/services/checkout.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const legacyOrder = url.searchParams.get("order");
  const fallbackOrder = legacyOrder && !isTemporaryOrderNumber(legacyOrder) ? legacyOrder : null;
  const order = sessionId ? (await resolveCheckoutOrderNumber(sessionId)) ?? fallbackOrder : fallbackOrder;
  return { locale: getLocale(request), order, paymentConfirmed: Boolean(sessionId || order), orderNumberPending: Boolean(sessionId && !order) };
}
export const meta: MetaFunction = () => [{ title: "Commande confirmée | Zen Coffee Lab" }, { name: "robots", content: "noindex" }];
export default function Confirmation() {
  const { locale, order, paymentConfirmed, orderNumberPending } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const { clear } = useCart(); useEffect(() => { if (paymentConfirmed) clear(); }, [clear, paymentConfirmed]);
  const revalidator = useRevalidator(); const attempts = useRef(0);
  useEffect(() => {
    if (!orderNumberPending || attempts.current >= 10 || revalidator.state !== "idle") return;
    const timeout = window.setTimeout(() => { attempts.current += 1; revalidator.revalidate(); }, 1_500);
    return () => window.clearTimeout(timeout);
  }, [orderNumberPending, revalidator]);
  return <div className="empty-state order-confirmation"><span style={{ display: "inline-grid", placeItems: "center", width: "5rem", height: "5rem", borderRadius: "50%", background: "var(--yellow)" }}><Check aria-hidden="true" /></span><p className="eyebrow" style={{ marginTop: "2rem" }}>{english ? "Payment received" : "Paiement reçu"}</p><h1>{english ? "Thank you." : "Merci."}</h1><div className="order-confirmation__details"><p className="lede">{english ? "Your order has been recorded. A confirmation and invoice will arrive by email." : "Votre commande est enregistrée. Une confirmation et votre facture vont vous parvenir par e-mail."}</p>{order ? <p>{english ? "Order" : "Commande"} <strong>{order}</strong></p> : orderNumberPending ? <p>{english ? "Your final order number is being assigned." : "Votre numéro de commande définitif est en cours d’attribution."}</p> : null}<Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Back to shop" : "Retour à la boutique"}</Link></div></div>;
}
