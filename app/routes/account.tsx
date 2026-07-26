import { ChevronRight, MapPin, Package, ShieldCheck, ShoppingBag, UserRound } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { formatMoney } from "~/domain/money";
import { getViewer } from "~/lib/auth.server";
import { getLocale } from "~/lib/i18n";
import { safeInternalPath } from "~/lib/redirects";
import { pageMeta } from "~/lib/seo";
import { createRequestSupabase, createServiceSupabase } from "~/lib/supabase.server";

const addressSchema = z.object({ label: z.string().trim().max(80).default(""), company: z.string().trim().max(120).default(""), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), line1: z.string().trim().min(3).max(160), line2: z.string().trim().max(160).default(""), postalCode: z.string().trim().min(2).max(20), city: z.string().trim().min(1).max(100), countryCode: z.string().trim().regex(/^[A-Z]{2}$/), phone: z.string().trim().max(30).default("") });
const mfaVerificationSchema = z.object({ factorId: z.uuid(), code: z.string().trim().regex(/^\d{6}$/) });

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request); const accountPath = locale === "en-GB" ? "/en/my-account" : "/mon-compte"; const viewer = await getViewer(request); const url = new URL(request.url); const setPassword = url.searchParams.get("set-password") === "1"; const authError = url.searchParams.get("auth_error"); const next = safeInternalPath(url.searchParams.get("next"), accountPath);
  if (!viewer) return { locale, viewer: null, orders: [], addresses: [], setPassword, authError, next, mfa: null };
  const client = createServiceSupabase();
  const requestSupabase = viewer.profile?.role === "admin" ? createRequestSupabase(request) : null;
  const [ordersResult, addressesResult, aalResult, factorsResult] = await Promise.all([
    client ? client.from("orders").select("id,order_number,status,total_cents,created_at,paid_at,shipments(carrier,tracking_number,tracking_url,status)").eq("profile_id", viewer.user.id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    client ? client.from("addresses").select("*").eq("profile_id", viewer.user.id).order("created_at") : Promise.resolve({ data: [] }),
    requestSupabase ? requestSupabase.client.auth.mfa.getAuthenticatorAssuranceLevel() : Promise.resolve({ data: null }),
    requestSupabase ? requestSupabase.client.auth.mfa.listFactors() : Promise.resolve({ data: null }),
  ]);
  const mfa = viewer.profile?.role === "admin" ? {
    currentLevel: aalResult.data?.currentLevel ?? null,
    nextLevel: aalResult.data?.nextLevel ?? null,
    verifiedFactors: (factorsResult.data?.totp ?? []).map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? "Authenticator", createdAt: factor.created_at })),
  } : null;
  return { locale, viewer: { user: { id: viewer.user.id, email: viewer.user.email }, profile: viewer.profile }, orders: ordersResult.data ?? [], addresses: addressesResult.data ?? [], setPassword, authError, next, mfa };
}

