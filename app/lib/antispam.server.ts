import { env } from "./env.server";

type CaptchaPayload = FormData | Record<string, unknown>;

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

async function verify(url: string, secret: string, response: string, remoteip: string) {
  const result = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response, ...(remoteip ? { remoteip } : {}) }),
  });
  if (!result.ok) return false;
  const json = await result.json() as { success?: boolean };
  return json.success === true;
}

export async function verifyPublicCaptcha(request: Request, payload: CaptchaPayload) {
  if (env().NODE_ENV === "test") return true;
  const config = env();
  const recaptchaResponse = valueOf(payload, "g-recaptcha-response");
  const turnstileResponse = valueOf(payload, "cf-turnstile-response");
  if (!config.RECAPTCHA_SECRET_KEY || !config.TURNSTILE_SECRET_KEY) return config.NODE_ENV !== "production";
  if (!recaptchaResponse || !turnstileResponse) return false;
  const remoteip = clientIp(request);
  try {
    const [recaptcha, turnstile] = await Promise.all([
      verify("https://www.google.com/recaptcha/api/siteverify", config.RECAPTCHA_SECRET_KEY, recaptchaResponse, remoteip),
      verify("https://challenges.cloudflare.com/turnstile/v0/siteverify", config.TURNSTILE_SECRET_KEY, turnstileResponse, remoteip),
    ]);
    return recaptcha && turnstile;
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
