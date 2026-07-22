import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ProductPurchase } from "~/components/product-purchase";
import type { Audience } from "~/domain/types";
import { getAudience } from "~/lib/auth.server";
import { getProductBySlug, getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { JsonLd, pageMeta, productStructuredData } from "~/lib/seo";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const wantsProfessional = new URL(request.url).searchParams.get("audience") === "professional";
  const authorizedAudience = wantsProfessional ? await getAudience(request) : "retail";
  const audience: Audience = wantsProfessional && authorizedAudience === "professional" ? "professional" : "retail";
  const product = audience === "professional"
    ? (await getProducts({ status: "published", audience: "professional" })).find((item) => item.slug === params.slug) ?? null
    : await getProductBySlug(params.slug ?? "");
  if (!product || product.status !== "published") throw new Response(locale === "fr-FR" ? "Café introuvable" : "Coffee not found", { status: 404 });
  return { locale, product, audience };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => data
  ? pageMeta(data.product.translations[data.locale].seoTitle, data.product.translations[data.locale].seoDescription, data.locale === "fr-FR" ? `/boutique/${data.product.slug}` : `/en/shop/${data.product.slug}`, data.product.media[0]?.url)
  : [{ title: "Café introuvable | Zen Coffee Lab" }];

export default function ProductDetail() {
  const { locale, product, audience } = useLoaderData<typeof loader>();
  const t = product.translations[locale];
  const english = locale === "en-GB";
  return <>
    <JsonLd value={productStructuredData(product, locale)} />
    <nav className="page-shell" aria-label="Breadcrumb" style={{ paddingBlock: "1rem" }}><Link className="text-link" to={english ? "/en/shop" : "/boutique"}>← {english ? "All coffees" : "Tous les cafés"}</Link></nav>
    <article className="product-detail">
      <div className="product-gallery">{product.media.map((media, index) => <img key={media.id} src={media.url} alt={media.alt[locale]} width={media.width} height={media.height} loading={index === 0 ? "eager" : "lazy"} />)}</div>
      <div className="product-info">
        <p className="eyebrow">{t.region}</p><h1>{t.name}</h1><p className="product-info__description">{t.shortDescription}</p>
        <ul className="taste-notes" aria-label={english ? "Tasting notes" : "Notes de dégustation"}>{t.tastingNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        <ProductPurchase product={product} locale={locale} audience={audience} />
      </div>
    </article>
    <dl className="origin-grid">
      <div><dt>{english ? "Producer" : "Producteur"}</dt><dd>{t.producer}</dd></div>
      <div><dt>{english ? "Region" : "Région"}</dt><dd>{t.region}</dd></div>
      <div><dt>{english ? "Variety" : "Variété"}</dt><dd>{t.variety}</dd></div>
      <div><dt>{english ? "Process" : "Traitement"}</dt><dd>{t.process}</dd></div>
      <div><dt>Altitude</dt><dd>{product.altitudeMeters} m</dd></div>
    </dl>
    <section className="editorial-copy"><p className="eyebrow">{english ? "From seed to cup" : "De la graine à la tasse"}</p><p>{t.body}</p></section>
  </>;
}
