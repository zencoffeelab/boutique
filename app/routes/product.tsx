import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { ProductPurchase } from "~/components/product-purchase";
import { ProductPackArtwork } from "~/components/product-thumbnail-label";
import { ProductRibbons } from "~/components/product-ribbons";
import { ProfessionalQuoteAdd } from "~/components/professional-quote/professional-quote-add";
import type { Audience, Locale, Product, ProductEditorialBlock } from "~/domain/types";
import { getAudience, requireAdmin } from "~/lib/auth.server";
import { getAdminProducts, getProducts, hasPurchasableVariant } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { getRelatedProducts } from "~/lib/product-recommendations";
import { isProductSoldOut } from "~/lib/product-ribbons";
import { JsonLd, pageMeta, productStructuredData } from "~/lib/seo";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const url = new URL(request.url);
  const previewId = url.searchParams.get("preview");
  const preview = Boolean(previewId);
  const wantsProfessional = url.searchParams.get("audience") === "professional";
  const authorizedAudience = wantsProfessional
    ? await getAudience(request)
    : "retail";
  const audience: Audience =
    wantsProfessional && authorizedAudience === "professional"
      ? "professional"
      : "retail";
  if (preview) await requireAdmin(request);
  const products = preview
    ? await getAdminProducts()
    : await getProducts({ audience });
  const product =
    products.find((item) =>
      preview
        ? item.id === previewId && item.slug === params.slug
        : item.slug === params.slug,
    ) ?? null;
  if (
    !product ||
    (!preview &&
      product.status !== "published" &&
      product.status !== "archived") ||
    (!preview &&
      product.status === "published" &&
      audience === "professional" &&
      !product.professionalEnabled)
  )
    throw new Response(
      locale === "fr-FR" ? "Café introuvable" : "Coffee not found",
      { status: 404 },
    );
  const archived = product.status === "archived";
  const relatedProducts = getRelatedProducts(
    product,
    products.filter((candidate) => candidate.status === "published" && hasPurchasableVariant(candidate, audience)),
    locale,
  );
  return { locale, product, audience, archived, preview, relatedProducts };
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) return [{ title: "Café introuvable | Zen Coffee Lab" }];
  const metadata = pageMeta(
    data.product.translations[data.locale].seoTitle,
    data.product.translations[data.locale].seoDescription,
    data.locale === "fr-FR"
      ? `/boutique/${data.product.slug}`
      : `/en/shop/${data.product.slug}`,
    data.product.media[0]?.url,
  );
  return data.preview
    ? [...metadata, { name: "robots", content: "noindex,nofollow" }]
    : metadata;
};

export function productReturnLink(locale: Locale, audience: Audience, archived = false) {
  if (archived) {
    return locale === "en-GB"
      ? { href: "/en/archives", label: "Coffee archives" }
      : { href: "/archives", label: "Archives café" };
  }
  if (audience === "professional") {
    return locale === "en-GB"
      ? { href: "/en/professional", label: "Professional coffees" }
      : { href: "/professionnel", label: "Cafés professionnels" };
  }
  return locale === "en-GB"
    ? { href: "/en/shop", label: "All coffees" }
    : { href: "/boutique", label: "Tous les cafés" };
}

function EditorialBlock({
  block,
  locale,
}: {
  block: ProductEditorialBlock;
  locale: Locale;
}) {
  const imageFirst = block.position === 2;
  return (
    <section
      className={`product-story-block${imageFirst ? " product-story-block--image-first" : ""}`}
      aria-labelledby={`product-story-${block.id}`}
    >
      <div className="product-story-block__copy">
        <h2 id={`product-story-${block.id}`}>{block.title[locale]}</h2>
        <p>{block.body[locale]}</p>
      </div>
      <figure className="product-story-block__media">
        <img
          src={block.imageUrl}
          alt={block.imageAlt[locale]}
          width="750"
          height="830"
          loading="lazy"
        />
      </figure>
    </section>
  );
}

function ProductStory({
  blocks,
  locale,
}: {
  blocks: readonly ProductEditorialBlock[];
  locale: Locale;
}) {
  const configuredBlocks = blocks.filter(
    (block) => block.imageUrl && block.title[locale] && block.body[locale],
  );
  if (configuredBlocks.length === 0) return null;
  return (
    <div className="product-story">
      {configuredBlocks.map((block) => (
        <EditorialBlock key={block.id} block={block} locale={locale} />
      ))}
    </div>
  );
}

