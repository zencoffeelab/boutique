import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { ContentBlocks } from "~/components/content-blocks";
import { getArticles, getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { JsonLd, pageMeta } from "~/lib/seo";
import { getContentPage } from "~/lib/content.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const [products, articles, content] = await Promise.all([getProducts({ status: "published", availableOnly: true }), getArticles(), getContentPage("accueil", locale)]);
  return { locale, products: products.filter((product) => product.featured).slice(0, 6), articles: articles.slice(0, 2), content };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const english = data?.locale === "en-GB";
  return pageMeta(
    data?.content?.seoTitle ?? (english ? "Zen Coffee Lab — Specialty coffee roasted in Tours" : "Zen Coffee Lab — Café de spécialité torréfié à Tours"),
    data?.content?.seoDescription ?? (english ? "Light-roasted specialty coffee, selected and roasted with precision in Tours, France." : "Cafés de spécialité torréfiés avec précision et légèreté à Tours."),
    english ? "/en" : "/",
  );
};

export default function Home() {
  const { locale, products, articles, content } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  return (
    <>
      <JsonLd value={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Zen Coffee Lab",
        url: "https://www.zencoffeelab.com",
        logo: "https://www.zencoffeelab.com/favicon.svg",
        address: { "@type": "PostalAddress", addressLocality: "Tours", addressCountry: "FR" },
        sameAs: ["https://www.instagram.com/zencoffeeclub/"],
      }} />
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Micro-roastery · Tours</p>
          <h1>{english ? <>Coffee with <em>clarity.</em></> : <>Le café en toute <em>clarté.</em></>}</h1>
          <p>{english ? "Traceable coffees, lightly roasted in small batches to let every origin speak." : "Des cafés traçables, torréfiés avec légèreté en petits lots pour laisser chaque origine s’exprimer."}</p>
          <div className="hero__actions">
            <Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Shop our coffees" : "Découvrir les cafés"}<ArrowRight aria-hidden="true" /></Link>
            <Link className="button button--ghost" to={english ? "/en/about-us" : "/a-propos"}>{english ? "Our approach" : "Notre approche"}</Link>
          </div>
        </div>
        <div className="hero__media">
          {products[0]?.media[0] ? <img src={products[0].media[0].url} alt={english ? "Zen Coffee Lab specialty coffee" : "Café de spécialité Zen Coffee Lab"} width="960" height="1100" fetchPriority="high" /> : null}
          <span className="hero__stamp">{english ? "Roasted fresh in Tours" : "Torréfié frais à Tours"}</span>
        </div>
      </section>

      <section className="section page-shell">
        <div className="section-header">
          <div><p className="eyebrow">{english ? "Current selection" : "Sélection du moment"}</p><h2>{english ? "Coffees in season" : "Cafés de saison"}</h2></div>
          <Link className="text-link" to={english ? "/en/shop" : "/boutique"}>{english ? "View all coffees" : "Voir tous les cafés"}<ArrowRight aria-hidden="true" /></Link>
        </div>
        {products.length > 0
          ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>
          : <div className="empty-state"><p>{english ? "Our next coffees are being prepared." : "Nos prochains cafés sont en préparation."}</p></div>}
      </section>

      <section className="statement">
        <p>{english ? <>Every coffee carries a place, a person and an <em>intention.</em></> : <>Chaque café raconte un lieu, une personne et une <em>intention.</em></>}</p>
      </section>
      <ContentBlocks blocks={content?.blocks} />

      <section className="value-grid" aria-label={english ? "Our commitments" : "Nos engagements"}>
        <article className="value-card"><b>01</b><h3>{english ? "Sourced with care" : "Sourcé avec soin"}</h3><p>{english ? "Traceable lots chosen for their singularity and the quality of the work at origin." : "Des lots traçables choisis pour leur singularité et la qualité du travail à l’origine."}</p></article>
        <article className="value-card"><b>02</b><h3>{english ? "Roasted lightly" : "Torréfié avec légèreté"}</h3><p>{english ? "A precise roasting profile that preserves sweetness, acidity and aromatic clarity." : "Une torréfaction précise qui préserve douceur, acidité et clarté aromatique."}</p></article>
        <article className="value-card"><b>03</b><h3>{english ? "Shared simply" : "Partagé simplement"}</h3><p>{english ? "Clear brewing advice to help each coffee shine, at home or behind the bar." : "Des conseils clairs pour révéler chaque café, à la maison comme derrière le bar."}</p></article>
      </section>

      <section className="section page-shell">
        <div className="section-header"><div><p className="eyebrow">Journal</p><h2>{english ? "Brew better" : "Mieux préparer"}</h2></div></div>
        <div className="article-grid">{articles.map((article) => <article className="article-card" key={article.slug}><p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h2>{article.title[locale]}</h2><p>{article.excerpt[locale]}</p><Link className="text-link" to={`${english ? "/en/tips" : "/conseils"}/${article.slug}`}>{english ? "Read" : "Lire"}<ArrowRight aria-hidden="true" /></Link></article>)}</div>
      </section>
    </>
  );
}
