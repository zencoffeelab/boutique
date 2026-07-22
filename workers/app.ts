import { createRequestHandler } from "react-router";

interface CloudflareRuntimeEnv {}

interface CloudflareRuntimeContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

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

export default {
  async fetch(request: Request, env: CloudflareRuntimeEnv, ctx: CloudflareRuntimeContext) {
    const url = new URL(request.url);
    const legacyRedirect = legacyRedirects.get(url.pathname);

    if ((request.method === "GET" || request.method === "HEAD") && legacyRedirect) {
      return Response.redirect(new URL(legacyRedirect.destination, url), legacyRedirect.status);
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
};
