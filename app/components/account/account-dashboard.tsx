import { CircleAlert, CircleCheck, ChevronRight, MapPin, Package, ShieldCheck, ShoppingBag, UserRound } from "lucide-react";
import type { FormEventHandler, PropsWithChildren } from "react";
import { Form, Link, useFetcher } from "react-router";
import { ProfessionalQuotePreview } from "~/components/professional-quote/quote-preview-modal";
import { formatMoney } from "~/domain/money";
import type { Locale } from "~/domain/types";

export type AccountSectionId = "orders" | "addresses" | "settings" | "professional-quotes";

export type AccountMfaState = {
  currentLevel: string | null;
  nextLevel: string | null;
  verifiedFactors: Array<{ id: string; friendlyName: string; createdAt: string }>;
};

type AccountViewer = {
  user: { id: string; email?: string | null };
  profile: {
    role?: string | null;
    professional_status?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
};

type AccountOrder = {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  created_at: string;
  paid_at?: string | null;
  shipments?: Array<{ carrier?: string | null; tracking_number?: string | null; tracking_url?: string | null; status?: string | null }> | null;
};

type AccountAddress = {
  id: string;
  label?: string | null;
  company?: string | null;
  first_name: string;
  last_name: string;
  line1: string;
  line2?: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone?: string | null;
};

type AccountProfessionalQuote = {
  id: string;
  quote_number: string;
  status: string;
  total_weight_kg: number | string;
  total_cents: number;
  valid_until: string;
  paid_at?: string | null;
  created_at: string;
};

export type AccountDashboardData = {
  locale: Locale;
  viewer: AccountViewer;
  orders: AccountOrder[];
  addresses: AccountAddress[];
  professionalQuotes: AccountProfessionalQuote[];
  setPassword: boolean;
  next: string;
  mfa: AccountMfaState | null;
};

export type AccountActionFeedback = {
  ok?: boolean;
  message?: string;
  scope?: string;
  mfaEnrollment?: { factorId: string; qrCode: string; secret: string };
};

type AccountMutationFormProps = PropsWithChildren<{
  action: string;
  className?: string;
  method: "post";
  onSubmit?: FormEventHandler<HTMLFormElement>;
}>;

function AccountMutationForm({ drawer, ...props }: AccountMutationFormProps & { drawer: boolean }) {
  const fetcher = useFetcher<AccountActionFeedback>({ key: "account-drawer-actions" });
  return drawer ? <fetcher.Form {...props} /> : <Form {...props} />;
}

export function AccountNavigation({ english, orderCount, addressCount, quoteCount, professional }: { english: boolean; orderCount: number; addressCount: number; quoteCount: number; professional: boolean }) {
  return <nav className="account-anchor-nav" aria-label={english ? "My account sections" : "Sections de mon compte"}>
    <a href="#account-orders"><Package aria-hidden="true" /><span><strong>{english ? "Orders" : "Commandes"}</strong><small>{english ? "Invoices and tracking" : "Factures et suivis"}</small></span><em>{orderCount}</em><ChevronRight aria-hidden="true" /></a>
    <a href="#account-addresses"><MapPin aria-hidden="true" /><span><strong>{english ? "Addresses" : "Adresses"}</strong><small>{english ? "Saved delivery details" : "Coordonnées enregistrées"}</small></span><em>{addressCount}</em><ChevronRight aria-hidden="true" /></a>
    <a href="#account-settings"><ShieldCheck aria-hidden="true" /><span><strong>{english ? "Settings" : "Paramètres"}</strong><small>{english ? "Access and security" : "Accès et sécurité"}</small></span><ChevronRight aria-hidden="true" /></a>
    {professional ? <a className="account-anchor-nav__professional" href="#account-professional-quotes"><ShoppingBag aria-hidden="true" /><span><strong>{english ? "Professional shop" : "Boutique pro"}</strong><small>{english ? "Quotes and payments" : "Devis et paiements"}</small></span><em>{quoteCount}</em><ChevronRight aria-hidden="true" /></a> : null}
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

function professionalQuoteStatusLabel(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ["À régler", "Awaiting payment"],
    bank_transfer_pending: ["Virement en attente", "Bank transfer pending"],
    paid: ["Payé", "Paid"],
    expired: ["Expiré", "Expired"],
    canceled: ["Annulé", "Cancelled"],
  };
  return labels[status]?.[english ? 1 : 0] ?? status;
}

function sectionVisibility(mode: "page" | "drawer", activeSection: AccountSectionId, section: AccountSectionId) {
  return mode === "drawer" && activeSection !== section;
}

function AccountMfaPanel({ mfa, result, drawer, accountPath, english, prefix }: { mfa: AccountMfaState | null; result?: AccountActionFeedback | null; drawer: boolean; accountPath: string; english: boolean; prefix: string }) {
  const factor = mfa?.verifiedFactors[0];
  const enrollment = result?.mfaEnrollment;
  const codeId = `${prefix}-mfa-setup-code`;

  return <div className="mfa-panel">
    <p className="eyebrow">{english ? "Optional protection" : "Protection facultative"}</p>
    <h3>{english ? "Two-factor authentication" : "Double authentification"}</h3>
    {factor ? <>
      <span className="mfa-status mfa-status--success">{english ? "Active" : "Activée"}</span>
      <p>{english ? "A code from your authenticator is required when a new session opens this account." : "Un code de votre authentificateur est demandé lorsqu’une nouvelle session ouvre ce compte."}</p>
      <p><small>{factor.friendlyName} · {new Date(factor.createdAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</small></p>
      <AccountMutationForm drawer={drawer} method="post" action={accountPath} className="mfa-disable-form" onSubmit={(event) => { if (!window.confirm(english ? "Disable two-factor authentication?" : "Désactiver la double authentification ?")) event.preventDefault(); }}>
        <input type="hidden" name="intent" value="mfa_unenroll" />
        <input type="hidden" name="factorId" value={factor.id} />
        <button className="ui-button ui-button--danger" type="submit">{english ? "Disable two-factor authentication" : "Désactiver la double authentification"}</button>
      </AccountMutationForm>
    </> : enrollment ? <div className="mfa-enrollment">
      <p>{english ? "Scan this QR code with 2FAS, Google Authenticator or 1Password, then enter the generated code." : "Scannez ce QR code avec 2FAS, Google Authenticator ou 1Password, puis saisissez le code généré."}</p>
      <img className="mfa-qr" src={enrollment.qrCode} alt={english ? "QR code for Zen Coffee Lab two-factor authentication" : "QR code pour la double authentification Zen Coffee Lab"} width="240" height="240" />
      <p>{english ? "Manual key:" : "Clé manuelle :"} <code className="mfa-secret">{enrollment.secret}</code></p>
      <AccountMutationForm drawer={drawer} method="post" action={accountPath} className="mfa-code-form">
        <input type="hidden" name="intent" value="mfa_verify" />
        <input type="hidden" name="purpose" value="setup" />
        <input type="hidden" name="factorId" value={enrollment.factorId} />
        <div className="field"><label htmlFor={codeId}>{english ? "Six-digit code" : "Code à six chiffres"}<input id={codeId} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></div>
        <button className="button button--dark" type="submit">{english ? "Confirm activation" : "Confirmer l’activation"}</button>
      </AccountMutationForm>
    </div> : <>
      <p>{english ? "Add an authenticator code after your password. This protection is optional and can be disabled here later." : "Ajoutez un code d’authentificateur après votre mot de passe. Cette protection est facultative et pourra être désactivée ici ultérieurement."}</p>
      <AccountMutationForm drawer={drawer} method="post" action={accountPath} className="mfa-enable-form">
        <input type="hidden" name="intent" value="mfa_enroll" />
        <button className="ui-button ui-button--outline" type="submit"><ShieldCheck aria-hidden="true" />{english ? "Enable two-factor authentication" : "Activer la double authentification"}</button>
      </AccountMutationForm>
    </>}
  </div>;
}

function AccountSections({ data, result, mode, activeSection, onNavigate }: { data: AccountDashboardData; result?: AccountActionFeedback | null; mode: "page" | "drawer"; activeSection: AccountSectionId; onNavigate?: () => void }) {
  const { locale, viewer, orders, addresses, professionalQuotes, setPassword, next, mfa } = data;
  const english = locale === "en-GB";
  const drawer = mode === "drawer";
  const prefix = drawer ? "account-drawer" : "account";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const professionalPath = english ? "/en/professional" : "/professionnel";
  const professional = viewer.profile?.professional_status === "approved";
  const passwordResetResult = result?.scope === "password_reset" ? result : null;

  return <main className="account-sections">
    {result?.message && !passwordResetResult ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    {professional ? <section className="account-section" id={`${prefix}-professional-quotes`} aria-labelledby={drawer ? "account-drawer-tab-professional-quotes" : `${prefix}-professional-quotes-title`} role={drawer ? "tabpanel" : undefined} hidden={sectionVisibility(mode, activeSection, "professional-quotes")}>
      <div className="account-section__heading"><div><p className="eyebrow">{english ? "Professional purchasing" : "Achats professionnels"}</p><h2 id={`${prefix}-professional-quotes-title`}>{english ? "Professional shop" : "Boutique pro"}</h2></div><div className="account-section__actions"><span>{professionalQuotes.length} {english ? (professionalQuotes.length === 1 ? "quote" : "quotes") : "devis"}</span><Link className="ui-button ui-button--outline" to={professionalPath} onClick={onNavigate}>{english ? "Open the pro shop" : "Voir la boutique pro"}</Link></div></div>
      {professionalQuotes.length ? <div className="account-panel account-table-wrap"><table className="ui-table"><thead><tr><th>{english ? "Quote" : "Devis"}</th><th>Date</th><th>{english ? "Status" : "Statut"}</th><th>{english ? "Weight" : "Poids"}</th><th>Total</th><th>Documents</th></tr></thead><tbody>{professionalQuotes.map((quote) => {
        const canPay = quote.status === "pending_payment" && new Date(quote.valid_until).getTime() > Date.now();
        return <tr key={quote.id}><td><strong>{quote.quote_number}</strong></td><td>{new Date(quote.created_at).toLocaleDateString(locale)}</td><td><span className={`ui-badge account-quote-status account-quote-status--${quote.status}`}>{professionalQuoteStatusLabel(quote.status, english)}</span></td><td>{Number(quote.total_weight_kg).toLocaleString(locale, { maximumFractionDigits: 2 })} kg</td><td><strong>{formatMoney(quote.total_cents, locale)}</strong></td><td><div className="account-order-links"><ProfessionalQuotePreview quoteId={quote.id} locale={locale} /><a className="text-link" href={`/api/professional-quotes/${quote.id}/pdf`}>{english ? "Quote PDF" : "Devis PDF"}</a>{canPay ? <Link className="text-link" to={`${english ? "/en/quotes" : "/devis"}/${quote.id}/${english ? "payment" : "paiement"}`} onClick={onNavigate}>{english ? "Pay" : "Payer"}</Link> : null}</div></td></tr>;
      })}</tbody></table></div> : <div className="account-panel account-empty-state"><ShoppingBag aria-hidden="true" /><div><h3>{english ? "No quotes yet" : "Aucun devis pour le moment"}</h3><p>{english ? "Select your coffees by the kilogram to generate your first quote." : "Sélectionnez vos cafés au kilo pour générer votre premier devis."}</p></div><Link className="button button--dark" to={professionalPath} onClick={onNavigate}>{english ? "Open the pro shop" : "Voir la boutique pro"}</Link></div>}
    </section> : null}

    <section className="account-section" id={`${prefix}-orders`} aria-labelledby={drawer ? "account-drawer-tab-orders" : `${prefix}-orders-title`} role={drawer ? "tabpanel" : undefined} hidden={sectionVisibility(mode, activeSection, "orders")}>
      <div className="account-section__heading"><div><p className="eyebrow">{english ? "History" : "Historique"}</p><h2 id={`${prefix}-orders-title`}>{english ? "Your orders" : "Vos commandes"}</h2></div><span>{orders.length} {english ? (orders.length === 1 ? "order" : "orders") : (orders.length === 1 ? "commande" : "commandes")}</span></div>
      {orders.length ? <div className="account-panel account-table-wrap"><table className="ui-table"><thead><tr><th>{english ? "Order" : "Commande"}</th><th>Date</th><th>{english ? "Status" : "Statut"}</th><th>Total</th><th>Documents</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{new Date(order.created_at).toLocaleDateString(locale)}</td><td><span className="ui-badge account-order-status">{orderStatusLabel(order.status, english)}</span></td><td><strong>{formatMoney(order.total_cents, locale)}</strong></td><td><div className="account-order-links">{order.paid_at ? <a className="text-link" href={`/api/orders/${order.id}/invoice`}>{english ? "Invoice PDF" : "Facture PDF"}</a> : "—"}{order.shipments?.[0]?.tracking_url ? <a className="text-link" href={order.shipments[0].tracking_url} target="_blank" rel="noreferrer">{english ? "Track" : "Suivre"}</a> : null}</div></td></tr>)}</tbody></table></div> : <div className="account-panel account-empty-state"><Package aria-hidden="true" /><div><h3>{english ? "No orders yet" : "Aucune commande pour le moment"}</h3><p>{english ? "Your paid orders, invoices and tracking will appear here." : "Vos commandes payées, factures et suivis apparaîtront ici."}</p></div><Link className="button button--dark" to={english ? "/en/shop" : "/boutique"} onClick={onNavigate}>{english ? "Discover our coffees" : "Découvrir nos cafés"}</Link></div>}
    </section>

    <section className="account-section" id={`${prefix}-addresses`} aria-labelledby={drawer ? "account-drawer-tab-addresses" : `${prefix}-addresses-title`} role={drawer ? "tabpanel" : undefined} hidden={sectionVisibility(mode, activeSection, "addresses")}>
      <div className="account-section__heading"><div><p className="eyebrow">{english ? "Saved details" : "Coordonnées enregistrées"}</p><h2 id={`${prefix}-addresses-title`}>{english ? "Your addresses" : "Vos adresses"}</h2></div><span>{addresses.length} {english ? (addresses.length === 1 ? "address" : "addresses") : (addresses.length === 1 ? "adresse" : "adresses")}</span></div>
      {addresses.length ? <div className="account-address-grid">{addresses.map((address) => <article className="account-panel account-address-card" key={address.id}><div className="account-address-card__icon"><MapPin aria-hidden="true" /></div><div><p className="eyebrow">{address.label || (english ? "Delivery address" : "Adresse de livraison")}</p><h3>{address.first_name} {address.last_name}</h3><p>{address.company ? <>{address.company}<br /></> : null}{address.line1}<br />{address.line2 ? <>{address.line2}<br /></> : null}{address.postal_code} {address.city}<br />{address.country_code}{address.phone ? <> · {address.phone}</> : null}</p></div><AccountMutationForm drawer={drawer} method="post" action={accountPath}><input type="hidden" name="intent" value="delete_address" /><input type="hidden" name="addressId" value={address.id} /><button className="ui-button ui-button--ghost ui-button--sm" type="submit">{english ? "Delete" : "Supprimer"}</button></AccountMutationForm></article>)}</div> : null}
      <AccountMutationForm drawer={drawer} method="post" action={accountPath} className="account-panel account-form"><input type="hidden" name="intent" value="save_address" /><div className="account-form__heading"><div><p className="eyebrow">{english ? "New delivery address" : "Nouvelle adresse de livraison"}</p><h3>{english ? "Add an address" : "Ajouter une adresse"}</h3></div><MapPin aria-hidden="true" /></div><div className="form-grid"><div className="field"><label>{english ? "Label" : "Libellé"}<input name="label" placeholder={english ? "Home" : "Maison"} /></label></div><div className="field"><label>{english ? "Company" : "Société"}<input name="company" /></label></div><div className="field"><label>{english ? "First name" : "Prénom"}<input name="firstName" required autoComplete="given-name" /></label></div><div className="field"><label>{english ? "Last name" : "Nom"}<input name="lastName" required autoComplete="family-name" /></label></div><div className="field field--wide"><label>{english ? "Address" : "Adresse"}<input name="line1" required autoComplete="address-line1" /></label></div><div className="field field--wide"><label>{english ? "Address line 2" : "Complément"}<input name="line2" autoComplete="address-line2" /></label></div><div className="field"><label>{english ? "Postcode" : "Code postal"}<input name="postalCode" required autoComplete="postal-code" /></label></div><div className="field"><label>{english ? "City" : "Ville"}<input name="city" required autoComplete="address-level2" /></label></div><div className="field"><label>{english ? "Country code" : "Code pays"}<input name="countryCode" defaultValue="FR" maxLength={2} required autoComplete="country" /></label></div><div className="field"><label>{english ? "Phone" : "Téléphone"}<input name="phone" type="tel" autoComplete="tel" /></label></div></div><button className="button button--dark" type="submit">{english ? "Save address" : "Enregistrer l’adresse"}</button></AccountMutationForm>
    </section>

    <section className="account-section" id={`${prefix}-settings`} aria-labelledby={drawer ? "account-drawer-tab-settings" : `${prefix}-settings-title`} role={drawer ? "tabpanel" : undefined} hidden={sectionVisibility(mode, activeSection, "settings")}>
      <div className="account-section__heading"><div><p className="eyebrow">{english ? "Access" : "Accès"}</p><h2 id={`${prefix}-settings-title`}>{english ? "Settings & security" : "Paramètres & sécurité"}</h2></div></div>
      {setPassword ? <AccountMutationForm drawer={drawer} method="post" action={accountPath} className="account-panel account-form account-password-form"><input type="hidden" name="intent" value="update_password" /><input type="hidden" name="next" value={next} /><div className="account-form__heading"><div><p className="eyebrow">{english ? "Password" : "Mot de passe"}</p><h3>{english ? "Choose your password" : "Choisissez votre mot de passe"}</h3></div><ShieldCheck aria-hidden="true" /></div><div className="field"><label>{english ? "New password" : "Nouveau mot de passe"}<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label></div><button className="button button--dark" type="submit">{english ? "Save password" : "Enregistrer le mot de passe"}</button></AccountMutationForm> : null}
      <AccountMfaPanel mfa={mfa} result={result} drawer={drawer} accountPath={accountPath} english={english} prefix={prefix} />
      <div className="account-panel account-settings-card">
        <div className="account-settings-card__identity"><span><UserRound aria-hidden="true" /></span><div><small>{english ? "Login email" : "E-mail de connexion"}</small><strong>{viewer.user.email}</strong><small>{professional ? (english ? "Approved professional account" : "Compte professionnel validé") : (english ? "Customer account" : "Compte client")}</small></div></div>
        <div className="account-settings-actions"><AccountMutationForm drawer={drawer} method="post" action={accountPath}><input type="hidden" name="intent" value="reset" /><input type="hidden" name="email" value={viewer.user.email ?? ""} /><input type="hidden" name="next" value="#account-settings" /><button className="ui-button ui-button--outline" type="submit">{english ? "Change password by email" : "Modifier le mot de passe par e-mail"}</button></AccountMutationForm>{drawer ? null : <AccountMutationForm drawer={false} method="post" action={accountPath}><input type="hidden" name="intent" value="logout" /><button className="ui-button ui-button--ghost" type="submit">{english ? "Sign out" : "Se déconnecter"}</button></AccountMutationForm>}</div>
        {passwordResetResult?.message ? <div
          className={`account-password-reset-feedback${passwordResetResult.ok ? " is-success" : " is-error"}`}
          role={passwordResetResult.ok ? "status" : "alert"}
          aria-live={passwordResetResult.ok ? "polite" : "assertive"}
        >
          {passwordResetResult.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          <div><strong>{passwordResetResult.ok ? (english ? "Email sent" : "E-mail envoyé") : (english ? "Unable to send" : "Envoi impossible")}</strong><p>{passwordResetResult.message}</p></div>
        </div> : null}
      </div>
    </section>
  </main>;
}

export function AccountDashboard({ data, result, mode = "page", activeSection = "orders", onNavigate }: { data: AccountDashboardData; result?: AccountActionFeedback | null; mode?: "page" | "drawer"; activeSection?: AccountSectionId; onNavigate?: () => void }) {
  const { locale, viewer, orders, addresses, professionalQuotes } = data;
  const english = locale === "en-GB";
  const displayName = [viewer.profile?.first_name, viewer.profile?.last_name].filter(Boolean).join(" ");
  const initial = (viewer.profile?.first_name || viewer.user.email || "Z").slice(0, 1).toLocaleUpperCase(locale);
  const professional = viewer.profile?.professional_status === "approved";

  if (mode === "drawer") return <AccountSections data={data} result={result} mode={mode} activeSection={activeSection} onNavigate={onNavigate} />;

  return <>
    <header className="page-hero account-hero"><p className="eyebrow">{english ? "Private space" : "Espace privé"}</p><h1>{displayName ? (english ? `Welcome, ${displayName}` : `Bienvenue, ${displayName}`) : (english ? "Welcome back" : "Bienvenue")}</h1><p className="lede">{english ? "Your orders, addresses and preferences, all in one place." : "Vos commandes, vos adresses et vos préférences, réunies au même endroit."}</p></header>
    <div className="page-shell account-page-shell">
      <aside className="account-sidebar">
        <div className="account-profile-card"><span aria-hidden="true">{initial}</span><div><small>{english ? "Signed in as" : "Connecté en tant que"}</small><strong>{displayName || viewer.user.email}</strong>{displayName ? <small>{viewer.user.email}</small> : null}</div></div>
        <AccountNavigation english={english} orderCount={orders.length} addressCount={addresses.length} quoteCount={professionalQuotes.length} professional={professional} />
      </aside>
      <AccountSections data={data} result={result} mode={mode} activeSection={activeSection} />
    </div>
  </>;
}
