import type { LoaderFunctionArgs } from "react-router";

const wordpressMedia = "https://www.zencoffeelab.com/wp-content/uploads/2026/03";

const assets: Record<string, { filename: string; contentType: string }> = {
  "logo-black.svg": { filename: "zen-coffee-lab-logo-black.svg", contentType: "image/svg+xml" },
  "migra-regular.woff2": { filename: "Migra-Regular.woff2", contentType: "font/woff2" },
  "migra-bold.woff2": { filename: "Migra-Bold.woff2", contentType: "font/woff2" },
  "decalotype-regular.woff2": { filename: "Decalotype-Regular.woff2", contentType: "font/woff2" },
  "decalotype-bold.woff2": { filename: "Decalotype-Bold.woff2", contentType: "font/woff2" },
};

export async function loader({ params }: LoaderFunctionArgs) {
  const asset = params.asset ? assets[params.asset] : undefined;
  if (!asset) throw new Response("Media not found", { status: 404 });

  const upstream = await fetch(`${wordpressMedia}/${asset.filename}`, {
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
