import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { AccountDashboard } from "~/components/account/account-dashboard";
import { getViewer } from "~/lib/auth.server";
import { getLocale } from "~/lib/i18n";
import { safeInternalPath } from "~/lib/redirects";
import { pageMeta } from "~/lib/seo";
import { authConfirmationUrl, clearPasswordRecoveryCookie, createPublicSupabase, createRequestSupabase, createServiceSupabase, readPasswordRecoverySession } from "~/lib/supabase.server";
import { SHIPPING_COUNTRY_CODES } from "~/domain/shipping-countries";
import { professionalApplicationSchema } from "~/domain/schemas";

const addressSchema = z.object({ label: z.string().trim().max(80).default(""), company: z.string().trim().max(120).default(""), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), line1: z.string().trim().min(3).max(160), line2: z.string().trim().max(160).default(""), postalCode: z.string().trim().min(2).max(20), city: z.string().trim().min(1).max(100), countryCode: z.enum(SHIPPING_COUNTRY_CODES), phone: z.string().trim().max(30).default("") });
const mfaVerificationSchema = z.object({ factorId: z.uuid(), code: z.string().trim().regex(/^\d{6}$/), purpose: z.enum(["login", "setup"]).default("login") });
const mfaUnenrollmentSchema = z.object({ factorId: z.uuid() });

export function signupConfirmationMessage(locale: "fr-FR" | "en-GB") {
  return locale === "en-GB"
    ? "An email has been sent to you. Please confirm your email address."
    : "Un mail vous a été envoyé. Veuillez confirmer votre adresse mail.";
}

export function AccountLanguageSwitch({ english }: { english: boolean }) {
  return <Link className="account-language-switch" to={english ? "/mon-compte" : "/en/my-account"}>
    {english ? "Français" : "English"}
  </Link>;
}

function SignInPasswordInput({ english }: { english: boolean }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input"><input id="account-password" name="password" type={visible ? "text" : "password"} minLength={10} required autoComplete="current-password" /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? (english ? "Hide password" : "Masquer le mot de passe") : (english ? "Show password" : "Afficher le mot de passe")} title={visible ? (english ? "Hide password" : "Masquer le mot de passe") : (english ? "Show password" : "Afficher le mot de passe")}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span>;
}

