import type { LoaderFunctionArgs } from "react-router";
import { getArticles, getProducts } from "~/lib/catalog.server";

const origin = "https://www.zencoffeelab.com";
const staticPaths = ["", "/boutique", "/archives", "/conseils", "/a-propos", "/professionnel", "/faq", "/contact", "/en", "/en/shop", "/en/archives", "/en/tips", "/en/about-us", "/en/professional", "/en/faq", "/en/contact"];
export async function loader(_: LoaderFunctionArgs) {
  const [products, articles] = await Promise.all([getProducts(), getArticles()]);
  const paths = [...staticPaths, ...products.flatMap((product) => [`/boutique/${product.slug}`, `/en/shop/${product.slug}`]), ...articles.flatMap((article) => [`/conseils/${article.slug}`, `/en/tips/${article.slug}`])];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600" } });
}
