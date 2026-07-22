import type { Locale, Product } from "~/domain/types";
import { alternatePath } from "~/lib/i18n";

const origin = "https://www.zencoffeelab.com";

export function pageMeta(title: string, description: string, pathname: string, image?: string) {
  const canonical = `${origin}${pathname}`;
  const alternate = alternatePath(pathname);
  const frenchPath = pathname === "/en" || pathname.startsWith("/en/") ? alternate : pathname;
  const englishPath = pathname === "/en" || pathname.startsWith("/en/") ? pathname : alternate;
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    { tagName: "link", rel: "alternate", hrefLang: "fr-FR", href: `${origin}${frenchPath}` },
    { tagName: "link", rel: "alternate", hrefLang: "en-GB", href: `${origin}${englishPath}` },
    { tagName: "link", rel: "alternate", hrefLang: "x-default", href: `${origin}${frenchPath}` },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

export function productStructuredData(product: Product, locale: Locale) {
  const translation = product.translations[locale];
  const offers = product.variants.flatMap((variant) => variant.offers
    .filter((offer) => offer.audience === "retail" && offer.active)
    .map((offer) => ({
      "@type": "Offer",
      priceCurrency: "EUR",
      price: (offer.price.amount / 100).toFixed(2),
      availability: variant.stockOnHand - variant.stockReserved > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      sku: variant.sku,
    })));
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: translation.name,
    description: translation.shortDescription,
    image: product.media.map((media) => media.url),
    brand: { "@type": "Brand", name: "Zen Coffee Lab" },
    offers,
  };
}

export function JsonLd({ value }: { value: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }} />;
}
