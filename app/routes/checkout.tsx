import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { formatMoney } from "~/domain/money";
import type { ShippingRate } from "~/domain/types";
import { getAudience } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request); const audience = await getAudience(request);
  return { locale, audience, products: await getProducts({ status: "published", audience }) };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Checkout | Zen Coffee Lab" : "Commande | Zen Coffee Lab", data?.locale === "en-GB" ? "Secure checkout and real-time shipping rates." : "Paiement sécurisé et tarifs de livraison en temps réel.", data?.locale === "en-GB" ? "/en/checkout" : "/commande");

type QuoteResponse = { ok: boolean; quoteId?: string; expiresAt?: string; rates?: ShippingRate[]; subtotalCents?: number; message?: string };
type CheckoutResponse = { ok: boolean; checkoutUrl?: string; confirmationUrl?: string; message?: string };

function getAddress(form: HTMLFormElement) {
  const data = new FormData(form);
  return { firstName: String(data.get("firstName") ?? ""), lastName: String(data.get("lastName") ?? ""), company: String(data.get("company") ?? ""), email: String(data.get("email") ?? ""), phone: String(data.get("phone") ?? ""), line1: String(data.get("line1") ?? ""), line2: String(data.get("line2") ?? ""), postalCode: String(data.get("postalCode") ?? ""), city: String(data.get("city") ?? ""), countryCode: String(data.get("countryCode") ?? "FR") };
}

