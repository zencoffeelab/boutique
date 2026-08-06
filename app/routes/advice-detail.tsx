import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { EditorialStory } from "~/components/editorial-story";
import { getArticles, getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const [articles, products] = await Promise.all([getArticles(), getProducts({ status: "published", availableOnly: false })]);
  const article = articles.find((item) => item.slug === params.slug);
  if (!article) throw new Response(locale === "fr-FR" ? "Conseil introuvable" : "Article not found", { status: 404 });
  const relatedArticles = articles.filter((item) => item.slug !== article.slug).slice(0, 3);
  return { locale, article, relatedArticles, storyImages: products.flatMap((product) => product.media.slice(0, 1).map((media) => ({ src: media.url, alt: media.alt[locale] }))) };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => data ? pageMeta(`${data.article.title[data.locale]} | Zen Coffee Lab`, data.article.excerpt[data.locale], `${data.locale === "en-GB" ? "/en/tips" : "/conseils"}/${data.article.slug}`) : [];
export default function AdviceDetail() {
  const { locale, article, relatedArticles, storyImages } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const advicePath = english ? "/en/tips" : "/conseils";
  const shopPath = english ? "/en/shop" : "/boutique";
  return <article>
    <header className="page-hero"><p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h1>{article.title[locale]}</h1><p className="lede">{article.excerpt[locale]}</p></header>
    <div className="advice-story"><EditorialStory content={[article.excerpt[locale]]} images={article.story[locale].introImageUrl ? [{ src: article.story[locale].introImageUrl, alt: article.story[locale].introImageAlt ?? "Coffee" }] : storyImages} imageFirst={article.story[locale].introImageFirst ?? false} /><EditorialStory content={article.body[locale]} images={article.story[locale].bodyImageUrl ? [{ src: article.story[locale].bodyImageUrl, alt: article.story[locale].bodyImageAlt ?? "Coffee" }] : storyImages} imageFirst={article.story[locale].bodyImageFirst ?? true} />{article.body2 ? <><EditorialStory content={article.body2[locale]} images={article.story[locale].bodyImageUrl ? [{ src: article.story[locale].bodyImageUrl, alt: article.story[locale].bodyImageAlt ?? "Coffee" }] : storyImages} imageFirst /></> : null}</div>
    <div className="article-body advice-detail__body advice-detail__action"><Link className="text-link advice-detail__back" to={shopPath}>{english ? "Visit the shop" : "Visiter la boutique"}</Link></div>
    {relatedArticles.length ? <section className="advice-related" aria-labelledby="advice-related-title">
      <div className="page-shell">
        <div className="section-header">
          <div><p className="eyebrow">{english ? "Keep exploring" : "Continuer la lecture"}</p><h2 id="advice-related-title">{english ? "More coffee tips" : "D’autres conseils café"}</h2></div>
          <Link className="button button--ghost" to={advicePath}>{english ? "All tips" : "Tous les conseils"}<ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="advice-related__grid">
          {relatedArticles.map((relatedArticle) => <article className="article-card" key={relatedArticle.slug}>
            <p className="eyebrow">{new Date(relatedArticle.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p>
            <h2>{relatedArticle.title[locale]}</h2>
            <p>{relatedArticle.excerpt[locale]}</p>
            <Link className="text-link" to={`${advicePath}/${relatedArticle.slug}`}>{english ? "Read the guide" : "Lire le guide"}<ArrowRight aria-hidden="true" /></Link>
          </article>)}
        </div>
      </div>
    </section> : null}
  </article>;
}
