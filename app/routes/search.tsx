import { Search } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { getArticles, getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(); }

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request); const english = locale === "en-GB";
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? ""; const needle = normalize(query);
  const [products, articles] = await Promise.all([getProducts({ status: "published" }), getArticles()]);
  const matches = (value: string) => normalize(value).includes(needle);
  const productResults = needle ? products.filter((product) => { const item = product.translations[locale]; return matches([item.name, item.shortDescription, item.region, item.producer, item.variety, item.process, ...item.tastingNotes].join(" ")); }).map((product) => ({ title: product.translations[locale].name, description: product.translations[locale].shortDescription, to: `${english ? "/en/shop/" : "/boutique/"}${product.slug}`, kind: english ? "Coffee" : "Café" })) : [];
  const articleResults = needle ? articles.filter((article) => matches([article.title[locale], article.excerpt[locale], article.summary[locale]].join(" "))).map((article) => ({ title: article.title[locale], description: article.excerpt[locale], to: `${english ? "/en/blog/" : "/blog/"}${article.slug}`, kind: "Blog" })) : [];
  const pages = [{ title: english ? "The coffee shop" : "La boutique café", description: english ? "All our coffees" : "Tous nos cafés", to: english ? "/en/shop" : "/boutique" }, { title: english ? "Our approach" : "Notre approche", description: english ? "The Zen Coffee Lab story" : "L’histoire de Zen Coffee Lab", to: english ? "/en/about-us" : "/a-propos" }, { title: english ? "Professionals" : "Professionnels", description: english ? "Coffee for your business" : "Du café pour votre activité", to: english ? "/en/professional" : "/professionnel" }, { title: "Contact", description: english ? "Write to the roastery" : "Écrire à la torréfaction", to: english ? "/en/contact" : "/contact" }];
  const pageResults = needle ? pages.filter((page) => matches(`${page.title} ${page.description}`)).map((page) => ({ ...page, kind: "Page" })) : [];
  return { locale, query, results: [...productResults, ...articleResults, ...pageResults] };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Search | Zen Coffee Lab" : "Recherche | Zen Coffee Lab", data?.locale === "en-GB" ? "Search the Zen Coffee Lab website." : "Rechercher sur le site Zen Coffee Lab.", data?.locale === "en-GB" ? "/en/search" : "/recherche");

export default function SearchPage() {
  const { locale, query, results } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  return <><header className="page-hero"><p className="eyebrow">Zen Coffee Lab</p><h1>{english ? "Search" : "Recherche"}</h1></header><section className="page-shell section site-search"><Form method="get" role="search" className="site-search__form"><label htmlFor="site-search-query">{english ? "Search the site" : "Rechercher sur le site"}</label><div><input id="site-search-query" name="q" type="search" defaultValue={query} autoFocus placeholder={english ? "Coffee, article, page…" : "Café, article, page…"} /><button className="button button--dark" type="submit"><Search aria-hidden="true" />{english ? "Search" : "Rechercher"}</button></div></Form>{query ? <div className="site-search__results"><p className="eyebrow">{results.length} {english ? (results.length === 1 ? "result" : "results") : (results.length === 1 ? "résultat" : "résultats")}</p>{results.length ? results.map((result) => <Link className="site-search__result" to={result.to} key={result.to}><small>{result.kind}</small><h2>{result.title}</h2><p>{result.description}</p></Link>) : <p>{english ? "No result found." : "Aucun résultat trouvé."}</p>}</div> : <p className="site-search__hint">{english ? "Search among coffees, articles and site pages." : "Recherchez parmi les cafés, les articles et les pages du site."}</p>}</section></>;
}
