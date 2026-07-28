import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { RichTextContent } from "~/components/rich-text-content";
import { getArticles } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const articles = await getArticles();
  const article = articles.find((item) => item.slug === params.slug);
  if (!article) throw new Response(locale === "fr-FR" ? "Conseil introuvable" : "Article not found", { status: 404 });
  const relatedArticles = articles.filter((item) => item.slug !== article.slug).slice(0, 3);
  return { locale, article, relatedArticles };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => data ? pageMeta(`${data.article.title[data.locale]} | Zen Coffee Lab`, data.article.excerpt[data.locale], `${data.locale === "en-GB" ? "/en/tips" : "/conseils"}/${data.article.slug}`) : [];
export default function AdviceDetail() {
  const { locale, article, relatedArticles } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const advicePath = english ? "/en/tips" : "/conseils";
  return <article>
    <header className="page-hero"><p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h1>{article.title[locale]}</h1><p className="lede">{article.excerpt[locale]}</p></header>
    <div className="article-body advice-detail__body"><RichTextContent content={article.body[locale]} /><Link className="text-link advice-detail__back" to={advicePath}>← {english ? "All tips" : "Tous les conseils"}</Link></div>
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
