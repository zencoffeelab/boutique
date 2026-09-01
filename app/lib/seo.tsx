import type { Locale, Product } from "~/domain/types";
import { SHIPPING_COUNTRY_CODES } from "~/domain/shipping-zones";
import { alternatePath } from "~/lib/i18n";

const origin = "https://www.zencoffeelab.com";
const absoluteUrl = (value: string) => new URL(value, origin).toString();
const canonicalPath = (pathname: string) => {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
};

export function pageMeta(title: string, description: string, pathname: string, image?: string) {
  const normalizedPath = canonicalPath(pathname);
  const canonical = `${origin}${normalizedPath}`;
  const alternate = alternatePath(normalizedPath);
  const frenchPath = normalizedPath === "/en" || normalizedPath.startsWith("/en/") ? alternate : normalizedPath;
  const englishPath = normalizedPath === "/en" || normalizedPath.startsWith("/en/") ? normalizedPath : alternate;
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
    ...(image ? [{ property: "og:image", content: absoluteUrl(image) }] : []),
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

export function productStructuredData(product: Product, locale: Locale) {
  const translation = product.translations[locale];
  const imageUrls = product.media.length
    ? product.media.map((media) => absoluteUrl(media.url))
    : [absoluteUrl(product.hoverImageUrl ?? product.thumbnailLabelUrl ?? "/media/product-cards/zen-coffee-bag-resealable.webp")];
  const productUrl = `${origin}${locale === "fr-FR" ? "/boutique" : "/en/shop"}/${product.slug}`;
  const offers = product.status === "published" ? product.variants.flatMap((variant) => variant.offers
    .filter((offer) => offer.audience === "retail" && offer.active)
    .map((offer) => ({
      "@type": "Offer",
      priceCurrency: "EUR",
      price: (offer.price.amount / 100).toFixed(2),
      url: productUrl,
      availability: variant.stockOnHand - variant.stockReserved > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      sku: variant.sku,
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: SHIPPING_COUNTRY_CODES,
        returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
        merchantReturnLink: `${origin}${locale === "fr-FR" ? "/cgv" : "/en/general-terms-and-conditions-of-sale"}`,
      },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        hasShippingService: { "@id": `${origin}/#shipping-service` },
      },
    }))) : [];
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: translation.name,
    description: translation.shortDescription,
    image: imageUrls,
    brand: { "@type": "Brand", name: "Zen Coffee Lab" },
    ...(offers.length ? { offers } : {}),
  };
}

export function JsonLd({ value }: { value: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }} />;
}
