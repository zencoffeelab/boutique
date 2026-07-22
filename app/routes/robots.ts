export function loader() {
  return new Response("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: https://www.zencoffeelab.com/sitemap.xml\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=86400" } });
}