function PasswordResetConfirmation({ english, message }: { english: boolean; message: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (!open) return null;
  return <dialog className="account-password-reset-modal" open aria-labelledby="password-reset-confirmation-title">
    <div className="account-password-reset-modal__card">
      <p className="eyebrow">Zen Coffee Lab</p>
      <h2 id="password-reset-confirmation-title">{english ? "Request confirmed" : "Demande confirmée"}</h2>
      <p>{message}</p>
      <button className="button button--dark" type="button" onClick={() => setOpen(false)}>{english ? "Close" : "Fermer"}</button>
    </div>
  </dialog>;
}

export function accountWelcomeDestination(locale: "fr-FR" | "en-GB") {
  return locale === "en-GB" ? "/en?account=welcome" : "/?account=welcome";
}

export function customerLoginDestination(locale: "fr-FR" | "en-GB", accountPath: string, requestedNext: string, showWelcome: boolean) {
  if (requestedNext !== accountPath) return requestedNext;
  if (showWelcome) return accountWelcomeDestination(locale);
  return locale === "en-GB" ? "/en" : "/";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request); const accountPath = locale === "en-GB" ? "/en/my-account" : "/mon-compte"; const url = new URL(request.url); const passwordRecovery = url.searchParams.get("recover") === "1" && Boolean(readPasswordRecoverySession(request)); const viewer = passwordRecovery ? null : await getViewer(request); const setPassword = url.searchParams.get("set-password") === "1"; const passwordResetComplete = url.searchParams.get("password-reset") === "complete"; const authError = url.searchParams.get("auth_error"); const next = safeInternalPath(url.searchParams.get("next"), accountPath);
  if (!viewer) return { locale, viewer: null, orders: [], addresses: [], professionalApplication: null, setPassword, passwordRecovery, passwordResetComplete, authError, next, mfa: null };
  const publicViewer = { user: { id: viewer.user.id, email: viewer.user.email }, profile: viewer.profile };
  const requestSupabase = createRequestSupabase(request);
  let mfa: { currentLevel: string | null; nextLevel: string | null; verifiedFactors: Array<{ id: string; friendlyName: string; createdAt: string }> } | null = null;
  if (requestSupabase) {
    const [aalResult, factorsResult] = await Promise.all([
      requestSupabase.client.auth.mfa.getAuthenticatorAssuranceLevel(),
      requestSupabase.client.auth.mfa.listFactors(),
    ]);
    mfa = {
      currentLevel: aalResult.data?.currentLevel ?? null,
      nextLevel: aalResult.data?.nextLevel ?? null,
      verifiedFactors: (factorsResult.data?.totp ?? []).map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? "Authenticator", createdAt: factor.created_at })),
    };
    if (mfa.verifiedFactors.length > 0 && mfa.currentLevel !== "aal2") {
      return { locale, viewer: publicViewer, orders: [], addresses: [], professionalApplication: null, setPassword, passwordRecovery, passwordResetComplete, authError, next, mfa };
    }
  }
  const client = createServiceSupabase();
  const [ordersResult, addressesResult, professionalApplicationResult] = await Promise.all([
    client ? client.from("orders").select("id,order_number,status,total_cents,created_at,paid_at,shipments(carrier,tracking_number,tracking_url,status)").eq("profile_id", viewer.user.id).neq("status", "pending_payment").order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    client ? client.from("addresses").select("*").eq("profile_id", viewer.user.id).order("created_at") : Promise.resolve({ data: [] }),
    client && viewer.profile?.professional_status === "approved" ? client.from("professional_applications").select("company_name,country_code,first_name,last_name,email,company_registration_number,vat_number,phone,electronic_billing_address,billing_address,delivery_address,business_type,monthly_volume,comment").eq("invited_user_id", viewer.user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { locale, viewer: publicViewer, orders: ordersResult.data ?? [], addresses: addressesResult.data ?? [], professionalApplication: professionalApplicationResult.data ?? null, setPassword, passwordRecovery, passwordResetComplete, authError, next, mfa };
}

export async function action({ request }: ActionFunctionArgs) {
  const locale = getLocale(request); const accountPath = locale === "en-GB" ? "/en/my-account" : "/mon-compte"; const form = await request.formData(); const intent = String(form.get("intent") ?? "login");
  if (intent === "update_recovery_password") {
    const password = z.string().min(10).max(200).safeParse(form.get("password")); const recovery = readPasswordRecoverySession(request); const client = createPublicSupabase();
    if (!password.success || !recovery || !client) return { ok: false, message: locale === "en-GB" ? "This recovery link is invalid or has expired." : "Ce lien de récupération est invalide ou a expiré." };
    const restored = await client.auth.setSession(recovery); if (restored.error) return { ok: false, message: locale === "en-GB" ? "This recovery link is invalid or has expired." : "Ce lien de récupération est invalide ou a expiré." };
    const { data: { user }, error: userError } = await client.auth.getUser(); const service = createServiceSupabase();
    if (userError || !user || !service) return { ok: false, message: locale === "en-GB" ? "This recovery link is invalid or has expired." : "Ce lien de récupération est invalide ou a expiré." };
    const updated = await service.auth.admin.updateUserById(user.id, { password: password.data }); await client.auth.signOut();
    if (updated.error) return { ok: false, message: updated.error.message };
    return redirect(`${accountPath}?password-reset=complete`, { headers: { "Set-Cookie": clearPasswordRecoveryCookie(new URL(request.url).protocol === "https:") } });
  }
  const supabase = createRequestSupabase(request);
  if (!supabase) return { ok: false, message: locale === "en-GB" ? "Authentication is not configured in this environment." : "L’authentification n’est pas configurée dans cet environnement." };
  if (intent === "update_password") { const parsed = z.string().min(10).max(200).safeParse(form.get("password")); if (!parsed.success) return { ok: false, message: locale === "en-GB" ? "Use at least 10 characters." : "Utilisez au moins 10 caractères." }; const { error } = await supabase.client.auth.updateUser({ password: parsed.data }); if (error) return { ok: false, message: error.message }; await supabase.client.auth.signOut(); return redirect(`${accountPath}?password-reset=complete`, { headers: supabase.responseHeaders }); }
  if (intent === "mfa_enroll" || intent === "mfa_verify" || intent === "mfa_unenroll") {
    const { data: { user } } = await supabase.client.auth.getUser();
    if (!user) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Sign in again before configuring MFA." : "Reconnectez-vous avant de configurer la MFA." };
    if (intent === "mfa_enroll") {
      const listed = await supabase.client.auth.mfa.listFactors();
      if (listed.error) return { ok: false, scope: "mfa" as const, message: listed.error.message };
      if (listed.data.totp.length > 0) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "MFA is already enrolled. Enter a code to continue." : "La MFA est déjà activée. Saisissez un code pour continuer." };
      for (const factor of listed.data.all.filter((candidate) => candidate.factor_type === "totp" && candidate.status === "unverified")) {
        const { error } = await supabase.client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) return { ok: false, scope: "mfa" as const, message: error.message };
      }
      const enrolled = await supabase.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Zen Coffee Lab" });
      if (enrolled.error) return { ok: false, scope: "mfa" as const, message: enrolled.error.message };
      return Response.json({ ok: true, scope: "mfa" as const, message: locale === "en-GB" ? "Scan the QR code, then enter the six-digit code." : "Scannez le QR code, puis saisissez le code à six chiffres.", mfaEnrollment: { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret } }, { headers: supabase.responseHeaders });
    }
    if (intent === "mfa_unenroll") {
      const parsed = mfaUnenrollmentSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "This authentication factor is invalid." : "Ce facteur d’authentification est invalide." };
      const listed = await supabase.client.auth.mfa.listFactors();
      if (listed.error || !listed.data.totp.some((factor) => factor.id === parsed.data.factorId)) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "This authentication factor is unavailable." : "Ce facteur d’authentification est indisponible." };
      const unenrolled = await supabase.client.auth.mfa.unenroll({ factorId: parsed.data.factorId });
      if (unenrolled.error) return Response.json({ ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Verify your authenticator before disabling two-factor authentication." : "Vérifiez votre authentificateur avant de désactiver la double authentification." }, { status: 409, headers: supabase.responseHeaders });
      return Response.json({ ok: true, scope: "mfa" as const, message: locale === "en-GB" ? "Two-factor authentication has been disabled." : "La double authentification a été désactivée." }, { headers: supabase.responseHeaders });
    }
    const parsed = mfaVerificationSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Enter a valid six-digit code." : "Saisissez un code valide à six chiffres." };
    const listed = await supabase.client.auth.mfa.listFactors();
    if (listed.error || !listed.data.all.some((factor) => factor.id === parsed.data.factorId && factor.factor_type === "totp")) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "This authentication factor is unavailable." : "Ce facteur d’authentification est indisponible." };
    const verified = await supabase.client.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
    if (verified.error) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Invalid or expired code." : "Code invalide ou expiré." };
    if (parsed.data.purpose === "setup") {
      return Response.json({ ok: true, scope: "mfa" as const, message: locale === "en-GB" ? "Two-factor authentication is now active." : "La double authentification est maintenant activée." }, { headers: supabase.responseHeaders });
    }
    return redirect(safeInternalPath(form.get("next"), accountPath), { headers: supabase.responseHeaders });
  }
  if (intent === "save_address" || intent === "delete_address") {
    const { data: { user } } = await supabase.client.auth.getUser(); if (!user) return { ok: false, message: "Authentication required." };
    if (intent === "delete_address") { const id = z.uuid().safeParse(form.get("addressId")); if (!id.success) return { ok: false, message: "Invalid address." }; const { error } = await supabase.client.from("addresses").delete().eq("id", id.data).eq("profile_id", user.id); return { ok: !error, message: error?.message ?? (locale === "en-GB" ? "Address deleted." : "Adresse supprimée.") }; }
    const parsed = addressSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return { ok: false, message: locale === "en-GB" ? "Please complete the address." : "Veuillez compléter l’adresse." };
    const { error } = await supabase.client.from("addresses").insert({ profile_id: user.id, label: parsed.data.label, company: parsed.data.company, first_name: parsed.data.firstName, last_name: parsed.data.lastName, line1: parsed.data.line1, line2: parsed.data.line2, postal_code: parsed.data.postalCode, city: parsed.data.city, country_code: parsed.data.countryCode, phone: parsed.data.phone }); return { ok: !error, message: error?.message ?? (locale === "en-GB" ? "Address saved." : "Adresse enregistrée.") };
  }
  if (intent === "update_professional_profile") {
    const { data: { user } } = await supabase.client.auth.getUser();
    if (!user) return { ok: false, message: locale === "en-GB" ? "Authentication required." : "Authentification requise." };
    const client = createServiceSupabase();
    if (!client) return { ok: false, message: locale === "en-GB" ? "The database is unavailable." : "La base de données est indisponible." };
    const { data: profile } = await client.from("profiles").select("professional_status").eq("id", user.id).maybeSingle();
    if (profile?.professional_status !== "approved") return { ok: false, message: locale === "en-GB" ? "Professional access is required." : "Un accès professionnel est requis." };
    const { data: application } = await client.from("professional_applications").select("id,country_code,company_name,company_registration_number,vat_number,business_type,monthly_volume").eq("invited_user_id", user.id).maybeSingle();
    if (!application) return { ok: false, message: locale === "en-GB" ? "Your professional account details could not be found." : "Les informations de votre compte professionnel sont introuvables." };
    const parsed = professionalApplicationSchema.safeParse({ ...Object.fromEntries(form), countryCode: application.country_code, companyName: application.company_name, companyRegistrationNumber: application.company_registration_number, vatNumber: application.vat_number ?? "", businessType: application.business_type, monthlyVolume: application.monthly_volume, locale, privacyConsent: true });
    if (!parsed.success) return { ok: false, message: locale === "en-GB" ? "Please complete the professional account form." : "Veuillez compléter le formulaire du compte professionnel." };
    const email = parsed.data.email.toLowerCase();
    if (email !== (user.email ?? "").toLowerCase()) {
      const { error } = await supabase.client.auth.updateUser({ email });
      if (error) return { ok: false, message: error.message };
    }
    const billingAddress = { line1: parsed.data.billingLine1, postalCode: parsed.data.billingPostalCode, city: parsed.data.billingCity, countryCode: parsed.data.countryCode };
    const deliveryAddress = parsed.data.deliveryLine1 ? { lastName: parsed.data.deliveryLastName, firstName: parsed.data.deliveryFirstName, line1: parsed.data.deliveryLine1, postalCode: parsed.data.deliveryPostalCode, city: parsed.data.deliveryCity, countryCode: parsed.data.countryCode } : null;
    const updatedAt = new Date().toISOString();
    const { error } = await client.from("professional_applications").update({ comment: parsed.data.comment, last_name: parsed.data.lastName, first_name: parsed.data.firstName, email, phone: parsed.data.phone, electronic_billing_address: parsed.data.electronicBillingAddress, billing_address: billingAddress, delivery_address: deliveryAddress, updated_at: updatedAt }).eq("id", application.id);
    if (error) return { ok: false, message: error.message };
    const { error: profileError } = await client.from("profiles").update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName, phone: parsed.data.phone, updated_at: updatedAt }).eq("id", user.id);
    if (profileError) return { ok: false, message: profileError.message };
    const emailChanged = email !== (user.email ?? "").toLowerCase();
    return { ok: true, scope: "professional_profile" as const, confirmationId: crypto.randomUUID(), message: emailChanged ? (locale === "en-GB" ? "Professional details saved. Confirm the email change from your inbox." : "Informations professionnelles enregistrées. Confirmez le changement d’e-mail depuis votre boîte de réception.") : (locale === "en-GB" ? "Professional details saved." : "Informations professionnelles enregistrées.") };
  }
  if (intent === "logout") { await supabase.client.auth.signOut(); return redirect(safeInternalPath(form.get("next"), accountPath), { headers: supabase.responseHeaders }); }
  const email = String(form.get("email") ?? ""); const password = String(form.get("password") ?? "");
  if (intent === "register" && password.length < 10) return { ok: false, message: locale === "en-GB" ? "Use at least 10 characters to create an account." : "Utilisez au moins 10 caractères pour créer un compte." };
  if (intent === "reset") { const next = safeInternalPath(form.get("next"), accountPath); const confirm = authConfirmationUrl(request, `${accountPath}?set-password=1&next=${encodeURIComponent(next)}`); const { error } = await supabase.client.auth.resetPasswordForEmail(email, { redirectTo: confirm }); return data({ ok: !error, scope: "password_reset" as const, message: error?.message ?? (locale === "en-GB" ? "Request confirmed. Check your inbox: the password change link has been sent. Please check your spam folder if necessary." : "Demande confirmée. Consultez votre boîte de réception : le lien de modification du mot de passe a été envoyé. Veuillez vérifier dans vos spams si nécessaire.") }, { headers: supabase.responseHeaders }); }
  const result = intent === "register" ? await supabase.client.auth.signUp({ email, password, options: { data: { signup_source: "account", welcome_drawer_pending: true }, emailRedirectTo: authConfirmationUrl(request, accountPath) } }) : await supabase.client.auth.signInWithPassword({ email, password });
  if (result.error) return { ok: false, message: result.error.message };
  if (intent === "register" && (!result.data.user || result.data.user.identities?.length === 0)) return { ok: false, message: locale === "en-GB" ? "An account already exists for this email. Sign in instead." : "Un compte existe déjà pour cet e-mail. Connectez-vous." };
  if (intent === "register") return data({ ok: true, message: signupConfirmationMessage(locale) }, { headers: supabase.responseHeaders });
  const { data: profile } = result.data.user ? await supabase.client.from("profiles").select("role,professional_status").eq("id", result.data.user.id).maybeSingle() : { data: null };
  const requestedNext = safeInternalPath(form.get("next"), accountPath);
  const firstCustomerLogin = intent === "login" && result.data.user?.user_metadata?.welcome_drawer_pending === true;
  if (firstCustomerLogin) await supabase.client.auth.updateUser({ data: { ...result.data.user?.user_metadata, welcome_drawer_pending: false } });
  const destination = profile?.role === "admin"
    ? (requestedNext === accountPath ? "/admin" : requestedNext)
    : customerLoginDestination(locale, accountPath, requestedNext, firstCustomerLogin);
  return redirect(destination, { headers: supabase.responseHeaders });
}

