import { env } from "~/lib/env.server";

type PayPalResponse = { id?: string; status?: string; links?: { href: string; rel: string }[]; purchase_units?: { payments?: { captures?: { id?: string; status?: string; amount?: { value?: string; currency_code?: string } }[] } }[] };

function baseUrl() {
  return env().PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalConfigured() {
  const config = env();
  return Boolean(config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET);
}

async function accessToken() {
  const config = env();
  if (!paypalConfigured()) throw new Error("PayPal is not configured.");
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("PayPal did not return an access token.");
  return data.access_token;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`PayPal request failed (${response.status}).`);
  return await response.json() as T;
}

export async function createPayPalOrder(input: { orderId: string; locale: "fr-FR" | "en-GB"; returnUrl: string; cancelUrl: string; lines: { productName: string; variantLabel: string; quantity: number; unitPriceCents: number }[]; shippingCents: number; totalCents: number }) {
  const items = input.lines.map((line) => ({ name: `${line.productName} – ${line.variantLabel}`.slice(0, 127), quantity: String(line.quantity), unit_amount: { currency_code: "EUR", value: (line.unitPriceCents / 100).toFixed(2) }, category: "PHYSICAL_GOODS" }));
  return request<PayPalResponse>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `zcl-${input.orderId}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: "default",
        custom_id: input.orderId,
        amount: {
          currency_code: "EUR",
          value: (input.totalCents / 100).toFixed(2),
          breakdown: {
            item_total: { currency_code: "EUR", value: (input.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0) / 100).toFixed(2) },
            shipping: { currency_code: "EUR", value: (input.shippingCents / 100).toFixed(2) },
          },
        },
        items,
      }],
      application_context: {
        brand_name: "Zen Coffee Lab",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        locale: input.locale === "fr-FR" ? "fr-FR" : "en-GB",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });
}

export async function capturePayPalOrder(orderId: string) {
  return request<PayPalResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: "{}", headers: { "PayPal-Request-Id": `zcl-capture-${orderId}` } });
}
