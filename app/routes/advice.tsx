import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getArticles } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

function blogSubtitle(blocks: Array<{ type?: unknown; content?: unknown }> | undefined) {
  const content = blocks?.find((block) => block.type === "blogHero")?.content;
  return content && typeof content === "object" && typeof (content as { subtitle?: unknown }).subtitle === "string"
    ? (content as { subtitle: string }).subtitle
    : undefined;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const [articles, content] = await Promise.all([getArticles(), getContentPage("conseils", locale)]);
  return { locale, articles, content };
}
export function headers() { return { "Cache-Control": "no-store" }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.content?.seoTitle ?? (data?.locale === "en-GB" ? "Coffee blog | Zen Coffee Lab" : "Blog café | Zen Coffee Lab"), data?.content?.seoDescription ?? (data?.locale === "en-GB" ? "Recipes and practical guides for better coffee." : "Recettes et guides pratiques pour mieux préparer le café."), data?.locale === "en-GB" ? "/en/blog" : "/blog");

export default function Advice() {
  const { locale, articles, content } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const title = content?.title ?? (english ? "Brew with intention" : "Préparer avec intention");
  const subtitle = blogSubtitle(content?.blocks) ?? (english ? "Practical, precise advice to reveal what is already in the bean." : "Des conseils pratiques et précis pour révéler ce qui se trouve déjà dans le grain.");
  return <><header className="page-hero page-hero--listing"><p className="eyebrow">Blog</p><h1>{title}</h1><p className="lede">{subtitle}</p></header><section className="section page-shell"><div className="article-grid">{articles.map((article) => <article className={article.pinned ? "article-card article-card--pinned" : "article-card"} key={article.slug}>{article.pinned ? <span className="article-card__ribbon">{english ? "Pinned" : "Épinglé"}</span> : null}<p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h2>{article.title[locale]}</h2><p className="article-card__excerpt">{article.excerpt[locale]}</p><Link className="text-link" to={`${english ? "/en/blog" : "/blog"}/${article.slug}`}>{english ? "Read the guide" : "Lire le guide"}<ArrowRight aria-hidden="true" /></Link></article>)}</div></section></>;
}
