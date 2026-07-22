import type { ActionFunctionArgs } from "react-router";
import { pickupPointSearchSchema } from "~/domain/schemas";
import { searchPickupPoints } from "~/services/pickup-points.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const parsed = pickupPointSearchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid pickup-point search." }, { status: 422 });
  try {
    const points = await searchPickupPoints(parsed.data);
    return Response.json({ ok: true, points }, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    console.error("pickup_point_search_failed", { message: cause instanceof Error ? cause.message : String(cause) });
    return Response.json({ ok: false, message: parsed.data.locale === "fr-FR" ? "La recherche de points relais est temporairement indisponible." : "Pickup-point search is temporarily unavailable." }, { status: 503 });
  }
}
