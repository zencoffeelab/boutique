import type { LoaderFunctionArgs } from "react-router";

const brandStorageUrl = "https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/brand";

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

  const publicUrl = `${brandStorageUrl}/${encodeURIComponent(asset)}`;
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
      Location: publicUrl,
    },
  });
}
