import type { ActionFunctionArgs } from "react-router";
import { checkoutSchema } from "~/domain/schemas";
import { getViewer } from "~/lib/auth.server";
import { createCheckout } from "~/services/checkout.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid checkout request.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  const viewer = await getViewer(request); const audience = viewer?.profile?.professional_status === "approved" ? "professional" : "retail";
  try { return Response.json(await createCheckout({ cartId: parsed.data.cartId, shippingRateId: parsed.data.shippingRateId, audience, profileId: viewer?.user.id }), { headers: { "cache-control": "no-store" } }); }
  catch (cause) { if (cause instanceof Response) return Response.json({ ok: false, message: await cause.text() }, { status: cause.status }); console.error("checkout_creation_failed", { message: cause instanceof Error ? cause.message : String(cause) }); return Response.json({ ok: false, message: "Secure checkout is temporarily unavailable." }, { status: 503 }); }
}
