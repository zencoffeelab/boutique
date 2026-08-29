import { ChevronDown, ShoppingBag } from "lucide-react";
import { useId, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { ProfessionalQuoteAdd } from "~/components/professional-quote/professional-quote-add";
import { ProductPackArtwork } from "~/components/product-thumbnail-label";
import { ProductRibbons } from "~/components/product-ribbons";
import { buildProductCartLine } from "~/domain/cart";
import type { Audience, Locale, Product } from "~/domain/types";
import { formatMoney } from "~/domain/money";
import { dictionary } from "~/lib/i18n";
import { isProductSoldOut } from "~/lib/product-ribbons";
import { displayTastingNote } from "~/lib/product-text";

function ProductCardQuickAdd({ product, locale, audience }: { product: Product; locale: Locale; audience: Audience }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const purchasableVariants = product.variants
    .filter((variant) => variant.offers.some((candidate) => candidate.audience === audience && candidate.active))
    .toSorted((left, right) => left.weightGrams - right.weightGrams);
  const firstAvailableIndex = purchasableVariants.findIndex((variant) => {
    const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active);
    return Boolean(offer) && variant.stockOnHand - variant.stockReserved >= offer!.minimumQuantity;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const { addItem, hydrated, openDrawer } = useCart();
  const add = (variant: Product["variants"][number]) => {
    const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active);
    if (!offer || variant.stockOnHand - variant.stockReserved < offer.minimumQuantity) return;
    addItem(buildProductCartLine({ product, variant, offer, audience, quantity: offer.minimumQuantity }));
    setMenuOpen(false);
    openDrawer();
  };
  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setMenuOpen(true);
    window.requestAnimationFrame(() => firstOptionRef.current?.focus());
  };
  return <div
    className="product-card__quick-add"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
    }}
  >
    <button
      ref={triggerRef}
      className="button button--ghost product-card__quick-add-trigger"
      type="button"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-controls={menuId}
      onClick={toggleMenu}
      disabled={!hydrated || purchasableVariants.length === 0}
    >
      <ShoppingBag aria-hidden="true" />
      {purchasableVariants.length === 0 ? dictionary[locale].soldOut : dictionary[locale].addToCart}
      {purchasableVariants.length > 0 ? <ChevronDown className={menuOpen ? "is-open" : ""} aria-hidden="true" /> : null}
    </button>
    {menuOpen ? <div id={menuId} className="product-card__variant-menu" role="menu" aria-label={dictionary[locale].weight}>
      {purchasableVariants.map((variant, index) => {
        const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active)!;
        const available = variant.stockOnHand - variant.stockReserved >= offer.minimumQuantity;
        return <button ref={index === (firstAvailableIndex >= 0 ? firstAvailableIndex : 0) ? firstOptionRef : undefined} type="button" role="menuitem" onClick={() => add(variant)} disabled={!available} aria-disabled={!available} key={variant.id}>
          <span>{variant.label}</span><strong>{formatMoney(offer.price.amount, locale)}</strong>
        </button>;
      })}
    </div> : null}
  </div>;
}

export function ProductCard({ product, locale, audience, quickAdd = false, quoteAdd = false }: { product: Product; locale: Locale; audience?: Audience; quickAdd?: boolean; quoteAdd?: boolean }) {
  const titleId = useId();
  const [hoverImageRequested, setHoverImageRequested] = useState(false);
  const translation = product.translations[locale];
  const resolvedAudience = audience ?? product.variants.flatMap((variant) => variant.offers)[0]?.audience ?? "retail";
  const baseHref = locale === "fr-FR" ? `/boutique/${product.slug}` : `/en/shop/${product.slug}`;
  const href = resolvedAudience === "professional" ? `${baseHref}?audience=professional` : baseHref;
  const smallestVariantOffer = [...product.variants]
    .sort((left, right) => left.weightGrams - right.weightGrams)
    .map((variant) => variant.offers.find((offer) => offer.audience === resolvedAudience && offer.active))
    .find((offer) => offer !== undefined);
  const composedThumbnail = Boolean(product.thumbnailLabelUrl);
  const soldOut = isProductSoldOut(product.stockOnHandGrams, product.status);
  return (
    <article className="product-card" onMouseEnter={() => setHoverImageRequested(true)} onFocus={() => setHoverImageRequested(true)}>
      <div className="product-card__media">
        <div
          className={`product-card__image${composedThumbnail ? " product-card__image--composed" : ""}${soldOut ? " product-card__image--sold-out" : ""}`}
          style={composedThumbnail ? { "--product-thumbnail-color": product.thumbnailBackgroundColor } as CSSProperties : undefined}
        >
          <ProductRibbons product={product} locale={locale} />
          {composedThumbnail ? <ProductPackArtwork
            packClassName="product-card__pack"
            labelClassName="product-card__label"
            labelUrl={product.thumbnailLabelUrl!}
            alt={product.media[0]?.alt[locale] ?? translation.name}
            loading="lazy"
          /> : <img
            className="product-card__original-image"
            src={product.media[0]?.url}
            alt={product.media[0]?.alt[locale] ?? translation.name}
            width={640}
            height={640}
            loading="lazy"
          />}
          {product.hoverImageUrl && hoverImageRequested ? <img
            className="product-card__hover-image"
            src={product.hoverImageUrl}
            alt=""
            width={900}
            height={900}
            loading="lazy"
            decoding="async"
          /> : null}
        </div>
        {quickAdd ? <div className="product-card__image-actions">
          <ProductCardQuickAdd product={product} locale={locale} audience={resolvedAudience} />
        </div> : null}
      </div>
      <div className="product-card__details">
        <div className="product-card__body">
          <h3 id={titleId}>{translation.name}</h3>
        </div>
        <ul className="taste-list" aria-label={locale === "fr-FR" ? "Variété et traitement" : "Variety and process"}>
          <li>{translation.variety}</li><li>{translation.process}</li>
        </ul>
        <p className="product-card__tasting-notes" aria-label={locale === "fr-FR" ? "Notes de dégustation" : "Tasting notes"}>{translation.tastingNotes.slice(0, 3).map((note) => displayTastingNote(note, locale)).join(" — ")}</p>
        {quoteAdd || product.status === "archived" || !smallestVariantOffer ? null : <p className="product-card__price">{formatMoney(smallestVariantOffer.price.amount, locale)}</p>}
        {quoteAdd ? <ProfessionalQuoteAdd product={product} locale={locale} /> : null}
      </div>
      <Link to={href} className="product-card__link" aria-labelledby={titleId} />
    </article>
  );
}
