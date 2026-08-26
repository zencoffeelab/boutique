import type { ActionFunctionArgs } from "react-router";
import { pickupPointSearchSchema } from "~/domain/schemas";
import { searchPickupPoints } from "~/services/pickup-points.server";
import { captchaRejected, verifyPublicCaptcha } from "~/lib/antispam.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const raw = await request.json().catch(() => null);
  const locale = raw && typeof raw === "object" && (raw as Record<string, unknown>).locale === "en-GB" ? "en-GB" : "fr-FR";
  if (!(await verifyPublicCaptcha(request, raw && typeof raw === "object" ? raw as Record<string, unknown> : {}))) return captchaRejected(locale);
  const parsed = pickupPointSearchSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid pickup-point search." }, { status: 422 });
  try {
    const points = await searchPickupPoints(parsed.data);
    return Response.json({ ok: true, points }, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    console.error("pickup_point_search_failed", { message: cause instanceof Error ? cause.message : String(cause) });
    return Response.json({ ok: false, message: parsed.data.locale === "fr-FR" ? "La recherche de points relais est temporairement indisponible." : "Pickup-point search is temporarily unavailable." }, { status: 503 });
  }
}