export async function action({ request }: ActionFunctionArgs) {
  const locale = getLocale(request); const accountPath = locale === "en-GB" ? "/en/my-account" : "/mon-compte"; const form = await request.formData(); const intent = String(form.get("intent") ?? "login");
  const supabase = createRequestSupabase(request);
  if (!supabase) return { ok: false, message: locale === "en-GB" ? "Authentication is not configured in this environment." : "L’authentification n’est pas configurée dans cet environnement." };
  if (intent === "update_password") { const parsed = z.string().min(10).max(200).safeParse(form.get("password")); if (!parsed.success) return { ok: false, message: locale === "en-GB" ? "Use at least 10 characters." : "Utilisez au moins 10 caractères." }; const { error } = await supabase.client.auth.updateUser({ password: parsed.data }); if (error) return { ok: false, message: error.message }; return redirect(safeInternalPath(form.get("next"), accountPath), { headers: supabase.responseHeaders }); }
  if (intent === "mfa_enroll" || intent === "mfa_verify") {
    const { data: { user } } = await supabase.client.auth.getUser();
    if (!user) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Sign in again before configuring MFA." : "Reconnectez-vous avant de configurer la MFA." };
    const { data: profile } = await supabase.client.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Administrator access required." : "Accès administrateur requis." };
    if (intent === "mfa_enroll") {
      const listed = await supabase.client.auth.mfa.listFactors();
      if (listed.error) return { ok: false, scope: "mfa" as const, message: listed.error.message };
      if (listed.data.totp.length > 0) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "MFA is already enrolled. Enter a code to continue." : "La MFA est déjà activée. Saisissez un code pour continuer." };
      for (const factor of listed.data.all.filter((candidate) => candidate.factor_type === "totp" && candidate.status === "unverified")) {
        const { error } = await supabase.client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) return { ok: false, scope: "mfa" as const, message: error.message };
      }
      const enrolled = await supabase.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Zen Coffee Lab Admin" });
      if (enrolled.error) return { ok: false, scope: "mfa" as const, message: enrolled.error.message };
      return { ok: true, scope: "mfa" as const, message: locale === "en-GB" ? "Scan the QR code, then enter the six-digit code." : "Scannez le QR code, puis saisissez le code à six chiffres.", mfaEnrollment: { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret } };
    }
    const parsed = mfaVerificationSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Enter a valid six-digit code." : "Saisissez un code valide à six chiffres." };
    const listed = await supabase.client.auth.mfa.listFactors();
    if (listed.error || !listed.data.all.some((factor) => factor.id === parsed.data.factorId && factor.factor_type === "totp")) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "This authentication factor is unavailable." : "Ce facteur d’authentification est indisponible." };
    const verified = await supabase.client.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
    if (verified.error) return { ok: false, scope: "mfa" as const, message: locale === "en-GB" ? "Invalid or expired code." : "Code invalide ou expiré." };
    return redirect(safeInternalPath(form.get("next"), "/admin"), { headers: supabase.responseHeaders });
  }
  if (intent === "save_address" || intent === "delete_address") {
    const { data: { user } } = await supabase.client.auth.getUser(); if (!user) return { ok: false, message: "Authentication required." };
    if (intent === "delete_address") { const id = z.uuid().safeParse(form.get("addressId")); if (!id.success) return { ok: false, message: "Invalid address." }; const { error } = await supabase.client.from("addresses").delete().eq("id", id.data).eq("profile_id", user.id); return { ok: !error, message: error?.message ?? (locale === "en-GB" ? "Address deleted." : "Adresse supprimée.") }; }
    const parsed = addressSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return { ok: false, message: locale === "en-GB" ? "Please complete the address." : "Veuillez compléter l’adresse." };
    const { error } = await supabase.client.from("addresses").insert({ profile_id: user.id, label: parsed.data.label, company: parsed.data.company, first_name: parsed.data.firstName, last_name: parsed.data.lastName, line1: parsed.data.line1, line2: parsed.data.line2, postal_code: parsed.data.postalCode, city: parsed.data.city, country_code: parsed.data.countryCode, phone: parsed.data.phone }); return { ok: !error, message: error?.message ?? (locale === "en-GB" ? "Address saved." : "Adresse enregistrée.") };
  }
  if (intent === "logout") { await supabase.client.auth.signOut(); return redirect(accountPath, { headers: supabase.responseHeaders }); }
  const email = String(form.get("email") ?? ""); const password = String(form.get("password") ?? "");
  if (intent === "register" && password.length < 10) return { ok: false, message: locale === "en-GB" ? "Use at least 10 characters to create an account." : "Utilisez au moins 10 caractères pour créer un compte." };
  if (intent === "reset") { const next = safeInternalPath(form.get("next"), accountPath); const confirm = `${new URL(request.url).origin}/auth/confirm?next=${encodeURIComponent(`${accountPath}?set-password=1&next=${encodeURIComponent(next)}`)}`; const { error } = await supabase.client.auth.resetPasswordForEmail(email, { redirectTo: confirm }); return { ok: !error, message: error?.message ?? (locale === "en-GB" ? "Reset email sent." : "E-mail de réinitialisation envoyé.") }; }
  const result = intent === "register" ? await supabase.client.auth.signUp({ email, password, options: { data: { signup_source: "account" }, emailRedirectTo: `${new URL(request.url).origin}/auth/confirm?next=${encodeURIComponent(accountPath)}` } }) : await supabase.client.auth.signInWithPassword({ email, password });
  if (result.error) return { ok: false, message: result.error.message };
  const { data: profile } = result.data.user ? await supabase.client.from("profiles").select("role,professional_status").eq("id", result.data.user.id).maybeSingle() : { data: null };
  const requestedNext = safeInternalPath(form.get("next"), accountPath);
  const destination = profile?.role === "admin"
    ? `${accountPath}?mfa=1&next=${encodeURIComponent(requestedNext === accountPath ? "/admin" : requestedNext)}`
    : profile?.professional_status === "approved" && !requestedNext.startsWith("/admin")
      ? requestedNext
      : accountPath;
  return redirect(destination, { headers: supabase.responseHeaders });
}

