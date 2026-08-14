import { createRequestHandler } from "react-router";
import {
  PUBLIC_MEDIA_CACHE_SECONDS,
  PUBLIC_MEDIA_ROUTE_PREFIX,
  publicMediaOriginUrl,
} from "../app/lib/public-media";

interface CloudflareRuntimeEnv {
  VITE_SITE_URL?: string;
  CRON_SECRET?: string;
}

interface CloudflareRuntimeContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

type CloudflareCacheStorage = CacheStorage & { default: Cache };

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: CloudflareRuntimeEnv;
      ctx: CloudflareRuntimeContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const legacyRedirects = new Map<string, { destination: string; status: 301 | 302 }>([
  ["/rooting-boutique", { destination: "/boutique", status: 301 }],
  ["/faq-page", { destination: "/faq", status: 301 }],
  ["/rooting-conseils", { destination: "/conseils", status: 301 }],
  ["/merci", { destination: "/commande/confirmation", status: 302 }],
  ["/en/shop-2", { destination: "/en/shop", status: 301 }],
]);

async function servePublicMedia(request: Request, url: URL, ctx: CloudflareRuntimeContext) {
  const originUrl = publicMediaOriginUrl(url.pathname);
  if (!originUrl) return new Response("Media not found", { status: 404 });

  const cache = (globalThis.caches as CloudflareCacheStorage).default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  if (request.method === "GET") {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const response = new Response(cached.body, cached);
      response.headers.set("x-zen-media-cache", "HIT");
      return response;
    }
  }

  const upstream = await fetch(originUrl, { method: request.method });
  if (!upstream.ok) {
    return new Response("Media unavailable", {
      status: upstream.status,
      headers: { "cache-control": "public, max-age=60" },
    });
  }

  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  headers.set("cache-control", `public, max-age=${PUBLIC_MEDIA_CACHE_SECONDS}, s-maxage=${PUBLIC_MEDIA_CACHE_SECONDS}, immutable`);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-zen-media-cache", "MISS");
  const response = new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
  if (request.method === "GET") ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, env: CloudflareRuntimeEnv, ctx: CloudflareRuntimeContext) {
    const url = new URL(request.url);
    const legacyRedirect = legacyRedirects.get(url.pathname);

    if (url.protocol !== "https:" || url.hostname === "zencoffeelab.com") {
      url.protocol = "https:";
      if (url.hostname === "zencoffeelab.com") url.hostname = "www.zencoffeelab.com";
      return Response.redirect(url, 301);
    }

    if ((request.method === "GET" || request.method === "HEAD") && legacyRedirect) {
      return Response.redirect(new URL(legacyRedirect.destination, url), legacyRedirect.status);
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith(PUBLIC_MEDIA_ROUTE_PREFIX)) {
      return servePublicMedia(request, url, ctx);
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  async scheduled(_controller: unknown, env: CloudflareRuntimeEnv, ctx: CloudflareRuntimeContext) {
    if (!env.VITE_SITE_URL || !env.CRON_SECRET) {
      console.error("commerce_cron_not_configured");
      return;
    }
    const endpoint = new URL("/api/cron/commerce", env.VITE_SITE_URL);
    ctx.waitUntil(fetch(endpoint, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }).then(async (response) => {
      if (!response.ok) throw new Error(`Commerce cron returned ${response.status}: ${await response.text()}`);
    }));
  },
};