export default function Checkout() {
  const { locale, audience, products } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const { lines, hydrated } = useCart(); const formRef = useRef<HTMLFormElement>(null);
  const [cartId, setCartId] = useState(""); const [quote, setQuote] = useState<QuoteResponse | null>(null); const [selectedRate, setSelectedRate] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { const key = "zcl:cart-id:v1"; let id = window.localStorage.getItem(key); if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(key, id); } setCartId(id); }, []);
  const validLines = useMemo(() => lines.filter((line) => line.audience === audience), [audience, lines]);
  const resolved = useMemo(() => validLines.map((line) => { const product = products.find((item) => item.id === line.productId); const variant = product?.variants.find((item) => item.id === line.variantId); const offer = variant?.offers.find((item) => item.audience === line.audience); return product && variant && offer ? { line, product, variant, offer } : null; }).filter((line): line is NonNullable<typeof line> => Boolean(line)), [products, validLines]);
  const subtotal = resolved.reduce((sum, item) => sum + item.offer.price.amount * item.line.quantity, 0);
  const requestQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setQuote(null);
    try { const response = await fetch("/api/shipping/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId, locale, lines: validLines, address: getAddress(event.currentTarget) }) }); const data = await response.json() as QuoteResponse; if (!response.ok || !data.ok) throw new Error(data.message || (english ? "Unable to retrieve shipping rates." : "Impossible de récupérer les tarifs de livraison.")); setQuote(data); setSelectedRate(data.rates?.[0]?.id ?? ""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const pay = async () => {
    if (!formRef.current || !selectedRate) return; setBusy(true); setError("");
    try { const response = await fetch("/api/checkout/payment-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId, locale, lines: validLines, address: getAddress(formRef.current), shippingRateId: selectedRate, acceptTerms: true }) }); const data = await response.json() as CheckoutResponse; if (!response.ok || !data.ok) throw new Error(data.message || "Checkout unavailable"); const target = data.checkoutUrl ?? data.confirmationUrl; if (!target) throw new Error("Checkout response is incomplete."); window.location.assign(target); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  };
  if (!hydrated) return <div className="empty-state"><p>{english ? "Loading…" : "Chargement…"}</p></div>;
  if (!resolved.length) return <div className="empty-state"><h1>{english ? "Your cart is empty" : "Votre panier est vide"}</h1><Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Back to shop" : "Retour à la boutique"}</Link></div>;
  return <><header className="page-hero"><p className="eyebrow">{english ? "Secure checkout" : "Commande sécurisée"}</p><h1>{english ? "Delivery & payment" : "Livraison & paiement"}</h1></header><div className="checkout-layout"><form ref={formRef} onSubmit={requestQuote}>
    <section className="checkout-section"><h2>1. {english ? "Contact" : "Coordonnées"}</h2><div className="form-grid"><div className="field"><label htmlFor="firstName">{english ? "First name" : "Prénom"}</label><input id="firstName" name="firstName" required autoComplete="given-name" /></div><div className="field"><label htmlFor="lastName">{english ? "Last name" : "Nom"}</label><input id="lastName" name="lastName" required autoComplete="family-name" /></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div><div className="field"><label htmlFor="phone">{english ? "Phone" : "Téléphone"}</label><input id="phone" name="phone" type="tel" required autoComplete="tel" /></div></div></section>
    <section className="checkout-section"><h2>2. {english ? "Shipping address" : "Adresse de livraison"}</h2><div className="form-grid"><div className="field field--wide"><label htmlFor="company">{english ? "Company (optional)" : "Société (facultatif)"}</label><input id="company" name="company" autoComplete="organization" /></div><div className="field field--wide"><label htmlFor="line1">{english ? "Address" : "Adresse"}</label><input id="line1" name="line1" required autoComplete="address-line1" /></div><div className="field field--wide"><label htmlFor="line2">{english ? "Address line 2" : "Complément"}</label><input id="line2" name="line2" autoComplete="address-line2" /></div><div className="field"><label htmlFor="postalCode">{english ? "Postcode" : "Code postal"}</label><input id="postalCode" name="postalCode" required autoComplete="postal-code" /></div><div className="field"><label htmlFor="city">{english ? "City" : "Ville"}</label><input id="city" name="city" required autoComplete="address-level2" /></div><div className="field"><label htmlFor="countryCode">{english ? "Country" : "Pays"}</label><select id="countryCode" name="countryCode" defaultValue="FR"><option value="FR">France</option><option value="BE">Belgique</option><option value="DE">Deutschland</option><option value="ES">España</option><option value="IT">Italia</option><option value="LU">Luxembourg</option><option value="NL">Nederland</option><option value="PT">Portugal</option><option value="GB">United Kingdom</option></select></div></div></section>
    <button className="button button--dark" type="submit" disabled={busy || !cartId}>{busy ? (english ? "Calculating…" : "Calcul…") : (english ? "Calculate shipping" : "Calculer la livraison")}</button>
    {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
    {quote?.rates?.length ? <section className="checkout-section" style={{ marginTop: "2rem" }}><h2>3. {english ? "Delivery service" : "Mode de livraison"}</h2><div className="rate-list">{quote.rates.map((rate) => <label className="rate-option" key={rate.id}><input type="radio" name="shippingRate" checked={selectedRate === rate.id} onChange={() => setSelectedRate(rate.id)} /><span><strong>{rate.carrier} · {rate.service}</strong><br /><small>{rate.estimatedDays ? `${rate.estimatedDays} ${english ? "business days" : "jours ouvrés"}` : ""}</small></span><strong>{formatMoney(rate.amountCents, locale)}</strong></label>)}</div></section> : null}
  </form><aside className="summary-card"><h2>{english ? "Your order" : "Votre commande"}</h2>{resolved.map(({ line, product, variant, offer }) => <div className="summary-row" key={variant.id}><span>{line.quantity} × {product.translations[locale].name} · {variant.label}</span><strong>{formatMoney(line.quantity * offer.price.amount, locale)}</strong></div>)}<div className="summary-row"><span>{english ? "Subtotal" : "Sous-total"}</span><strong>{formatMoney(subtotal, locale)}</strong></div><div className="summary-row"><span>{english ? "Shipping" : "Livraison"}</span><strong>{selectedRate ? formatMoney(quote?.rates?.find((rate) => rate.id === selectedRate)?.amountCents ?? 0, locale) : "—"}</strong></div><div className="summary-row summary-total"><span>Total</span><strong>{formatMoney(subtotal + (quote?.rates?.find((rate) => rate.id === selectedRate)?.amountCents ?? 0), locale)}</strong></div><p><small>{english ? "By paying, you accept the terms and acknowledge that UK duties remain payable by the recipient." : "En payant, vous acceptez les CGV. Les éventuels droits au Royaume-Uni restent à la charge du destinataire."}</small></p><button className="button button--dark" type="button" onClick={pay} disabled={!selectedRate || busy}>{english ? "Pay securely" : "Payer en toute sécurité"}</button></aside></div></>;
}