export function headers() { return { "Cache-Control": "private, no-store" }; }

export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "My account | Zen Coffee Lab" : "Mon compte | Zen Coffee Lab", data?.locale === "en-GB" ? "Orders, invoices, tracking and addresses." : "Commandes, factures, suivis et adresses.", data?.locale === "en-GB" ? "/en/my-account" : "/mon-compte");

function MfaCodeForm({ factorId, next, english }: { factorId: string; next: string; english: boolean }) {
  return <Form method="post" className="mfa-code-form">
    <input type="hidden" name="intent" value="mfa_verify" />
    <input type="hidden" name="factorId" value={factorId} />
    <input type="hidden" name="next" value={next} />
    <div className="field"><label htmlFor="mfa-code">{english ? "Six-digit code" : "Code à six chiffres"}<input id="mfa-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></div>
    <button className="button button--dark" type="submit">{english ? "Verify and open admin" : "Vérifier et ouvrir l’administration"}</button>
  </Form>;
}

function AdminMfaPanel({ mfa, enrollment, next, english }: { mfa: NonNullable<Awaited<ReturnType<typeof loader>>["mfa"]>; enrollment?: { factorId: string; qrCode: string; secret: string }; next: string; english: boolean }) {
  const verifiedFactor = mfa.verifiedFactors[0];
  const isVerified = mfa.currentLevel === "aal2";
  return <section className="mfa-panel" aria-labelledby="mfa-title">
    <div><p className="eyebrow">{english ? "Administrator security" : "Sécurité administrateur"}</p><h2 id="mfa-title">{english ? "Two-factor authentication" : "Authentification à deux facteurs"}</h2></div>
    {isVerified ? <><p className="mfa-status mfa-status--success">{english ? "MFA verified for this session." : "MFA vérifiée pour cette session."}</p><Link className="button button--dark" to={next}>{english ? "Open administration" : "Ouvrir l’administration"}</Link></> : enrollment ? <div className="mfa-enrollment"><p>{english ? "Scan this QR code with an authenticator app such as 2FAS, Google Authenticator or 1Password." : "Scannez ce QR code avec une application d’authentification comme 2FAS, Google Authenticator ou 1Password."}</p><img className="mfa-qr" src={enrollment.qrCode} alt={english ? "QR code for Zen Coffee Lab administrator MFA" : "QR code pour la MFA administrateur Zen Coffee Lab"} width="240" height="240" /><p>{english ? "Manual key:" : "Clé manuelle :"} <code className="mfa-secret">{enrollment.secret}</code></p><MfaCodeForm factorId={enrollment.factorId} next={next} english={english} /></div> : verifiedFactor ? <><p>{english ? "Enter the current code from your authenticator app to continue." : "Saisissez le code actuel de votre application d’authentification pour continuer."}</p><MfaCodeForm factorId={verifiedFactor.id} next={next} english={english} /></> : <><p>{english ? "MFA is required before accessing orders, stocks and internal costs." : "La MFA est obligatoire avant d’accéder aux commandes, aux stocks et aux coûts internes."}</p><Form method="post"><input type="hidden" name="intent" value="mfa_enroll" /><button className="button button--dark" type="submit">{english ? "Configure my authenticator" : "Configurer mon application d’authentification"}</button></Form></>}
  </section>;
}

