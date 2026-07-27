import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { ProfessionalQuoteAdd } from "~/components/professional-quote/professional-quote-add";
import { buildProductCartLine } from "~/domain/cart";
import type { Audience, Locale, Product } from "~/domain/types";
import { formatMoney } from "~/domain/money";
import { dictionary } from "~/lib/i18n";

function ProductCardQuickAdd({ product, locale, audience }: { product: Product; locale: Locale; audience: Audience }) {
  const purchasableVariants = product.variants.filter((variant) => {
    const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active);
    return offer ? variant.stockOnHand - variant.stockReserved >= offer.minimumQuantity : false;
  });
  const [variantId, setVariantId] = useState(purchasableVariants[0]?.id ?? "");
  const { addItem, hydrated, openDrawer } = useCart();
  const selectedVariant = purchasableVariants.find((variant) => variant.id === variantId);
  const selectedOffer = selectedVariant?.offers.find((offer) => offer.audience === audience && offer.active);
  const add = () => {
    if (!selectedVariant || !selectedOffer) return;
    addItem(buildProductCartLine({ product, variant: selectedVariant, offer: selectedOffer, audience, quantity: selectedOffer.minimumQuantity }));
    openDrawer();
  };
  return <div className="product-card__quick-add">
    <label><span>{dictionary[locale].weight}</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)} disabled={purchasableVariants.length === 0}>
      {purchasableVariants.map((variant) => {
        const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active)!;
        return <option value={variant.id} key={variant.id}>{variant.label} — {formatMoney(offer.price.amount, locale)}</option>;
      })}
    </select></label>
    <button className="button button--dark" type="button" onClick={add} disabled={!hydrated || !selectedVariant || !selectedOffer}><ShoppingBag aria-hidden="true" />{purchasableVariants.length === 0 ? dictionary[locale].soldOut : dictionary[locale].addToCart}</button>
  </div>;
}

export function ProductCard({ product, locale, audience, quickAdd = false, quoteAdd = false }: { product: Product; locale: Locale; audience?: Audience; quickAdd?: boolean; quoteAdd?: boolean }) {
  const translation = product.translations[locale];
  const resolvedAudience = audience ?? product.variants.flatMap((variant) => variant.offers)[0]?.audience ?? "retail";
  const baseHref = locale === "fr-FR" ? `/boutique/${product.slug}` : `/en/shop/${product.slug}`;
  const href = resolvedAudience === "professional" ? `${baseHref}?audience=professional` : baseHref;
  const prices = product.variants.flatMap((variant) => variant.offers.filter((offer) => offer.audience === resolvedAudience && offer.active).map((offer) => offer.price.amount));
  const fromPrice = prices.length > 0 ? Math.min(...prices) : 0;
  return (
    <article className="product-card">
      <Link to={href} className="product-card__image" aria-label={translation.name}>
        <img src={product.media[0]?.url} alt={product.media[0]?.alt[locale] ?? translation.name} width={640} height={640} loading="lazy" />
        <span>{dictionary[locale].discover}<ArrowUpRight aria-hidden="true" /></span>
      </Link>
      <div className="product-card__body">
        <div><p className="eyebrow">{translation.region}</p><h3><Link to={href}>{translation.name}</Link></h3></div>
        <p>{dictionary[locale].from} {formatMoney(fromPrice, locale)}</p>
      </div>
      <ul className="taste-list" aria-label={dictionary[locale].tasting}>
        {translation.tastingNotes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      {quickAdd ? <ProductCardQuickAdd product={product} locale={locale} audience={resolvedAudience} /> : null}
      {quoteAdd ? <ProfessionalQuoteAdd product={product} locale={locale} /> : null}
    </article>
  );
}
