import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { getArticles, getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { JsonLd, pageMeta } from "~/lib/seo";
import { getContentPage } from "~/lib/content.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const [products, articles, content] = await Promise.all([getProducts({ status: "published" }), getArticles(), getContentPage("accueil", locale)]);
  const currentSelection = ["kenya-kaiguri-ab", "perou-el-laurel", "panama-finca-lorayne", "colombie-santa-barbara"]
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product): product is (typeof products)[number] => Boolean(product));
  return { locale, products: (currentSelection.length === 4 ? currentSelection : products.slice(0, 4)), articles: articles.slice(0, 2), content };
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
      <section className="home-hero">
        <h1 className="sr-only">{english ? "Zen Coffee Lab — specialty coffee roasted in Tours" : "Zen Coffee Lab — café de spécialité torréfié à Tours"}</h1>
        <img
          src="/media/home-hero.jpg"
          alt={english ? "Coffee cherries at the roastery" : "Cerises de café à la torréfaction"}
          width="2560"
          height="1707"
          fetchPriority="high"
        />
        <Link className="home-hero__button" to={english ? "/en/shop" : "/boutique"}>
          {english ? "Discover our specialty coffees" : "Découvrir nos cafés de spécialité"}
        </Link>
      </section>

      <section className="home-intro">
        <div className="home-intro__copy">
          {content?.blocks?.length ? content.blocks.map((block, index) => (
            <p key={`${index}:${block.content.slice(0, 20)}`}>{block.content}</p>
          )) : english ? (
            <>
              <p>Zen Coffee Lab is a specialty micro-roastery based in Tours, France. We specialise in light roasting to showcase each coffee, its terroir and the producers behind it.</p>
              <p>Every coffee is roasted to reveal its own character: vibrant acidity, striking clarity, meticulous processing, delicious fruit notes and delicate floral aromas.</p>
            </>
          ) : (
            <>
              <p>Zen Coffee Lab est une micro-torréfaction de cafés de spécialité située à Tours, en France. Nous nous spécialisons dans la torréfaction légère afin de mettre en valeur les cafés, leur terroir et les producteurs avec lesquels nous travaillons.</p>
              <p>Chaque café est torréfié dans le dessein de sublimer ses caractéristiques propres : une acidité vive, une clarté saisissante, des notes fruitées délicieuses ou encore des arômes floraux extrêmement délicats.</p>
            </>
          )}
        </div>
        <Link className="text-link" to={english ? "/en/about-us" : "/a-propos"}>{english ? "Our story" : "Notre histoire"}<ArrowRight aria-hidden="true" /></Link>
      </section>

      <section className="home-collection" aria-labelledby="latest-coffees">
        <header className="home-section-heading">
          <h2 id="latest-coffees">{english ? "Our latest releases:" : "Nos dernières sorties :"}</h2>
          <Link className="text-link" to={english ? "/en/shop" : "/boutique"}>{english ? "view the shop" : "voir la boutique"}<ArrowRight aria-hidden="true" /></Link>
        </header>
        <div className="product-grid product-grid--flush">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>
      </section>

      <section className="home-journal" aria-labelledby="latest-advice">
        <header className="home-section-heading">
          <h2 id="latest-advice">{english ? "A few coffee tips:" : "Quelques conseils sur le café :"}</h2>
          <Link className="text-link" to={english ? "/en/tips" : "/conseils"}>{english ? "view all tips" : "voir les conseils"}<ArrowRight aria-hidden="true" /></Link>
        </header>
        <div className="home-article-grid">{articles.map((article) => (
          <article className="home-article-card" key={article.slug}>
            <Link to={`${english ? "/en/tips" : "/conseils"}/${article.slug}`}>
              <h3>{article.title[locale]}</h3>
              <time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })}</time>
            </Link>
          </article>
        ))}</div>
      </section>

      <section className="home-social">
        <p>{english ? "Follow us on social media" : "Suivez-nous sur nos réseaux"}</p>
        <a href="https://www.instagram.com/zencoffeeclub/" rel="noreferrer" target="_blank"><span>@</span>zencoffeeclub</a>
      </section>
    </>
  );
}