export function AccountNavigation({ english, orderCount, addressCount, professional }: { english: boolean; orderCount: number; addressCount: number; professional: boolean }) {
  return <nav className="account-anchor-nav" aria-label={english ? "My account sections" : "Sections de mon compte"}>
    <a href="#account-orders"><Package aria-hidden="true" /><span><strong>{english ? "Orders" : "Commandes"}</strong><small>{english ? "Invoices and tracking" : "Factures et suivis"}</small></span><em>{orderCount}</em><ChevronRight aria-hidden="true" /></a>
    <a href="#account-addresses"><MapPin aria-hidden="true" /><span><strong>{english ? "Addresses" : "Adresses"}</strong><small>{english ? "Saved delivery details" : "Coordonnées enregistrées"}</small></span><em>{addressCount}</em><ChevronRight aria-hidden="true" /></a>
    <a href="#account-settings"><ShieldCheck aria-hidden="true" /><span><strong>{english ? "Settings" : "Paramètres"}</strong><small>{english ? "Access and security" : "Accès et sécurité"}</small></span><ChevronRight aria-hidden="true" /></a>
    {professional ? <Link className="account-anchor-nav__professional" to={english ? "/en/professional" : "/professionnel"}><ShoppingBag aria-hidden="true" /><span><strong>{english ? "Professional shop" : "Boutique pro"}</strong><small>{english ? "Access your professional prices" : "Accéder à vos tarifs professionnels"}</small></span><ChevronRight aria-hidden="true" /></Link> : null}
  </nav>;
}

function orderStatusLabel(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ["En attente de paiement", "Awaiting payment"], paid: ["Payée", "Paid"], preparing: ["En préparation", "Preparing"],
    ready_to_ship: ["Prête à expédier", "Ready to ship"], shipped: ["Expédiée", "Shipped"], delivered: ["Livrée", "Delivered"],
    canceled: ["Annulée", "Cancelled"], partially_refunded: ["Partiellement remboursée", "Partially refunded"], refunded: ["Remboursée", "Refunded"],
  };
  return labels[status]?.[english ? 1 : 0] ?? status;
}