export function headers() { return { "Cache-Control": "private, no-store" }; }

export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "My account | Zen Coffee Lab" : "Mon compte | Zen Coffee Lab", data?.locale === "en-GB" ? "Orders, invoices, tracking and addresses." : "Commandes, factures, suivis et adresses.", data?.locale === "en-GB" ? "/en/my-account" : "/mon-compte");

function MfaCodeForm({ factorId, next, english }: { factorId: string; next: string; english: boolean }) {
  return <Form method="post" className="mfa-code-form">
    <input type="hidden" name="intent" value="mfa_verify" />
    <input type="hidden" name="purpose" value="login" />
    <input type="hidden" name="factorId" value={factorId} />
    <input type="hidden" name="next" value={next} />
    <div className="field"><label htmlFor="mfa-code">{english ? "Six-digit code" : "Code à six chiffres"}<input id="mfa-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></div>
    <button className="button button--dark" type="submit">{english ? "Verify and continue" : "Vérifier et continuer"}</button>
  </Form>;
}

export function MfaLoginGate({ email, mfa, next, english, message, messageIsError = false }: { email: string; mfa: NonNullable<Awaited<ReturnType<typeof loader>>["mfa"]>; next: string; english: boolean; message?: string; messageIsError?: boolean }) {
  const verifiedFactor = mfa.verifiedFactors[0];
  return <>
    <header className="page-hero admin-login-hero"><p className="eyebrow">{english ? "Secure access" : "Accès sécurisé"}</p><h1>{english ? "Two-factor verification" : "Vérification en deux étapes"}</h1><p className="lede">{english ? "Your credentials are correct. Enter the code from your authenticator to continue." : "Vos identifiants sont corrects. Saisissez le code de votre authentificateur pour continuer."}</p></header>
    <section className="form-card admin-login-card" aria-labelledby="admin-login-title">
      <div className="admin-login-card__heading"><ShieldCheck aria-hidden="true" /><div><p className="eyebrow">{english ? "Protected account" : "Compte protégé"}</p><h2 id="admin-login-title">{english ? "Two-factor authentication" : "Double authentification"}</h2></div></div>
      <div className="form-grid admin-login-credentials" aria-label={english ? "Validated credentials" : "Identifiants validés"}>
        <div className="field field--wide"><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" value={email} readOnly autoComplete="email" /></div>
        <div className="field field--wide"><label htmlFor="admin-password-confirmed">{english ? "Password verified" : "Mot de passe validé"}</label><input id="admin-password-confirmed" type="password" value="admin-password-verified" readOnly tabIndex={-1} autoComplete="off" /></div>
      </div>
      <div className="admin-login-second-factor">
        {message ? <p className={messageIsError ? "form-message form-error" : "form-message"} role="status">{message}</p> : null}
        {verifiedFactor ? <><p>{english ? "Enter the code displayed in your authenticator app. It will only be requested once for this session." : "Saisissez le code affiché dans votre application d’authentification. Il ne sera demandé qu’une seule fois pour cette session."}</p><MfaCodeForm factorId={verifiedFactor.id} next={next} english={english} /></> : null}
      </div>
      <Form method="post" className="admin-login-switch-account"><input type="hidden" name="intent" value="logout" /><button className="button button--ghost" type="submit">{english ? "Use another account" : "Utiliser un autre compte"}</button></Form>
    </section>
  </>;
}

