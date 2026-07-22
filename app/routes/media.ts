import type { LoaderFunctionArgs } from "react-router";

const wordpressMedia = "https://www.zencoffeelab.com/wp-content/uploads";

const assets: Record<string, { path: string; contentType: string }> = {
  "logo-black.svg": { path: "2026/03/zen-coffee-lab-logo-black.svg", contentType: "image/svg+xml" },
  "logo-white.svg": { path: "2026/03/zen-coffee-lab-logo-blanc.svg", contentType: "image/svg+xml" },
  "migra-regular.woff2": { path: "2026/03/Migra-Regular.woff2", contentType: "font/woff2" },
  "migra-bold.woff2": { path: "2026/03/Migra-Bold.woff2", contentType: "font/woff2" },
  "decalotype-regular.woff2": { path: "2026/03/Decalotype-Regular.woff2", contentType: "font/woff2" },
  "decalotype-bold.woff2": { path: "2026/03/Decalotype-Bold.woff2", contentType: "font/woff2" },
  "home-hero.jpg": { path: "2026/04/31-scaled.jpg", contentType: "image/jpeg" },
  "shop-banner.jpg": { path: "2026/04/8-1300x650.jpg", contentType: "image/jpeg" },
  "product-adola.jpeg": { path: "2026/05/Adola-P.jpeg", contentType: "image/jpeg" },
  "product-aricha.jpeg": { path: "2026/05/Aricha-P.jpeg", contentType: "image/jpeg" },
  "product-santa-barbara.jpeg": { path: "2026/05/Santa-Barbara-P.jpeg", contentType: "image/jpeg" },
  "product-lorayne.jpeg": { path: "2026/05/Lorayne-P.jpeg", contentType: "image/jpeg" },
  "product-el-laurel.jpeg": { path: "2026/05/El-Laurel-P.jpeg", contentType: "image/jpeg" },
  "product-kaiguri.jpeg": { path: "2026/05/Kaiguri-P.jpeg", contentType: "image/jpeg" },
};

export async function loader({ params }: LoaderFunctionArgs) {
  const asset = params.asset ? assets[params.asset] : undefined;
  if (!asset) throw new Response("Media not found", { status: 404 });

  const upstream = await fetch(`${wordpressMedia}/${asset.path}`, {
    headers: { Accept: asset.contentType },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Response("Source media is temporarily unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
      "Content-Type": asset.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
