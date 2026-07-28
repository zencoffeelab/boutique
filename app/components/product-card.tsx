import { ArrowUpRight, ChevronDown, ShoppingBag } from "lucide-react";
import { useId, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { ProfessionalQuoteAdd } from "~/components/professional-quote/professional-quote-add";
import { ProductThumbnailLabel } from "~/components/product-thumbnail-label";
import { buildProductCartLine } from "~/domain/cart";
import type { Audience, Locale, Product } from "~/domain/types";
import { formatMoney } from "~/domain/money";
import { dictionary } from "~/lib/i18n";

function ProductCardQuickAdd({ product, locale, audience }: { product: Product; locale: Locale; audience: Audience }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const purchasableVariants = product.variants.filter((variant) => {
    const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active);
    return offer ? variant.stockOnHand - variant.stockReserved >= offer.minimumQuantity : false;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const { addItem, hydrated, openDrawer } = useCart();
  const add = (variant: Product["variants"][number]) => {
    const offer = variant.offers.find((candidate) => candidate.audience === audience && candidate.active);
    if (!offer) return;
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
        return <button ref={index === 0 ? firstOptionRef : undefined} type="button" role="menuitem" onClick={() => add(variant)} key={variant.id}>
          <span>{variant.label}</span><strong>{formatMoney(offer.price.amount, locale)}</strong>
        </button>;
      })}
    </div> : null}
  </div>;
}

export function ProductCard({ product, locale, audience, quickAdd = false, quoteAdd = false }: { product: Product; locale: Locale; audience?: Audience; quickAdd?: boolean; quoteAdd?: boolean }) {
  const titleId = useId();
  const translation = product.translations[locale];
  const resolvedAudience = audience ?? product.variants.flatMap((variant) => variant.offers)[0]?.audience ?? "retail";
  const baseHref = locale === "fr-FR" ? `/boutique/${product.slug}` : `/en/shop/${product.slug}`;
  const href = resolvedAudience === "professional" ? `${baseHref}?audience=professional` : baseHref;
  const prices = product.variants.flatMap((variant) => variant.offers.filter((offer) => offer.audience === resolvedAudience && offer.active).map((offer) => offer.price.amount));
  const fromPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const composedThumbnail = Boolean(product.thumbnailLabelUrl);
  return (
    <article className="product-card">
      <div
        className={`product-card__image${composedThumbnail ? " product-card__image--composed" : ""}`}
        style={composedThumbnail ? { "--product-thumbnail-color": product.thumbnailBackgroundColor } as CSSProperties : undefined}
      >
        {composedThumbnail ? <>
          <img
            className="product-card__pack"
            src="/media/product-cards/zen-coffee-bag-neutral.png"
            alt={product.media[0]?.alt[locale] ?? translation.name}
            width={900}
            height={900}
            loading="lazy"
          />
          <ProductThumbnailLabel
            className="product-card__label"
            src={product.thumbnailLabelUrl!}
            alt=""
            loading="lazy"
          />
        </> : <img
          className="product-card__original-image"
          src={product.media[0]?.url}
          alt={product.media[0]?.alt[locale] ?? translation.name}
          width={640}
          height={640}
          loading="lazy"
        />}
        {product.status === "archived" ? <p className="product-card__archive-label">{locale === "fr-FR" ? "Archivé" : "Archived"}</p> : null}
      </div>
      <div className="product-card__body">
        <div><p className="eyebrow">{translation.region}</p><h3 id={titleId}>{translation.name}</h3></div>
        {quoteAdd || product.status === "archived" ? null : <p>{dictionary[locale].from} {formatMoney(fromPrice, locale)}</p>}
      </div>
      <ul className="taste-list" aria-label={dictionary[locale].tasting}>
        {translation.tastingNotes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      {quickAdd ? <div className="product-card__actions">
        <ProductCardQuickAdd product={product} locale={locale} audience={resolvedAudience} />
        <Link className="button button--ghost product-card__more-link" to={href}>
          {locale === "fr-FR" ? "Voir plus" : "View more"}<ArrowUpRight aria-hidden="true" />
        </Link>
      </div> : null}
      {quoteAdd ? <ProfessionalQuoteAdd product={product} locale={locale} /> : null}
      <Link to={href} className="product-card__link" aria-labelledby={titleId} />
    </article>
  );
}
