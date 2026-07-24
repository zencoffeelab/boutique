import { Minus, Plus, Trash2 } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { formatMoney } from "~/domain/money";
import { getAudience } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) { const audience = await getAudience(request); return { locale: getLocale(request), products: await getProducts({ status: "published", audience }) }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Your cart | Zen Coffee Lab" : "Votre panier | Zen Coffee Lab", data?.locale === "en-GB" ? "Review your specialty coffee order." : "Vérifiez votre commande de cafés de spécialité.", data?.locale === "en-GB" ? "/en/cart" : "/panier");

export default function Cart() {
  const { locale, products } = useLoaderData<typeof loader>();
  const { lines, hydrated, updateQuantity, removeItem } = useCart();
  const english = locale === "en-GB";
  const resolved = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const variant = product?.variants.find((item) => item.id === line.variantId);
    const offer = variant?.offers.find((item) => item.audience === line.audience);
    if (!product || !variant || !offer) return null;
    const availableStock = variant.stockOnHand - variant.stockReserved;
    const stockIssue = line.quantity > availableStock || line.quantity < offer.minimumQuantity;
    return { line, product, variant, offer, availableStock, stockIssue };
  }).filter((line): line is NonNullable<typeof line> => Boolean(line));
  const resolvedKeys = new Set(resolved.map(({ line }) => `${line.variantId}:${line.audience}`));
  const missingLines = lines.filter((line) => !resolvedKeys.has(`${line.variantId}:${line.audience}`));
  const hasCartIssue = missingLines.length > 0 || resolved.some((item) => item.stockIssue);
  const subtotal = resolved.reduce((sum, item) => sum + item.offer.price.amount * item.line.quantity, 0);
  if (!hydrated) return <div className="empty-state"><p>{english ? "Loading cart…" : "Chargement du panier…"}</p></div>;
  if (!resolved.length) return <div className="empty-state"><p className="eyebrow">{english ? "Your cart" : "Votre panier"}</p><h1>{lines.length ? (english ? "This item is no longer available." : "Cet article n’est plus disponible.") : (english ? "It is waiting for a great coffee." : "Il attend un bon café.")}</h1>{lines.length ? <button className="button button--light" type="button" onClick={() => lines.forEach((line) => removeItem(line.variantId, line.audience))}>{english ? "Remove unavailable item" : "Retirer l’article indisponible"}</button> : null}<Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Browse coffees" : "Voir les cafés"}</Link></div>;
  return <>
    <header className="page-hero"><p className="eyebrow">{resolved.length} {english ? "lines" : "lignes"}</p><h1>{english ? "Your cart" : "Votre panier"}</h1></header>
    <div className="cart-layout">
      <section className="cart-lines" aria-label={english ? "Cart items" : "Articles du panier"}>
        {missingLines.length ? <div className="form-message form-error" role="alert"><p>{english ? "An item in this cart is no longer available." : "Un article de ce panier n’est plus disponible."}</p><button className="button button--light" type="button" onClick={() => missingLines.forEach((line) => removeItem(line.variantId, line.audience))}>{english ? "Remove it" : "Le retirer"}</button></div> : null}
        {resolved.map(({ line, product, variant, offer, availableStock, stockIssue }) => <article className="cart-line" key={`${line.variantId}:${line.audience}`}><img src={product.media[0]?.url} alt="" width="110" height="110" /><div><h2>{product.translations[locale].name}</h2><p>{variant.label} · {formatMoney(offer.price.amount, locale)}</p>{stockIssue ? <p className="form-message form-error" role="alert">{availableStock > 0 ? (english ? `Only ${availableStock} available.` : `Seulement ${availableStock} disponible${availableStock > 1 ? "s" : ""}.`) : (english ? "Out of stock. Remove this item." : "Produit épuisé. Retirez cet article.")}</p> : null}<div className="cart-line__actions"><div className="quantity-stepper"><button type="button" onClick={() => updateQuantity(line.variantId, line.audience, line.quantity - 1)} aria-label={english ? "Decrease" : "Diminuer"}><Minus aria-hidden="true" /></button><output>{line.quantity}</output><button type="button" onClick={() => updateQuantity(line.variantId, line.audience, line.quantity + 1)} aria-label={english ? "Increase" : "Augmenter"} disabled={line.quantity >= availableStock}><Plus aria-hidden="true" /></button></div><button type="button" onClick={() => removeItem(line.variantId, line.audience)}><Trash2 aria-hidden="true" /><span className="sr-only">{english ? "Remove" : "Supprimer"}</span></button></div></div><strong>{formatMoney(offer.price.amount * line.quantity, locale)}</strong></article>)}
      </section>
      <aside className="summary-card"><h2>{english ? "Summary" : "Récapitulatif"}</h2><div className="summary-row"><span>{english ? "Subtotal" : "Sous-total"}</span><strong>{formatMoney(subtotal, locale)}</strong></div><p>{english ? "Shipping is calculated from the exact parcel weight at checkout." : "La livraison est calculée selon le poids exact du colis à l’étape suivante."}</p><div className="summary-row summary-total"><span>Total</span><strong>{formatMoney(subtotal, locale)}</strong></div>{hasCartIssue ? <p className="form-message form-error" role="alert">{english ? "Update the cart before continuing." : "Mettez le panier à jour avant de continuer."}</p> : <Link className="button button--dark" to={english ? "/en/checkout" : "/commande"}>{english ? "Continue to checkout" : "Passer la commande"}</Link>}</aside>
    </div>
  </>;
}
