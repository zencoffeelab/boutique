import { renderToReadableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";

const privatePathPrefixes = ["/admin", "/api", "/auth", "/commande", "/en/checkout", "/mon-compte", "/en/my-account", "/professionnel", "/en/professional", "/panier", "/en/cart"];

export function htmlCacheControl(request: Request) {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" || request.headers.has("cookie") || privatePathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "private, no-store";
  return "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  let shellRendered = false;
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      signal: request.signal,
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) console.error("ssr_stream_error", error);
      },
    },
  );
  shellRendered = true;
  responseHeaders.set("content-type", "text/html; charset=utf-8");
  if (!responseHeaders.has("cache-control")) responseHeaders.set("cache-control", htmlCacheControl(request));
  responseHeaders.set("x-content-type-options", "nosniff");
  responseHeaders.set("x-frame-options", "DENY");
  responseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
  responseHeaders.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}
