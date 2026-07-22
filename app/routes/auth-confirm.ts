import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { createRequestSupabase } from "~/lib/supabase.server";

const otpType = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url); const supabase = createRequestSupabase(request); if (!supabase) return new Response("Authentication unavailable.", { status: 503 });
  const requestedNext = url.searchParams.get("next") ?? "/mon-compte"; const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/mon-compte";
  const code = url.searchParams.get("code"); const tokenHash = url.searchParams.get("token_hash"); const type = otpType.safeParse(url.searchParams.get("type"));
  const result = code ? await supabase.client.auth.exchangeCodeForSession(code) : tokenHash && type.success ? await supabase.client.auth.verifyOtp({ token_hash: tokenHash, type: type.data }) : { error: new Error("Invalid confirmation link.") };
  if (result.error) return redirect(`${next.split("?")[0]}?auth_error=${encodeURIComponent(result.error.message)}`, { headers: supabase.responseHeaders });
  return redirect(next, { headers: supabase.responseHeaders });
}
