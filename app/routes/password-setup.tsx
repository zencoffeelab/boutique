import { KeyRound, ShieldCheck } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, data, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { getViewer } from "~/lib/auth.server";
import { getLocale } from "~/lib/i18n";
import { passwordSetupPath } from "~/lib/password-setup";
import { safeInternalPath } from "~/lib/redirects";
import { createRequestSupabase, createServiceSupabase } from "~/lib/supabase.server";
import { captchaRejected, verifyPublicCaptcha } from "~/lib/antispam.server";

const passwordSetupSchema = z.object({
  password: z.string().min(10).max(200),
  passwordConfirmation: z.string().min(10).max(200),
  next: z.string(),
}).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match." });

function paths(request: Request) {
  const locale = getLocale(request);
  const english = locale === "en-GB";
  return {
    locale,
    account: english ? "/en/my-account" : "/mon-compte",
    professional: english ? "/en/professional" : "/professionnel",
    setup: passwordSetupPath(locale),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const routePaths = paths(request);
  const requestUrl = new URL(request.url);
  const requestedNext = safeInternalPath(requestUrl.searchParams.get("next"), routePaths.professional);
  const authError = requestUrl.searchParams.get("auth_error");
  const activationFlow = requestUrl.searchParams.get("activation") === "1";
  const viewer = await getViewer(request);
  if (viewer && !activationFlow) throw redirect(requestedNext, { headers: viewer.responseHeaders });
  return { locale: routePaths.locale, email: "", next: requestedNext, authError };
}

export async function action({ request }: ActionFunctionArgs) {
  const routePaths = paths(request);
  const form = await request.formData();
  if (!(await verifyPublicCaptcha(request, form, "password-setup"))) return captchaRejected(routePaths.locale);
  const parsed = passwordSetupSchema.safeParse(Object.fromEntries(form));
  const english = routePaths.locale === "en-GB";
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path.includes("passwordConfirmation"));
    return { ok: false, message: mismatch ? (english ? "Both passwords must be identical." : "Les deux mots de passe doivent être identiques.") : (english ? "Use at least 10 characters." : "Utilisez au moins 10 caractères.") };
  }
  const next = safeInternalPath(parsed.data.next, routePaths.professional);
  const supabase = createRequestSupabase(request);
  if (!supabase) return { ok: false, message: english ? "Authentication is unavailable." : "L’authentification est indisponible." };
  const { data: authData, error: userError } = await supabase.client.auth.getUser();
  if (userError || !authData.user) throw redirect(`${routePaths.account}?next=${encodeURIComponent(routePaths.setup)}`, { headers: supabase.responseHeaders });
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: english ? "Authentication database is unavailable." : "La base d’authentification est indisponible." };
  const { data: profile, error: profileError } = await client.from("profiles").select("password_setup_required").eq("id", authData.user.id).maybeSingle();
  if (profileError) return { ok: false, message: profileError.message };
  if (!profile?.password_setup_required) throw redirect(next, { headers: supabase.responseHeaders });
  const { error: passwordError } = await supabase.client.auth.updateUser({ password: parsed.data.password });
  if (passwordError) return data({ ok: false, message: passwordError.message }, { headers: supabase.responseHeaders });
  const now = new Date().toISOString();
  const { error: updateError } = await client.from("profiles").update({ password_setup_required: false, updated_at: now }).eq("id", authData.user.id).eq("password_setup_required", true);
  if (updateError) return data({ ok: false, message: english ? "The password was saved, but activation could not be completed. Please try again." : "Le mot de passe a été enregistré, mais l’activation n’a pas pu être finalisée. Réessayez." }, { headers: supabase.responseHeaders });
  await client.from("audit_log").insert({ actor_id: authData.user.id, action: "professional_member.password_initialized", entity_type: "profile", entity_id: authData.user.id, after_data: { completed_at: now } });
  throw redirect(next, { headers: supabase.responseHeaders });
}

export const meta: MetaFunction = () => [
  { title: "Activation du compte | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

export default function PasswordSetup() {
  const { locale, email, next, authError } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const english = locale === "en-GB";
  return <section className="password-setup-page">
    <div className="password-setup-card">
      <div className="password-setup-card__brand" aria-label="Zen Coffee Lab">Z</div>
      <div className="password-setup-card__intro"><p className="eyebrow">{english ? "Account activation" : "Activation du compte"}</p><h1>{english ? "Choose your password" : "Définissez votre mot de passe"}</h1><p>{english ? "This required final step secures your professional access before opening the shop." : "Cette dernière étape obligatoire sécurise votre accès professionnel avant l’ouverture de la boutique."}</p></div>
      <div className="password-setup-card__identity"><ShieldCheck aria-hidden="true" /><span><small>{english ? "Account to activate" : "Compte à activer"}</small><strong>{email}</strong></span></div>
      <Form method="post" className="password-setup-form">
        <input type="hidden" name="next" value={next} />
        {authError ? <p className="form-message form-error" role="alert">{authError}</p> : null}
        {result?.message ? <p className="form-message form-error" role="alert">{result.message}</p> : null}
        <div className="field"><label htmlFor="new-member-password">{english ? "New password" : "Nouveau mot de passe"}<input id="new-member-password" name="password" type="password" minLength={10} maxLength={200} required autoComplete="new-password" autoFocus /><small>{english ? "At least 10 characters." : "10 caractères minimum."}</small></label></div>
        <div className="field"><label htmlFor="new-member-password-confirmation">{english ? "Confirm password" : "Confirmez le mot de passe"}<input id="new-member-password-confirmation" name="passwordConfirmation" type="password" minLength={10} maxLength={200} required autoComplete="new-password" /></label></div>
        <button className="button button--dark" type="submit"><KeyRound aria-hidden="true" />{english ? "Activate my account" : "Activer mon compte"}</button>
      </Form>
      <p className="password-setup-card__notice">{english ? "You will not be able to continue while this step is incomplete." : "Vous ne pourrez pas poursuivre la navigation tant que cette étape n’est pas terminée."}</p>
    </div>
  </section>;
}
