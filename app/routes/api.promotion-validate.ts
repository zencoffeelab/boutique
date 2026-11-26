import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { resolvePromotion } from "~/services/promotions.server";

const schema = z.object({ code: z.string().trim().max(40), subtotalCents: z.coerce.number().int().nonnegative().max(1_000_000) });
export async function action({ request }: ActionFunctionArgs) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid promotion code." }, { status: 422 });
  try { const promotion = await resolvePromotion(parsed.data.code, parsed.data.subtotalCents); return Response.json({ ok: true, ...promotion }); }
  catch (cause) { return Response.json({ ok: false, message: cause instanceof Response ? await cause.text() : "Promotion unavailable." }, { status: cause instanceof Response ? cause.status : 503 }); }
}
