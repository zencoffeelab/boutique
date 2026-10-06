import { env } from "./env.server";

type CaptchaPayload = FormData | Record<string, unknown>;
type CaptchaAction = "contact";
type RateLimitAction = CaptchaAction | "professional-contact";

const SMS_GATEWAY_DOMAINS = new Set([
  "vtext.com",
  "txt.att.net",
  "tmomail.net",
  "messaging.sprintpcs.com",
  "email.uscc.net",
]);

const CONTACT_SPAM_TERMS = /\b(buy now|seo service|guest post|backlinks?|crypto(?:currency)?|bitcoin|casino|viagra|loan approval|traffic to your website|rank your website)\b/i;
const PRICE_PROBE_TERMS = /(?:price|prix|preis|präis|precio|preu|prezo|prezzo|pris|pretium|verð|phraghas|kumukūʻai|գինը|ფასი|giá|прайс|cijenu|cenu|çmimin|cmimin|τιμή|qiymətinizi|árát|harga|cenata|цената|intengo|prezio|ọnụahịa|মূল্য)/iu;
const PRODUCT_CONTEXT_TERMS = /(?:café|coffee|commande|order|produit|product)/i;

/**
 * Public forms need a second, server-side filter after Turnstile. It catches
 * known SMS gateways and the common unsolicited commercial messages that can
 * still pass a CAPTCHA, without sending any email to their supplied address.
 */
export function isLikelySpamContact(input: {
  email: string;
  message: string;
}) {
  const [localPart = "", domain = ""] = input.email.trim().toLowerCase().split("@");
  const links = (input.message.match(/https?:\/\//gi) ?? []).length;
  const priceProbe = input.message.trim().length <= 160
    && links === 0
    && PRICE_PROBE_TERMS.test(input.message)
    && !PRODUCT_CONTEXT_TERMS.test(input.message);
  return SMS_GATEWAY_DOMAINS.has(domain)
    || /^\d{7,}$/.test(localPart)
    || CONTACT_SPAM_TERMS.test(input.message)
    || links > 2
    || priceProbe;
}

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

async function verifyTurnstile(secret: string, response: string, remoteip: string) {
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response, ...(remoteip ? { remoteip } : {}) }),
  });
  if (!result.ok) return null;
  return await result.json() as { success?: boolean; action?: string; hostname?: string };
}

async function withinRateLimit(request: Request, action: RateLimitAction) {
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

/**
 * Professional requests are only available to approved, authenticated accounts.
 * They do not need public CAPTCHA widgets, but still receive the same IP-based
 * throttling as public forms.
 */
export function withinProfessionalContactRateLimit(request: Request) {
  return withinRateLimit(request, "professional-contact");
}

export async function verifyPublicCaptcha(request: Request, payload: CaptchaPayload, expectedAction: CaptchaAction) {
  if (env().NODE_ENV === "test") return true;
  const config = env();
  const turnstileResponse = valueOf(payload, "cf-turnstile-response");
  if (!config.TURNSTILE_SECRET_KEY) return config.NODE_ENV !== "production";
  const hosts = expectedHostnames(config.TURNSTILE_HOSTNAMES);
  if (hosts.size === 0 || !turnstileResponse) return false;
  try {
    const turnstile = await verifyTurnstile(config.TURNSTILE_SECRET_KEY, turnstileResponse, clientIp(request));
    const host = (turnstile?.hostname ?? "").toLowerCase();
    if (!turnstile?.success || turnstile.action !== expectedAction || !hosts.has(host)) return false;
    return withinRateLimit(request, expectedAction);
  } catch (cause) {
    console.error("public_captcha_verification_failed", { message: cause instanceof Error ? cause.message : String(cause) });
    return false;
  }
}

export function captchaRejected(locale: "fr-FR" | "en-GB") {
  return Response.json({
    ok: false,
    message: locale === "en-GB" ? "Please complete the anti-spam check and try again." : "Veuillez valider le contr\u00f4le anti-spam puis r\u00e9essayer.",
  }, { status: 403 });
}