function ProductExtractionGuide({ product, locale }: { product: Product; locale: Locale }) {
  const guide = product.extractionGuide;
  return (
    <section className="product-extraction-guide" aria-labelledby="product-extraction-guide-title">
      <h2 id="product-extraction-guide-title">{guide.title[locale]}</h2>
      <Link className="button button--ghost" to={guide.href[locale]}>
        {guide.label[locale]} <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

export function ProductGallery({ product, locale }: { product: Product; locale: Locale }) {
  const labelUrl = product.thumbnailLabelUrl;
  const translation = product.translations[locale];
  const soldOut = isProductSoldOut(product.stockOnHandGrams, product.status);
  return <div className="product-gallery">
    <ProductRibbons product={product} locale={locale} />
    {labelUrl ? <div
      className={`product-gallery__composed${soldOut ? " product-gallery__composed--sold-out" : ""}`}
      style={{ "--product-thumbnail-color": product.thumbnailBackgroundColor } as CSSProperties}
    >
      <ProductPackArtwork
        packClassName="product-gallery__pack"
        labelClassName="product-gallery__label"
        labelUrl={labelUrl}
        alt={product.media[0]?.alt[locale] || translation.name}
        loading="eager"
      />
    </div> : null}
    {product.hoverImageUrl ? <img
      className={soldOut ? "product-gallery__hover-image product-gallery__image--sold-out" : "product-gallery__hover-image"}
      src={product.hoverImageUrl}
      alt={translation.name}
      width={900}
      height={900}
      loading="lazy"
    /> : null}
    {product.media.map((media, index) => <img
      className={soldOut && !labelUrl && index === 0 ? "product-gallery__image--sold-out" : undefined}
      key={media.id}
      src={media.url}
      alt={media.alt[locale]}
      width={media.width}
      height={media.height}
      loading={!labelUrl && index === 0 ? "eager" : "lazy"}
    />)}
  </div>;
}

export default function ProductDetail() {
  const { locale, product, audience, archived, preview, relatedProducts } =
    useLoaderData<typeof loader>();
  const t = product.translations[locale];
  const english = locale === "en-GB";
  const returnLink = preview
    ? { href: `/admin/produits/${product.id}`, label: english ? "Back to editing" : "Retour à l’édition" }
    : productReturnLink(locale, audience, archived);
  return (
    <>
      {preview ? null : <JsonLd value={productStructuredData(product, locale)} />}
      {preview ? (
        <aside
          className="product-preview-banner"
          aria-label={english ? "Draft preview" : "Aperçu du brouillon"}
        >
          <div>
            <strong>{english ? "Private preview" : "Aperçu privé"}</strong>
            <span>
              {english
                ? "This draft is visible only to signed-in administrators and cannot be purchased."
                : "Ce brouillon est visible uniquement par les administrateurs connectés et ne peut pas être acheté."}
            </span>
          </div>
          <Link
            className="button button--dark"
            to={`/admin/produits/${product.id}`}
          >
            {english ? "Edit this coffee" : "Modifier ce café"}
          </Link>
        </aside>
      ) : null}
      <nav
        className="page-shell"
        aria-label="Breadcrumb"
        style={{ paddingBlock: "1rem" }}
      >
        <Link className="text-link" to={returnLink.href}>
          ← {returnLink.label}
        </Link>
      </nav>
      <article className="product-detail">
        <ProductGallery product={product} locale={locale} />
        <div className="product-info">
          <h1>{t.name}</h1>
          <table className="product-specifications">
            <tbody>
              <tr><th scope="row">{english ? "Producer" : "Producteur"}</th><td>{t.producer}</td></tr>
              <tr><th scope="row">{english ? "Region" : "Région"}</th><td>{t.region}</td></tr>
              <tr><th scope="row">{english ? "Variety" : "Variété"}</th><td>{t.variety}</td></tr>
              <tr><th scope="row">{english ? "Process" : "Traitement"}</th><td>{t.process}</td></tr>
              <tr><th scope="row">Altitude</th><td>{product.altitudeMeters} m</td></tr>
              <tr><th scope="row">{english ? "Roast" : "Torréfaction"}</th><td>{english ? "Light" : "Légère"}</td></tr>
            </tbody>
          </table>
          <p className="product-info__description">{t.shortDescription}</p>
          {preview ? <section className="product-archive-notice" aria-label={english ? "Draft coffee" : "Café en brouillon"}>
            <p className="eyebrow">{english ? "Draft" : "Brouillon"}</p>
            <p>{english ? "Purchasing is disabled while you review this page." : "L’achat est désactivé pendant la consultation de cet aperçu."}</p>
          </section> : archived ? <section className="product-archive-notice" aria-label={english ? "Archived coffee" : "Café archivé"}>
            <p className="eyebrow">{english ? "Coffee archives" : "Archives café"}</p>
            <p>{english ? "This limited lot is no longer available for purchase, but its complete story remains available to read." : "Ce lot éphémère n’est plus disponible à l’achat, mais son histoire complète reste accessible."}</p>
          </section> : audience === "professional" ? <ProfessionalQuoteAdd product={product} locale={locale} /> : <ProductPurchase product={product} locale={locale} audience={audience} />}
        </div>
      </article>
      {t.tastingNotes.length > 0 ? (
        <section className="product-tasting-notes" aria-labelledby="product-tasting-notes-title">
          <h2 id="product-tasting-notes-title">
            {english ? "Tasting notes" : "Notes de dégustation"}
          </h2>
          <ul>
            {t.tastingNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </section>
      ) : null}
      <ProductStory blocks={product.editorialBlocks} locale={locale} />
      <ProductExtractionGuide product={product} locale={locale} />
      {relatedProducts.length > 0 ? (
        <section
          className="related-products"
          aria-labelledby="related-products-title"
        >
          <div className="page-shell">
            <div className="section-header">
              <h2 id="related-products-title">
                {english ? "You may also like" : "Vous aimerez aussi"}
              </h2>
              <Link
                className="button button--ghost"
                to={english ? "/en/shop" : "/boutique"}
              >
                {english ? "All coffees" : "Tous les cafés"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="product-grid">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard
                  key={relatedProduct.id}
                  product={relatedProduct}
                  locale={locale}
                  audience={audience}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
