import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { safeInternalPath } from "~/lib/redirects";
import { createRequestSupabase } from "~/lib/supabase.server";

const otpType = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export function authConfirmationErrorMessage(error: unknown, next: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/PKCE code verifier not found|code verifier|flow_state_(?:not_found|expired)/i.test(message)) {
    return next.startsWith("/en/")
      ? "This confirmation link must be opened in the same browser and on the same device where the request was made. Your email address may already be confirmed: sign in to continue."
      : "Ce lien de confirmation doit être ouvert dans le même navigateur et sur le même appareil que la demande. Votre adresse e-mail est peut-être déjà confirmée : connectez-vous pour continuer.";
  }
  return message;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const supabase = createRequestSupabase(request);
  if (!supabase) return new Response("Authentication unavailable.", { status: 503 });
  const next = safeInternalPath(url.searchParams.get("next"), "/mon-compte");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = otpType.safeParse(url.searchParams.get("type"));

  if (!code && !(tokenHash && type.success)) return { clientRecovery: true, next };

  const result = code
    ? await supabase.client.auth.exchangeCodeForSession(code)
    : await supabase.client.auth.verifyOtp({ token_hash: tokenHash!, type: type.data! });
  if (result.error) {
    return redirect(`${next.split("?")[0]}?auth_error=${encodeURIComponent(authConfirmationErrorMessage(result.error, next))}`, { headers: supabase.responseHeaders });
  }
  return redirect(next, { headers: supabase.responseHeaders });
}

export default function AuthConfirmation() {
  const { clientRecovery, next } = useLoaderData<typeof loader>();
  const [message, setMessage] = useState("Validation du lien en cours…");

  useEffect(() => {
    if (!clientRecovery) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const errorDescription = hash.get("error_description");

    if (errorDescription) {
      setMessage(errorDescription);
      return;
    }
    if (!accessToken || !refreshToken) {
      setMessage("Lien de confirmation invalide ou incomplet.");
      return;
    }

    const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { flowType: "implicit", persistSession: false },
    });
    void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) {
        setMessage(authConfirmationErrorMessage(error, next));
        return;
      }
      window.location.assign(next);
    });
  }, [clientRecovery, next]);

  return <main className="page-shell"><section className="form-card"><p className="eyebrow">Zen Coffee Lab</p><h1>Confirmation</h1><p className="form-message" role="status">{message}</p></section></main>;
}
