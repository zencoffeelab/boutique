import type { LoaderFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";

const assets = new Set([
  "logo-black.svg",
  "migra-regular.woff2",
  "migra-bold.woff2",
  "decalotype-regular.woff2",
  "decalotype-bold.woff2",
]);

export async function loader({ params }: LoaderFunctionArgs) {
  const asset = params.asset;
  if (!asset || !assets.has(asset)) throw new Response("Media not found", { status: 404 });

  const supabaseUrl = env().VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Response("Media storage is not configured", { status: 503 });

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-media/brand/${encodeURIComponent(asset)}`;
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
      Location: publicUrl,
    },
  });
}
