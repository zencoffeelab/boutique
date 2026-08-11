import type { ActionFunctionArgs } from "react-router";
import { checkoutSchema } from "~/domain/schemas";
import { getViewer } from "~/lib/auth.server";
import { authConfirmationUrl, createRequestSupabase } from "~/lib/supabase.server";
import { createCheckout } from "~/services/checkout.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid checkout request.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  const viewer = await getViewer(request); const audience = viewer?.profile?.professional_status === "approved" ? "professional" : "retail";
  let profileId = viewer?.user.id;
  const responseHeaders = new Headers({ "cache-control": "no-store" });
  if (!viewer && parsed.data.createAccount) {
    const supabase = createRequestSupabase(request);
    if (!supabase) return Response.json({ ok: false, message: parsed.data.locale === "en-GB" ? "Account creation is temporarily unavailable." : "La création de compte est temporairement indisponible." }, { status: 503 });
    const accountPath = parsed.data.locale === "en-GB" ? "/en/my-account" : "/mon-compte";
    const { data, error } = await supabase.client.auth.signUp({
      email: parsed.data.address.email,
      password: parsed.data.accountPassword!,
      options: {
        data: { first_name: parsed.data.address.firstName, last_name: parsed.data.address.lastName, phone: parsed.data.address.phone, signup_source: "checkout", welcome_drawer_pending: true },
        emailRedirectTo: authConfirmationUrl(request, accountPath),
      },
    });
    if (error) {
      console.error("checkout_account_signup_failed", { message: error.message, code: error.code, status: error.status });
      return Response.json({ ok: false, message: parsed.data.locale === "en-GB" ? "Account creation is temporarily unavailable. Please try again shortly." : "La création de compte est temporairement indisponible. Réessayez dans quelques instants." }, { status: 503 });
    }
    if (!data.user || data.user.identities?.length === 0) {
      return Response.json({ ok: false, message: parsed.data.locale === "en-GB" ? "An account already exists for this email. Sign in from My account before ordering." : "Un compte existe déjà pour cet e-mail. Connectez-vous depuis Mon compte avant de commander." }, { status: 409 });
    }
    profileId = data.user.id;
    for (const [key, value] of supabase.responseHeaders) responseHeaders.append(key, value);
  }
  try { return Response.json(await createCheckout({ cartId: parsed.data.cartId, shippingRateId: parsed.data.shippingRateId, lines: parsed.data.lines, paymentMethod: parsed.data.paymentMethod, audience, profileId }), { headers: responseHeaders }); }
  catch (cause) { if (cause instanceof Response) return Response.json({ ok: false, message: await cause.text() }, { status: cause.status }); console.error("checkout_creation_failed", { message: cause instanceof Error ? cause.message : String(cause) }); return Response.json({ ok: false, message: "Secure checkout is temporarily unavailable." }, { status: 503 }); }
}
