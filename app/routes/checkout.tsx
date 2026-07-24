import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { formatMoney } from "~/domain/money";
import { shippingRateLabel } from "~/domain/shipping-rate-label";
import { EU_SHIPPING_COUNTRY_CODES, NON_EU_SHIPPING_COUNTRY_CODES, shippingCountryLabel } from "~/domain/shipping-countries";
import { supportsPickupDelivery } from "~/domain/shipping-zones";
import type { PickupPoint, ShippingRate } from "~/domain/types";
import { getAudience } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";
import { pickupPointsConfigured } from "~/services/pickup-points.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request); const audience = await getAudience(request);
  return { locale, audience, pickupConfigured: pickupPointsConfigured(), products: await getProducts({ status: "published", audience }) };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(
  data?.locale === "en-GB" ? "Checkout | Zen Coffee Lab" : "Commande | Zen Coffee Lab",
  data?.locale === "en-GB" ? "Secure checkout and real-time shipping rates." : "Paiement sécurisé et tarifs de livraison en temps réel.",
  data?.locale === "en-GB" ? "/en/checkout" : "/commande",
);

type QuoteResponse = { ok: boolean; quoteId?: string; expiresAt?: string; rates?: ShippingRate[]; subtotalCents?: number; message?: string };
type CheckoutResponse = { ok: boolean; checkoutUrl?: string; confirmationUrl?: string; message?: string };
type PickupResponse = { ok: boolean; points?: PickupPoint[]; message?: string };

function getAddress(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    firstName: String(data.get("firstName") ?? ""), lastName: String(data.get("lastName") ?? ""), company: String(data.get("company") ?? ""),
    email: String(data.get("email") ?? ""), phone: String(data.get("phone") ?? ""), line1: String(data.get("line1") ?? ""),
    line2: String(data.get("line2") ?? ""), postalCode: String(data.get("postalCode") ?? ""), city: String(data.get("city") ?? ""),
    countryCode: String(data.get("countryCode") ?? "FR"),
  };
}

function pickupAddress(point: PickupPoint) {
  return [point.address1, point.address2, point.address3].filter(Boolean).join(", ");
}

function pickupCarrierLabel(code: string) {
  if (code === "mondial_relay") return "Mondial Relay";
  if (code === "colissimo") return "Colissimo";
  return code.replaceAll("_", " ");
}

