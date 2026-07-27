import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { ProductPurchase } from "~/components/product-purchase";
import { ProfessionalQuoteAdd } from "~/components/professional-quote/professional-quote-add";
import type { Audience, Locale, ProductEditorialBlock } from "~/domain/types";
import { getAudience } from "~/lib/auth.server";
import { getProducts, hasPurchasableVariant } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { getRelatedProducts } from "~/lib/product-recommendations";
import { JsonLd, pageMeta, productStructuredData } from "~/lib/seo";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const wantsProfessional =
    new URL(request.url).searchParams.get("audience") === "professional";
  const authorizedAudience = wantsProfessional
    ? await getAudience(request)
    : "retail";
  const audience: Audience =
    wantsProfessional && authorizedAudience === "professional"
      ? "professional"
      : "retail";
  const products = await getProducts({ status: "published", audience });
  const product = products.find((item) => item.slug === params.slug) ?? null;
  if (!product || product.status !== "published" || (audience === "professional" && !product.professionalEnabled))
    throw new Response(
      locale === "fr-FR" ? "Café introuvable" : "Coffee not found",
      { status: 404 },
    );
  const relatedProducts = getRelatedProducts(
    product,
    products.filter((candidate) => hasPurchasableVariant(candidate, audience)),
    locale,
  );
  return { locale, product, audience, relatedProducts };
}

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data
    ? pageMeta(
        data.product.translations[data.locale].seoTitle,
        data.product.translations[data.locale].seoDescription,
        data.locale === "fr-FR"
          ? `/boutique/${data.product.slug}`
          : `/en/shop/${data.product.slug}`,
        data.product.media[0]?.url,
      )
    : [{ title: "Café introuvable | Zen Coffee Lab" }];

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
          width="1600"
          height="1200"
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

export default function ProductDetail() {
  const { locale, product, audience, relatedProducts } =
    useLoaderData<typeof loader>();
  const t = product.translations[locale];
  const english = locale === "en-GB";
  return (
    <>
      <JsonLd value={productStructuredData(product, locale)} />
      <nav
        className="page-shell"
        aria-label="Breadcrumb"
        style={{ paddingBlock: "1rem" }}
      >
        <Link className="text-link" to={english ? "/en/shop" : "/boutique"}>
          ← {english ? "All coffees" : "Tous les cafés"}
        </Link>
      </nav>
      <article className="product-detail">
        <div className="product-gallery">
          {product.media.map((media, index) => (
            <img
              key={media.id}
              src={media.url}
              alt={media.alt[locale]}
              width={media.width}
              height={media.height}
              loading={index === 0 ? "eager" : "lazy"}
            />
          ))}
        </div>
        <div className="product-info">
          <p className="eyebrow">{t.region}</p>
          <h1>{t.name}</h1>
          <p className="product-info__description">{t.shortDescription}</p>
          <ul
            className="taste-notes"
            aria-label={english ? "Tasting notes" : "Notes de dégustation"}
          >
            {t.tastingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {audience === "professional" ? <ProfessionalQuoteAdd product={product} locale={locale} /> : <ProductPurchase product={product} locale={locale} audience={audience} />}
        </div>
      </article>
      <dl className="origin-grid">
        <div>
          <dt>{english ? "Producer" : "Producteur"}</dt>
          <dd>{t.producer}</dd>
        </div>
        <div>
          <dt>{english ? "Region" : "Région"}</dt>
          <dd>{t.region}</dd>
        </div>
        <div>
          <dt>{english ? "Variety" : "Variété"}</dt>
          <dd>{t.variety}</dd>
        </div>
        <div>
          <dt>{english ? "Process" : "Traitement"}</dt>
          <dd>{t.process}</dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>{product.altitudeMeters} m</dd>
        </div>
      </dl>
      <ProductStory blocks={product.editorialBlocks} locale={locale} />
      <section className="editorial-copy">
        <p className="eyebrow">
          {english ? "From seed to cup" : "De la graine à la tasse"}
        </p>
        <p>{t.body}</p>
      </section>
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
