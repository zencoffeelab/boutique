import type { LoaderFunctionArgs } from "react-router";
import { publicMediaOriginUrl } from "~/lib/public-media";

export async function loader({ params }: LoaderFunctionArgs) {
  const originUrl = publicMediaOriginUrl(`/media/storage/${params["*"] ?? ""}`);
  if (!originUrl) throw new Response("Media not found", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=300",
      Location: originUrl,
    },
  });
}