export default function Account() {
  const { locale, viewer, orders, addresses, setPassword, authError, next, mfa } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>(); const english = locale === "en-GB";
  const enrollment = result && "mfaEnrollment" in result ? result.mfaEnrollment : undefined;
  const professionalPath = english ? "/en/professional" : "/professionnel";
  const professionalLogin = next === professionalPath;
  if (viewer) {
    const displayName = [viewer.profile?.first_name, viewer.profile?.last_name].filter(Boolean).join(" ");
    const initial = (viewer.profile?.first_name || viewer.user.email || "Z").slice(0, 1).toLocaleUpperCase(locale);
    const professional = viewer.profile?.professional_status === "approved";
    return <>
      <header className="page-hero account-hero"><p className="eyebrow">{english ? "Private space" : "Espace privé"}</p><h1>{displayName ? (english ? `Welcome, ${displayName}` : `Bienvenue, ${displayName}`) : (english ? "Welcome back" : "Bienvenue")}</h1><p className="lede">{english ? "Your orders, addresses and preferences, all in one place." : "Vos commandes, vos adresses et vos préférences, réunies au même endroit."}</p></header>
      <div className="page-shell account-page-shell">
        <aside className="account-sidebar">
          <div className="account-profile-card"><span aria-hidden="true">{initial}</span><div><small>{english ? "Signed in as" : "Connecté en tant que"}</small><strong>{displayName || viewer.user.email}</strong>{displayName ? <small>{viewer.user.email}</small> : null}</div></div>
          <AccountNavigation english={english} orderCount={orders.length} addressCount={addresses.length} professional={professional} />
        </aside>
        <main className="account-sections">
          {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
          <section className="account-section" id="account-orders" aria-labelledby="account-orders-title">
            <div className="account-section__heading"><div><p className="eyebrow">{english ? "History" : "Historique"}</p><h2 id="account-orders-title">{english ? "Your orders" : "Vos commandes"}</h2></div><span>{orders.length} {english ? (orders.length === 1 ? "order" : "orders") : (orders.length === 1 ? "commande" : "commandes")}</span></div>
            {orders.length ? <div className="account-panel account-table-wrap"><table className="ui-table"><thead><tr><th>{english ? "Order" : "Commande"}</th><th>{english ? "Date" : "Date"}</th><th>{english ? "Status" : "Statut"}</th><th>Total</th><th>{english ? "Documents" : "Documents"}</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{new Date(order.created_at).toLocaleDateString(locale)}</td><td><span className="ui-badge account-order-status">{orderStatusLabel(order.status, english)}</span></td><td><strong>{formatMoney(order.total_cents, locale)}</strong></td><td><div className="account-order-links">{order.paid_at ? <a className="text-link" href={`/api/orders/${order.id}/invoice`}>{english ? "Invoice PDF" : "Facture PDF"}</a> : "—"}{order.shipments?.[0]?.tracking_url ? <a className="text-link" href={order.shipments[0].tracking_url} target="_blank" rel="noreferrer">{english ? "Track" : "Suivre"}</a> : null}</div></td></tr>)}</tbody></table></div> : <div className="account-panel account-empty-state"><Package aria-hidden="true" /><div><h3>{english ? "No orders yet" : "Aucune commande pour le moment"}</h3><p>{english ? "Your paid orders, invoices and tracking will appear here." : "Vos commandes payées, factures et suivis apparaîtront ici."}</p></div><Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Discover our coffees" : "Découvrir nos cafés"}</Link></div>}
          </section>

          <section className="account-section" id="account-addresses" aria-labelledby="account-addresses-title">
            <div className="account-section__heading"><div><p className="eyebrow">{english ? "Saved details" : "Coordonnées enregistrées"}</p><h2 id="account-addresses-title">{english ? "Your addresses" : "Vos adresses"}</h2></div><span>{addresses.length} {english ? (addresses.length === 1 ? "address" : "addresses") : (addresses.length === 1 ? "adresse" : "adresses")}</span></div>
            {addresses.length ? <div className="account-address-grid">{addresses.map((address) => <article className="account-panel account-address-card" key={address.id}><div className="account-address-card__icon"><MapPin aria-hidden="true" /></div><div><p className="eyebrow">{address.label || (english ? "Delivery address" : "Adresse de livraison")}</p><h3>{address.first_name} {address.last_name}</h3><p>{address.company ? <>{address.company}<br /></> : null}{address.line1}<br />{address.line2 ? <>{address.line2}<br /></> : null}{address.postal_code} {address.city}<br />{address.country_code}{address.phone ? <> · {address.phone}</> : null}</p></div><Form method="post"><input type="hidden" name="intent" value="delete_address" /><input type="hidden" name="addressId" value={address.id} /><button className="ui-button ui-button--ghost ui-button--sm" type="submit">{english ? "Delete" : "Supprimer"}</button></Form></article>)}</div> : null}
            <Form method="post" className="account-panel account-form"><input type="hidden" name="intent" value="save_address" /><div className="account-form__heading"><div><p className="eyebrow">{english ? "New delivery address" : "Nouvelle adresse de livraison"}</p><h3>{english ? "Add an address" : "Ajouter une adresse"}</h3></div><MapPin aria-hidden="true" /></div><div className="form-grid"><div className="field"><label>{english ? "Label" : "Libellé"}<input name="label" placeholder={english ? "Home" : "Maison"} /></label></div><div className="field"><label>{english ? "Company" : "Société"}<input name="company" /></label></div><div className="field"><label>{english ? "First name" : "Prénom"}<input name="firstName" required autoComplete="given-name" /></label></div><div className="field"><label>{english ? "Last name" : "Nom"}<input name="lastName" required autoComplete="family-name" /></label></div><div className="field field--wide"><label>{english ? "Address" : "Adresse"}<input name="line1" required autoComplete="address-line1" /></label></div><div className="field field--wide"><label>{english ? "Address line 2" : "Complément"}<input name="line2" autoComplete="address-line2" /></label></div><div className="field"><label>{english ? "Postcode" : "Code postal"}<input name="postalCode" required autoComplete="postal-code" /></label></div><div className="field"><label>{english ? "City" : "Ville"}<input name="city" required autoComplete="address-level2" /></label></div><div className="field"><label>{english ? "Country code" : "Code pays"}<input name="countryCode" defaultValue="FR" maxLength={2} required autoComplete="country" /></label></div><div className="field"><label>{english ? "Phone" : "Téléphone"}<input name="phone" type="tel" autoComplete="tel" /></label></div></div><button className="button button--dark" type="submit">{english ? "Save address" : "Enregistrer l’adresse"}</button></Form>
          </section>

          <section className="account-section" id="account-settings" aria-labelledby="account-settings-title">
            <div className="account-section__heading"><div><p className="eyebrow">{english ? "Access" : "Accès"}</p><h2 id="account-settings-title">{english ? "Settings & security" : "Paramètres & sécurité"}</h2></div></div>
            {setPassword ? <Form method="post" className="account-panel account-form account-password-form"><input type="hidden" name="intent" value="update_password" /><input type="hidden" name="next" value={next} /><div className="account-form__heading"><div><p className="eyebrow">{english ? "Password" : "Mot de passe"}</p><h3>{english ? "Choose your password" : "Choisissez votre mot de passe"}</h3></div><ShieldCheck aria-hidden="true" /></div><div className="field"><label>{english ? "New password" : "Nouveau mot de passe"}<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label></div><button className="button button--dark" type="submit">{english ? "Save password" : "Enregistrer le mot de passe"}</button></Form> : null}
            {mfa ? <AdminMfaPanel mfa={mfa} enrollment={enrollment} next={next} english={english} /> : null}
            <div className="account-panel account-settings-card"><div className="account-settings-card__identity"><span><UserRound aria-hidden="true" /></span><div><small>{english ? "Login email" : "E-mail de connexion"}</small><strong>{viewer.user.email}</strong><small>{professional ? (english ? "Approved professional account" : "Compte professionnel validé") : (english ? "Customer account" : "Compte client")}</small></div></div><div className="account-settings-actions"><Form method="post"><input type="hidden" name="intent" value="reset" /><input type="hidden" name="email" value={viewer.user.email ?? ""} /><input type="hidden" name="next" value="#account-settings" /><button className="ui-button ui-button--outline" type="submit">{english ? "Change password by email" : "Modifier le mot de passe par e-mail"}</button></Form><Form method="post"><input type="hidden" name="intent" value="logout" /><button className="ui-button ui-button--ghost" type="submit">{english ? "Sign out" : "Se déconnecter"}</button></Form></div></div>
          </section>
        </main>
      </div>
    </>;
  }
  return <>
    <header className="page-hero"><p className="eyebrow">{professionalLogin ? (english ? "Professional access" : "Accès professionnel") : (english ? "Private space" : "Espace privé")}</p><h1>{professionalLogin ? (english ? "Professional sign in" : "Connexion professionnelle") : (english ? "Your account" : "Votre compte")}</h1><p className="lede">{professionalLogin ? (english ? "This access is reserved for professional applications approved by Zen Coffee Lab." : "Cet accès est réservé aux demandes professionnelles validées par Zen Coffee Lab.") : (english ? "Find your orders, invoices, addresses and tracking." : "Retrouvez vos commandes, factures, adresses et suivis.")}</p></header>
    <Form method="post" className="form-card"><input type="hidden" name="next" value={next} /><h2>{english ? "Sign in" : "Se connecter"}</h2>{authError ? <p className="form-message form-error" role="alert">{authError}</p> : null}{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}<div className="form-grid"><div className="field field--wide"><label htmlFor="account-email">Email</label><input id="account-email" name="email" type="email" required autoComplete="email" /></div><div className="field field--wide"><label htmlFor="account-password">{english ? "Password" : "Mot de passe"}</label><input id="account-password" name="password" type="password" minLength={8} required autoComplete="current-password" /></div></div><div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" }}><button className="button button--dark" name="intent" value="login" type="submit">{english ? "Sign in" : "Se connecter"}</button>{professionalLogin ? null : <button className="button button--ghost" name="intent" value="register" type="submit">{english ? "Create an account" : "Créer un compte"}</button>}<button className="button button--ghost" formNoValidate name="intent" value="reset" type="submit">{english ? "Reset password" : "Mot de passe oublié"}</button></div>{professionalLogin ? <p className="stock-note">{english ? "No access yet? Submit the professional application first; an administrator will review it." : "Pas encore d’accès ? Envoyez d’abord la demande professionnelle ; un administrateur l’étudiera."}</p> : null}</Form>
  </>;
}
