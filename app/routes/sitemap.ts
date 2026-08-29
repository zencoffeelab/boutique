import type { LoaderFunctionArgs } from "react-router";
import { getArticles, getProducts } from "~/lib/catalog.server";

const origin = "https://www.zencoffeelab.com";
const staticPaths = ["", "/boutique", "/archives", "/blog", "/a-propos", "/professionnel", "/faq", "/contact", "/en", "/en/shop", "/en/archives", "/en/blog", "/en/about-us", "/en/professional", "/en/faq", "/en/contact"];
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
export async function loader(_: LoaderFunctionArgs) {
  const [products, articles] = await Promise.all([getProducts(), getArticles()]);
  const entries = [
    ...staticPaths.map((path) => ({ path, lastmod: undefined })),
    ...products.flatMap((product) => [
      { path: `/boutique/${product.slug}`, lastmod: product.publishedAt },
      { path: `/en/shop/${product.slug}`, lastmod: product.publishedAt },
    ]),
    ...articles.flatMap((article) => [
      { path: `/blog/${article.slug}`, lastmod: article.publishedAt },
      { path: `/en/blog/${article.slug}`, lastmod: article.publishedAt },
    ]),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(({ path, lastmod }) => `<url><loc>${escapeXml(`${origin}${path}`)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=UTF-8", "cache-control": "no-store, no-cache, must-revalidate" } });
}
