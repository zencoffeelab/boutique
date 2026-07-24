import type { ActionFunctionArgs } from "react-router";
import { shippingQuoteSchema } from "~/domain/schemas";
import { getAudience } from "~/lib/auth.server";
import { createShippingQuote, publicQuote } from "~/services/shipping.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const parsed = shippingQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid shipping details.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  const audience = await getAudience(request);
  if (parsed.data.lines.some((line) => line.audience === "professional") && audience !== "professional") return Response.json({ ok: false, message: "Professional access is required." }, { status: 403 });
  try {
    return Response.json(publicQuote(await createShippingQuote({ ...parsed.data, audience })), { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (cause instanceof Response) {
      const reason = await cause.text().catch(() => "");
      console.warn("shipping_quote_rejected", { status: cause.status, reason });
      const message = parsed.data.locale === "fr-FR"
        ? "Le stock d’un produit de votre panier a changé. Retournez au panier pour ajuster la quantité ou retirer le produit indisponible."
        : "The stock for an item in your cart has changed. Return to your cart to adjust the quantity or remove the unavailable item.";
      return Response.json({ ok: false, message }, { status: cause.status });
    }
    console.error("shipping_quote_failed", { message: cause instanceof Error ? cause.message : String(cause) });
    return Response.json({ ok: false, message: parsed.data.locale === "fr-FR" ? "Les tarifs transporteur sont temporairement indisponibles. Réessayez ou contactez Zen Coffee Lab." : "Carrier rates are temporarily unavailable. Please retry or contact Zen Coffee Lab." }, { status: 503 });
  }
}
