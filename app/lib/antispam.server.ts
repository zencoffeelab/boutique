import { env } from "./env.server";

type CaptchaPayload = FormData | Record<string, unknown>;
type CaptchaAction = "contact";

function valueOf(payload: CaptchaPayload, key: string) {
  if (payload instanceof FormData) return String(payload.get(key) ?? "").trim();
  return typeof payload[key] === "string" ? payload[key].trim() : "";
}

function clientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? request.headers.get("X-Real-IP")
    ?? "";
}

function expectedHostnames(value: string | undefined) {
  return new Set((value ?? "").split(",").map((hostname) => hostname.trim().toLowerCase()).filter(Boolean));
}

async function verify(url: string, secret: string, response: string, remoteip: string) {
  const result = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response, ...(remoteip ? { remoteip } : {}) }),
  });
  if (!result.ok) return null;
  return await result.json() as { success?: boolean; action?: string; hostname?: string };
}

async function withinRateLimit(request: Request, action: CaptchaAction) {
  const ip = clientIp(request);
  if (!ip) return true;
  const cache = (globalThis as typeof globalThis & { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return true;
  const key = new Request(`https://antispam.invalid/${encodeURIComponent(action)}/${encodeURIComponent(ip)}`);
  const previous = await cache.match(key);
  const count = previous ? Number(await previous.text()) : 0;
  const limit = 3;
  if (!Number.isFinite(count) || count >= limit) return false;
  await cache.put(key, new Response(String(count + 1), { headers: { "cache-control": "max-age=600" } }));
  return true;
}

export async function verifyPublicCaptcha(request: Request, payload: CaptchaPayload, expectedAction: CaptchaAction) {
  if (env().NODE_ENV === "test") return true;
  const config = env();
  const recaptchaResponse = valueOf(payload, "g-recaptcha-response");
  const turnstileResponse = valueOf(payload, "cf-turnstile-response");
  if (!config.RECAPTCHA_SECRET_KEY || !config.TURNSTILE_SECRET_KEY) return config.NODE_ENV !== "production";
  const hosts = expectedHostnames(config.TURNSTILE_HOSTNAMES);
  if (hosts.size === 0) return false;
  if (!recaptchaResponse || !turnstileResponse) return false;
  const remoteip = clientIp(request);
  try {
    const [recaptcha, turnstile] = await Promise.all([
      verify("https://www.google.com/recaptcha/api/siteverify", config.RECAPTCHA_SECRET_KEY, recaptchaResponse, remoteip),
      verify("https://challenges.cloudflare.com/turnstile/v0/siteverify", config.TURNSTILE_SECRET_KEY, turnstileResponse, remoteip),
    ]);
    if (!recaptcha || !turnstile) return false;
    const host = (turnstile.hostname ?? "").toLowerCase();
    const recaptchaHost = (recaptcha.hostname ?? "").toLowerCase();
    if (!recaptcha.success || !turnstile.success || turnstile.action !== expectedAction || !hosts.has(host) || !hosts.has(recaptchaHost)) return false;
    return withinRateLimit(request, expectedAction);
  } catch (cause) {
    console.error("public_captcha_verification_failed", { message: cause instanceof Error ? cause.message : String(cause) });
    return false;
  }
}

export function captchaRejected(locale: "fr-FR" | "en-GB") {
  return Response.json({
    ok: false,
    message: locale === "en-GB" ? "Please complete both anti-spam checks and try again." : "Veuillez valider les deux contrôles anti-spam puis réessayer.",
  }, { status: 403 });
}