export { AccountNavigation } from "~/components/account/account-dashboard";

function PasswordRecoveryForm({ english }: { english: boolean }) {
  const [visible, setVisible] = useState(false);
  return <>
    <header className="page-hero account-welcome-hero"><p className="eyebrow">{english ? "Password recovery" : "Réinitialisation du mot de passe"}</p><h1>{english ? "Choose a new password" : "Choisissez un nouveau mot de passe"}</h1><p className="lede">{english ? "Set your new password to sign in to your account." : "Définissez votre nouveau mot de passe pour vous connecter à votre compte."}</p></header>
    <Form method="post" className="form-card" aria-labelledby="password-recovery-title">
      <input type="hidden" name="intent" value="update_recovery_password" />
      <h2 id="password-recovery-title">{english ? "New password" : "Nouveau mot de passe"}</h2>
      <div className="field"><label htmlFor="recovery-password">{english ? "Choose a password" : "Choisissez un mot de passe"}<span className="password-input"><input id="recovery-password" name="password" type={visible ? "text" : "password"} minLength={10} maxLength={200} required autoComplete="new-password" /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? (english ? "Hide password" : "Masquer le mot de passe") : (english ? "Show password" : "Afficher le mot de passe")} title={visible ? (english ? "Hide password" : "Masquer le mot de passe") : (english ? "Show password" : "Afficher le mot de passe")}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span></label><small>{english ? "At least 10 characters." : "10 caractères minimum."}</small></div>
      <button className="button button--dark" type="submit">{english ? "Save my password" : "Enregistrer mon mot de passe"}</button>
    </Form>
  </>;
}

