import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getArticles } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) { return { locale: getLocale(request), articles: await getArticles() }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Coffee brewing tips | Zen Coffee Lab" : "Conseils café | Zen Coffee Lab", data?.locale === "en-GB" ? "Recipes and practical guides for better coffee." : "Recettes et guides pratiques pour mieux préparer le café.", data?.locale === "en-GB" ? "/en/tips" : "/conseils");

export default function Advice() {
  const { locale, articles } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  return <><header className="page-hero"><p className="eyebrow">Journal</p><h1>{english ? "Brew with intention" : "Préparer avec intention"}</h1><p className="lede">{english ? "Practical, precise advice to reveal what is already in the bean." : "Des conseils pratiques et précis pour révéler ce qui se trouve déjà dans le grain."}</p></header><section className="section page-shell"><div className="article-grid">{articles.map((article) => <article className="article-card" key={article.slug}><p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h2>{article.title[locale]}</h2><p>{article.excerpt[locale]}</p><Link className="text-link" to={`${english ? "/en/tips" : "/conseils"}/${article.slug}`}>{english ? "Read the guide" : "Lire le guide"}<ArrowRight aria-hidden="true" /></Link></article>)}</div></section></>;
}
