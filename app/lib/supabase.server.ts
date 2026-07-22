import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.server";

function parseCookies(header: string | null): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return [];
    return [{ name: part.slice(0, separator).trim(), value: decodeURIComponent(part.slice(separator + 1).trim()) }];
  });
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.maxAge !== undefined) segments.push(`Max-Age=${options.maxAge}`);
  if (options.domain) segments.push(`Domain=${options.domain}`);
  if (options.sameSite) segments.push(`SameSite=${String(options.sameSite)}`);
  if (options.secure) segments.push("Secure");
  if (options.httpOnly) segments.push("HttpOnly");
  return segments.join("; ");
}

export function createRequestSupabase(request: Request) {
  const config = env();
  if (!config.VITE_SUPABASE_URL || !config.VITE_SUPABASE_ANON_KEY) return null;
  const responseHeaders = new Headers();
  const requestCookies = parseCookies(request.headers.get("cookie"));
  const client = createServerClient(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => requestCookies,
      setAll: (cookies) => {
        for (const cookie of cookies) {
          responseHeaders.append("Set-Cookie", serializeCookie(cookie.name, cookie.value, { ...cookie.options, path: "/", sameSite: "lax", secure: config.NODE_ENV === "production", httpOnly: true }));
        }
      },
    },
  });
  return { client, responseHeaders };
}

export function createServiceSupabase() {
  const config = env();
  if (!config.VITE_SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(config.VITE_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