export default function Checkout() {
  const { locale, audience, pickupConfigured, products } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const { lines, hydrated } = useCart(); const formRef = useRef<HTMLFormElement>(null);
  const [cartId, setCartId] = useState(""); const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [selectedRate, setSelectedRate] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [countryCode, setCountryCode] = useState("FR"); const [deliveryMethod, setDeliveryMethod] = useState<"home" | "pickup">("home");
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]); const [selectedPickupPointId, setSelectedPickupPointId] = useState("");
  const [pickupBusy, setPickupBusy] = useState(false); const [pickupError, setPickupError] = useState("");
  const pickupAvailable = pickupConfigured && supportsPickupDelivery(countryCode);

  useEffect(() => {
    const key = "zcl:cart-id:v1"; let id = window.localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(key, id); }
    setCartId(id);
  }, []);

  const validLines = useMemo(() => lines.filter((line) => line.audience === audience), [audience, lines]);
  const resolved = useMemo(() => validLines.map((line) => {
    const product = products.find((item) => item.id === line.productId); const variant = product?.variants.find((item) => item.id === line.variantId);
    const offer = variant?.offers.find((item) => item.audience === line.audience);
    return product && variant && offer ? { line, product, variant, offer } : null;
  }).filter((line): line is NonNullable<typeof line> => Boolean(line)), [products, validLines]);
  const hasUnavailableItems = resolved.length !== validLines.length || resolved.some(({ line, variant, offer }) => {
    const availableStock = variant.stockOnHand - variant.stockReserved;
    return line.quantity > availableStock || line.quantity < offer.minimumQuantity;
  });
  const subtotal = resolved.reduce((sum, item) => sum + item.offer.price.amount * item.line.quantity, 0);
  const estimatedShippingWeight = Math.min(30_000, resolved.reduce((sum, item) => sum + item.variant.weightGrams * item.line.quantity, 0) + 500);

  const invalidateQuote = () => { setQuote(null); setSelectedRate(""); };
  const resetPickup = () => { setPickupPoints([]); setSelectedPickupPointId(""); setPickupError(""); };

  const searchForPickupPoints = async () => {
    const form = formRef.current; if (!form || !form.reportValidity()) return;
    const address = getAddress(form);
    if (!supportsPickupDelivery(address.countryCode)) return;
    setPickupBusy(true); setPickupError(""); setPickupPoints([]); setSelectedPickupPointId(""); invalidateQuote();
    try {
      const response = await fetch("/api/shipping/pickup-points", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, address: { line1: address.line1, line2: address.line2, postalCode: address.postalCode, city: address.city, countryCode: address.countryCode }, weightGrams: estimatedShippingWeight }),
      });
      const data = await response.json() as PickupResponse;
      if (!response.ok || !data.ok) throw new Error(data.message || (english ? "Pickup-point search is unavailable." : "La recherche de points relais est indisponible."));
      setPickupPoints(data.points ?? []);
      if (!data.points?.length) setPickupError(english ? "No pickup point was found near this address." : "Aucun point relais n’a été trouvé près de cette adresse.");
    } catch (cause) { setPickupError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPickupBusy(false); }
  };

  const requestQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasUnavailableItems) {
      setError(english ? "The stock for an item in your cart has changed. Return to your cart to update it." : "Le stock d’un produit de votre panier a changé. Retournez au panier pour le mettre à jour."); return;
    }
    if (deliveryMethod === "pickup" && !selectedPickupPointId) {
      setError(english ? "Select a pickup point before calculating shipping." : "Sélectionnez un point relais avant de calculer la livraison."); return;
    }
    setBusy(true); setError(""); setQuote(null);
    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ cartId, locale, lines: validLines, address: getAddress(event.currentTarget), pickupPointId: deliveryMethod === "pickup" ? selectedPickupPointId : undefined }),
      });
      const data = await response.json() as QuoteResponse;
      if (!response.ok || !data.ok) throw new Error(data.message || (english ? "Unable to retrieve shipping rates." : "Impossible de récupérer les tarifs de livraison."));
      setQuote(data); setSelectedRate(data.rates?.[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    if (!formRef.current || !selectedRate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/checkout/payment-intent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ cartId, locale, lines: validLines, address: getAddress(formRef.current), pickupPointId: deliveryMethod === "pickup" ? selectedPickupPointId : undefined, shippingRateId: selectedRate, acceptTerms: true }),
      });
      const data = await response.json() as CheckoutResponse;
      if (!response.ok || !data.ok) throw new Error(data.message || "Checkout unavailable");
      const target = data.checkoutUrl ?? data.confirmationUrl; if (!target) throw new Error("Checkout response is incomplete.");
      window.location.assign(target);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  };

  if (!hydrated) return <div className="empty-state"><p>{english ? "Loading…" : "Chargement…"}</p></div>;
  if (!resolved.length) return <div className="empty-state"><h1>{validLines.length ? (english ? "An item in your cart is no longer available" : "Un article de votre panier n’est plus disponible") : (english ? "Your cart is empty" : "Votre panier est vide")}</h1><Link className="button button--dark" to={validLines.length ? (english ? "/en/cart" : "/panier") : (english ? "/en/shop" : "/boutique")}>{validLines.length ? (english ? "Update cart" : "Mettre à jour le panier") : (english ? "Back to shop" : "Retour à la boutique")}</Link></div>;

  return <>
    <header className="page-hero"><p className="eyebrow">{english ? "Secure checkout" : "Commande sécurisée"}</p><h1>{english ? "Delivery & payment" : "Livraison & paiement"}</h1></header>
    <div className="checkout-layout">
      <form ref={formRef} onSubmit={requestQuote}>
        <section className="checkout-section" onChange={invalidateQuote}>
          <h2>1. {english ? "Contact" : "Coordonnées"}</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="firstName">{english ? "First name" : "Prénom"}</label><input id="firstName" name="firstName" required autoComplete="given-name" /></div>
            <div className="field"><label htmlFor="lastName">{english ? "Last name" : "Nom"}</label><input id="lastName" name="lastName" required autoComplete="family-name" /></div>
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <div className="field"><label htmlFor="phone">{english ? "Phone" : "Téléphone"}</label><input id="phone" name="phone" type="tel" required autoComplete="tel" /></div>
          </div>
        </section>
        <section className="checkout-section" onChange={invalidateQuote}>
          <h2>2. {english ? "Shipping address" : "Adresse de livraison"}</h2>
          <div className="form-grid">
            <div className="field field--wide"><label htmlFor="company">{english ? "Company (optional)" : "Société (facultatif)"}</label><input id="company" name="company" autoComplete="organization" /></div>
            <div className="field field--wide"><label htmlFor="line1">{english ? "Address" : "Adresse"}</label><input id="line1" name="line1" required autoComplete="address-line1" /></div>
            <div className="field field--wide"><label htmlFor="line2">{english ? "Address line 2" : "Complément"}</label><input id="line2" name="line2" autoComplete="address-line2" /></div>
            <div className="field"><label htmlFor="postalCode">{english ? "Postcode" : "Code postal"}</label><input id="postalCode" name="postalCode" required autoComplete="postal-code" /></div>
            <div className="field"><label htmlFor="city">{english ? "City" : "Ville"}</label><input id="city" name="city" required autoComplete="address-level2" /></div>
            <div className="field"><label htmlFor="countryCode">{english ? "Country" : "Pays"}</label><select id="countryCode" name="countryCode" value={countryCode} onChange={(event) => { setCountryCode(event.currentTarget.value); setDeliveryMethod("home"); resetPickup(); }}><optgroup label={english ? "European Union" : "Union européenne"}>{EU_SHIPPING_COUNTRY_CODES.map((code) => <option key={code} value={code}>{shippingCountryLabel(code, locale)}</option>)}</optgroup><optgroup label={english ? "Outside the EU" : "Hors Union européenne"}>{NON_EU_SHIPPING_COUNTRY_CODES.map((code) => <option key={code} value={code}>{shippingCountryLabel(code, locale)}</option>)}</optgroup></select></div>
          </div>
        </section>

        {pickupAvailable ? <section className="checkout-section pickup-section">
          <h2>3. {english ? "Delivery preference" : "Préférence de livraison"}</h2>
          <div className="delivery-methods" role="radiogroup" aria-label={english ? "Delivery preference" : "Préférence de livraison"}>
            <label className={deliveryMethod === "home" ? "delivery-method is-selected" : "delivery-method"}><input type="radio" name="deliveryMethod" value="home" checked={deliveryMethod === "home"} onChange={() => { setDeliveryMethod("home"); invalidateQuote(); }} /><span><strong>{english ? "Home delivery" : "Livraison à domicile"}</strong><small>{english ? "Delivered to the address above" : "Livraison à l’adresse indiquée"}</small></span></label>
            <label className={deliveryMethod === "pickup" ? "delivery-method is-selected" : "delivery-method"}><input type="radio" name="deliveryMethod" value="pickup" checked={deliveryMethod === "pickup"} onChange={() => { setDeliveryMethod("pickup"); invalidateQuote(); }} /><span><strong>{english ? "Pickup point" : "Point relais"}</strong><small>{english ? "Choose a nearby Mondial Relay location" : "Choisissez un relais Mondial Relay"}</small></span></label>
          </div>
          {deliveryMethod === "pickup" ? <div className="pickup-search">
            <button className="button button--light" type="button" onClick={searchForPickupPoints} disabled={pickupBusy}>{pickupBusy ? (english ? "Searching…" : "Recherche…") : (english ? "Find pickup points" : "Rechercher les points relais")}</button>
            {pickupError ? <p className="form-message form-error" role="alert">{pickupError}</p> : null}
            <p className="sr-only" aria-live="polite">{pickupPoints.length ? (english ? `${pickupPoints.length} pickup points found.` : `${pickupPoints.length} points relais trouvés.`) : ""}</p>
            {pickupPoints.length ? <fieldset className="pickup-list"><legend>{english ? "Choose your pickup point" : "Choisissez votre point relais"}</legend>{pickupPoints.map((point) => <label className={selectedPickupPointId === point.id ? "pickup-option is-selected" : "pickup-option"} key={point.id}><input type="radio" name="pickupPoint" value={point.id} checked={selectedPickupPointId === point.id} onChange={() => { setSelectedPickupPointId(point.id); invalidateQuote(); }} /><span><strong>{point.name}</strong><small>{pickupCarrierLabel(point.network)} · {point.locationHint}<br />{pickupAddress(point)}<br />{point.postalCode} {point.city}</small></span>{point.distanceMeters !== null && point.distanceMeters >= 0 ? <span className="pickup-distance">{point.distanceMeters < 1_000 ? `${Math.round(point.distanceMeters)} m` : `${(point.distanceMeters / 1_000).toFixed(1)} km`}</span> : null}</label>)}</fieldset> : null}
          </div> : null}
        </section> : null}

        {hasUnavailableItems ? <p className="form-message form-error" role="alert">{english ? "The stock for an item has changed." : "Le stock d’un produit a changé."} <Link to={english ? "/en/cart" : "/panier"}>{english ? "Update cart" : "Mettre à jour le panier"}</Link></p> : null}
        <button className="button button--dark" type="submit" disabled={busy || !cartId || hasUnavailableItems}>{busy ? (english ? "Calculating…" : "Calcul…") : (english ? "Calculate shipping" : "Calculer la livraison")}</button>
        {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
        {quote?.rates?.length ? <section className="checkout-section shipping-rates"><h2>{pickupAvailable ? "4" : "3"}. {english ? "Delivery service" : "Mode de livraison"}</h2><div className="rate-list">{quote.rates.map((rate) => <label className="rate-option" key={rate.id}><input type="radio" name="shippingRate" checked={selectedRate === rate.id} onChange={() => setSelectedRate(rate.id)} /><span><strong>{shippingRateLabel(rate)}</strong><br /><small>{rate.estimatedDays ? `${rate.estimatedDays} ${english ? "business days" : "jours ouvrés"}` : ""}{rate.pickupPoint ? `${rate.estimatedDays ? " · " : ""}${rate.pickupPoint.name}` : ""}</small></span><strong>{formatMoney(rate.amountCents, locale)}</strong></label>)}</div></section> : null}
      </form>

      <aside className="summary-card"><h2>{english ? "Your order" : "Votre commande"}</h2>{resolved.map(({ line, product, variant, offer }) => <div className="summary-row" key={variant.id}><span>{line.quantity} × {product.translations[locale].name} · {variant.label}</span><strong>{formatMoney(line.quantity * offer.price.amount, locale)}</strong></div>)}<div className="summary-row"><span>{english ? "Subtotal" : "Sous-total"}</span><strong>{formatMoney(subtotal, locale)}</strong></div><div className="summary-row"><span>{english ? "Shipping" : "Livraison"}</span><strong>{selectedRate ? formatMoney(quote?.rates?.find((rate) => rate.id === selectedRate)?.amountCents ?? 0, locale) : "—"}</strong></div><div className="summary-row summary-total"><span>Total</span><strong>{formatMoney(subtotal + (quote?.rates?.find((rate) => rate.id === selectedRate)?.amountCents ?? 0), locale)}</strong></div><p><small>{english ? "By paying, you accept the terms and acknowledge that UK duties remain payable by the recipient." : "En payant, vous acceptez les CGV. Les éventuels droits au Royaume-Uni restent à la charge du destinataire."}</small></p><button className="button button--dark" type="button" onClick={pay} disabled={!selectedRate || busy}>{english ? "Pay securely" : "Payer en toute sécurité"}</button></aside>
    </div>
  </>;
}
