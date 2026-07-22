import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { Audience, Locale, Product } from "~/domain/types";
import { formatMoney } from "~/domain/money";
import { dictionary } from "~/lib/i18n";

export function ProductCard({ product, locale, audience }: { product: Product; locale: Locale; audience?: Audience }) {
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
    </article>
  );
}
