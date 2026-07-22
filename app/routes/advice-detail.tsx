import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getArticles } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request); const article = (await getArticles()).find((item) => item.slug === params.slug);
  if (!article) throw new Response(locale === "fr-FR" ? "Conseil introuvable" : "Article not found", { status: 404 });
  return { locale, article };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => data ? pageMeta(`${data.article.title[data.locale]} | Zen Coffee Lab`, data.article.excerpt[data.locale], `${data.locale === "en-GB" ? "/en/tips" : "/conseils"}/${data.article.slug}`) : [];
export default function AdviceDetail() {
  const { locale, article } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  return <article><header className="page-hero"><p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h1>{article.title[locale]}</h1><p className="lede">{article.excerpt[locale]}</p></header><div className="article-body">{article.body[locale].map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<Link className="text-link" to={english ? "/en/tips" : "/conseils"}>← {english ? "All tips" : "Tous les conseils"}</Link></div></article>;
}
