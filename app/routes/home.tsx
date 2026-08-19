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
  const [products, articles, content] = await Promise.all([getProducts({ status: "published" }), getArticles(), getContentPage("accueil", locale)]);
  return { locale, products: products.filter((product) => product.featured).slice(0, 6), articles: articles.slice(0, 2), content };
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const english = data?.locale === "en-GB";
  return pageMeta(
    data?.content?.seoTitle ?? (english ? "Zen Coffee Lab — Specialty coffee roasted in Tours" : "Zen Coffee Lab — Café de spécialité torréfié à Tours"),
    data?.content?.seoDescription ?? (english ? "Light-roasted specialty coffee, selected and roasted with precision in Tours, France." : "Cafés de spécialité torréfiés avec précision et légèreté à Tours."),
    english ? "/en" : "/",
  );
};

const defaultHomeContent = {
  fr: { statement: "Le café est un voyage. Notre torréfaction en est le plus fidèle guide.\nChaque tasse est une invitation au départ, une origine à découvrir, une histoire à *partager*.", values: [["Sourcé avec soin", "Des lots traçables choisis pour leur singularité et la qualité du travail à l’origine."], ["Torréfié avec légèreté", "Une torréfaction précise qui préserve douceur, acidité et clarté aromatique."], ["Partagé simplement", "Des conseils clairs pour révéler chaque café, à la maison comme derrière le bar."]] },
  en: { statement: "Coffee is a journey. Our roast is its most faithful guide.\nEvery cup is an invitation to set off, an origin to discover,\na story to *share*.", values: [["Sourced with care", "Traceable lots chosen for their singularity and the quality of the work at origin."], ["Roasted lightly", "A precise roasting profile that preserves sweetness, acidity and aromatic clarity."], ["Shared simply", "Clear brewing advice to help each coffee shine, at home or behind the bar."]] },
} as const;

const legacyHomeStatements = new Set([
  "Chaque café raconte un lieu, une personne et une *intention.*",
  "Every coffee carries a place, a person and an *intention.*",
]);

function getHomeContent(blocks: Array<{ type?: unknown; content?: unknown }> | undefined, english: boolean) {
  const fallback = english ? defaultHomeContent.en : defaultHomeContent.fr;
  const statementContent = blocks?.find((block) => block.type === "homeStatement")?.content;
  const valuesContent = blocks?.find((block) => block.type === "homeValues")?.content;
  const statement = statementContent && typeof statementContent === "object" && typeof (statementContent as { text?: unknown }).text === "string" ? (statementContent as { text: string }).text : fallback.statement;
  const cards = valuesContent && typeof valuesContent === "object" && Array.isArray((valuesContent as { cards?: unknown }).cards) ? (valuesContent as { cards: unknown[] }).cards : [];
  const values = fallback.values.map(([fallbackTitle, fallbackText], index) => {
    const card = cards[index];
    return card && typeof card === "object" ? [typeof (card as { title?: unknown }).title === "string" ? (card as { title: string }).title : fallbackTitle, typeof (card as { text?: unknown }).text === "string" ? (card as { text: string }).text : fallbackText] : [fallbackTitle, fallbackText];
  });
  const heroContent = blocks?.find((block) => block.type === "homeHeroImage")?.content;
  const hero = heroContent && typeof heroContent === "object" ? heroContent as { url?: string; alt?: string } : {};
  return { statement: legacyHomeStatements.has(statement) ? fallback.statement : statement, values, hero };
}

function StatementText({ text }: { text: string }) {
  return <>{text.split("\n").map((line, lineIndex) => <span key={lineIndex}>{lineIndex === 1 ? <><br /><br /></> : lineIndex > 1 ? <br /> : null}{line.split("*").map((part, index) => index % 2 ? <em key={index}>{part}</em> : part)}</span>)}</>;
}

export default function Home() {
  const { locale, products, articles, content } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const home = getHomeContent(content?.blocks, english);
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
        <div className="hero__media">
          <img src={home.hero.url || "/media/home-hero-coffee-cherries.webp"} alt={home.hero.alt || (english ? "Coffee cherries ripening on a coffee plant" : "Cerises de café mûrissant sur un caféier")} width="1672" height="941" fetchPriority="high" />
          <div className="hero__copy">
            <p className="eyebrow">{english ? "Micro-roastery" : "micro-torréfacteur"} · Tours</p>
            <h1>{english ? <>A roast tailored to the <em>origin.</em></> : <>Une torréfaction pensée pour l’<em>origine.</em></>}</h1>
            <div className="hero__actions">
              <Link className="button hero__button hero__button--primary" to={english ? "/en/shop" : "/boutique"}>{english ? "Shop our coffees" : "Découvrir les cafés"}<ArrowRight aria-hidden="true" /></Link>
              <Link className="button hero__button hero__button--secondary" to={english ? "/en/about-us" : "/a-propos"}>{english ? "Our approach" : "Notre approche"}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section page-shell">
        <div className="section-header">
          <div><p className="eyebrow">{english ? "Current selection" : "Sélection du moment"}</p><h2>{english ? "Coffees in season" : "Cafés de saison"}</h2></div>
          <Link className="text-link" to={english ? "/en/shop" : "/boutique"}>{english ? "View all coffees" : "Voir tous les cafés"}<ArrowRight aria-hidden="true" /></Link>
        </div>
        {products.length > 0
          ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} quickAdd />)}</div>
          : <div className="empty-state"><p>{english ? "Our next coffees are being prepared." : "Nos prochains cafés sont en préparation."}</p></div>}
      </section>

      <section className="statement">
        <p><StatementText text={home.statement} /></p>
      </section>
      <ContentBlocks
        blocks={content?.blocks}
        footer={
          <Link className="button button--dark" to={english ? "/en/about-us" : "/a-propos"}>
            {english ? "Learn more" : "En savoir plus"}
            <ArrowRight aria-hidden="true" />
          </Link>
        }
      />

      <section className="value-grid" aria-label={english ? "Our commitments" : "Nos engagements"}>
        {home.values.map(([title, text], index) => <article className="value-card" key={index}><b>{String(index + 1).padStart(2, "0")}</b><h3>{title}</h3><p>{text}</p></article>)}
      </section>

      <section className="section page-shell">
        <div className="section-header"><div><p className="eyebrow">Blog</p><h2>{english ? "Brew better" : "Mieux préparer"}</h2></div></div>
        <div className="article-grid">{articles.map((article) => <article className={article.pinned ? "article-card article-card--pinned" : "article-card"} key={article.slug}>{article.pinned ? <span className="article-card__ribbon">{english ? "Pinned" : "Épinglé"}</span> : null}<p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h2>{article.title[locale]}</h2><p className="article-card__excerpt">{article.excerpt[locale]}</p><Link className="text-link" to={`${english ? "/en/blog" : "/blog"}/${article.slug}`}>{english ? "Read" : "Lire"}<ArrowRight aria-hidden="true" /></Link></article>)}</div>
      </section>
    </>
  );
}