export default function Account() {
  const { locale, viewer, orders, addresses, professionalApplication, setPassword, passwordRecovery, passwordResetComplete, authError, next, mfa } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>(); const english = locale === "en-GB";
  const mfaResult = result && "scope" in result && result.scope === "mfa" ? result : null;
  if (passwordRecovery || (viewer && setPassword)) return <PasswordRecoveryForm english={english} />;
  if (viewer && mfa && mfa.verifiedFactors.length > 0 && mfa.currentLevel !== "aal2") {
    return <MfaLoginGate email={viewer.user.email ?? ""} mfa={mfa} next={next} english={english} message={mfaResult?.message} messageIsError={mfaResult?.ok === false} />;
  }
  if (viewer) {
    return <AccountDashboard data={{ locale, viewer, orders, addresses, professionalApplication, setPassword, next, mfa }} result={result} />;
  }
  return <>
    <header className="page-hero account-welcome-hero"><AccountLanguageSwitch english={english} /><p className="eyebrow">{english ? "Private space" : "Espace privé"}</p><h1>{english ? "Your account" : "Votre compte"}</h1><p className="lede">{english ? "Find your orders, invoices, addresses and tracking." : "Retrouvez vos commandes, factures, adresses et suivis."}</p></header>
    <Form method="post" className="form-card"><input type="hidden" name="next" value={next} /><h2>{english ? "Sign in" : "Se connecter"}</h2>{passwordResetComplete ? <p className="form-message" role="status">{english ? "Password updated. Sign in with your new password." : "Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe."}</p> : null}{authError ? <p className="form-message form-error" role="alert">{authError}</p> : null}{result?.message && !((result as { scope?: string; ok?: boolean }).scope === "password_reset" && result.ok) ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}<div className="form-grid"><div className="field field--wide"><label htmlFor="account-email">Email</label><input id="account-email" name="email" type="email" required autoComplete="email" /></div><div className="field field--wide"><label htmlFor="account-password">{english ? "Password" : "Mot de passe"}</label><SignInPasswordInput english={english} /></div></div><div className="account-login-actions"><button className="button button--dark" name="intent" value="login" type="submit">{english ? "Sign in" : "Se connecter"}</button><button className="button button--ghost" name="intent" value="register" type="submit">{english ? "Create an account" : "Créer un compte"}</button><button className="button button--ghost" formNoValidate name="intent" value="reset" type="submit">{english ? "Reset password" : "Mot de passe oublié"}</button></div></Form>
    {result && (result as { scope?: string; ok?: boolean }).scope === "password_reset" && result.ok ? <PasswordResetConfirmation english={english} message={result.message} /> : null}
  </>;
}
