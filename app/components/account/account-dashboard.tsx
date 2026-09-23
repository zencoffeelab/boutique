import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Package,
  Paperclip,
  Reply,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEventHandler,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Form, Link, useFetcher } from "react-router";
import { AddressAutocomplete } from "~/components/address-autocomplete";
import { formatMoney } from "~/domain/money";
import {
  SHIPPING_COUNTRY_CODES,
  shippingCountryLabel,
} from "~/domain/shipping-countries";
import type { Locale } from "~/domain/types";

export type AccountSectionId =
  | "orders"
  | "upcoming-order"
  | "documents"
  | "communication"
  | "addresses"
  | "settings";

export type AccountMfaState = {
  currentLevel: string | null;
  nextLevel: string | null;
  verifiedFactors: Array<{
    id: string;
    friendlyName: string;
    createdAt: string;
  }>;
};

type AccountViewer = {
  user: { id: string; email?: string | null };
  profile: {
    role?: string | null;
    professional_status?: string | null;
    professional_account_type?: string | null;
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
  shipments?: Array<{
    carrier?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
    status?: string | null;
  }> | null;
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

type AccountProfessionalApplication = {
  company_name: string;
  country_code: string;
  first_name: string;
  last_name: string;
  email: string;
  company_registration_number: string;
  vat_number?: string | null;
  phone?: string | null;
  electronic_billing_address?: string | null;
  billing_address?: {
    line1?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
  } | null;
  delivery_address?: {
    firstName?: string;
    lastName?: string;
    line1?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
  } | null;
  business_type: string;
  monthly_volume: string;
  comment?: string | null;
};

export type AccountDashboardData = {
  locale: Locale;
  viewer: AccountViewer;
  orders: AccountOrder[];
  addresses: AccountAddress[];
  professionalApplication?: AccountProfessionalApplication | null;
  professionalQuotes?: Array<{
    id: string;
    quote_number: string;
    status: string;
    total_cents: number;
    created_at: string;
    paid_at?: string | null;
  }>;
  professionalMessages?: Array<{
    id: string;
    direction: "inbound" | "outbound";
    sender_name?: string | null;
    sender_address: string;
    recipients: unknown;
    subject: string;
    text_body?: string | null;
    created_at: string;
    sent_at?: string | null;
    parent_id?: string | null;
    admin_mail_attachments?: Array<{
      id: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
      content_id?: string | null;
      disposition?: string | null;
    }>;
  }>;
  upcomingContract?: {
    id: string;
    next_delivery_date: string;
    professional_contract_lines?: Array<{
      product_name: string;
      quantity_grams: number;
    }> | null;
  } | null;
  setPassword: boolean;
  next: string;
  mfa: AccountMfaState | null;
};

export type AccountActionFeedback = {
  ok?: boolean;
  message?: string;
  scope?: string;
  confirmationId?: string;
  mfaEnrollment?: { factorId: string; qrCode: string; secret: string };
};

type AccountMutationFormProps = PropsWithChildren<{
  action: string;
  className?: string;
  method: "post";
  onSubmit?: FormEventHandler<HTMLFormElement>;
}>;

function AccountMutationForm({
  drawer,
  ...props
}: AccountMutationFormProps & { drawer: boolean }) {
  const fetcher = useFetcher<AccountActionFeedback>({
    key: "account-drawer-actions",
  });
  return drawer ? <fetcher.Form {...props} /> : <Form {...props} />;
}

function ProfessionalProfileConfirmation({
  english,
  message,
}: {
  english: boolean;
  message: string;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      className="account-password-reset-modal professional-profile-confirmation-modal"
      open
      aria-labelledby="professional-profile-confirmation-title"
    >
      <div className="account-password-reset-modal__card professional-profile-confirmation-modal__card">
        <p className="eyebrow">Zen Coffee Lab</p>
        <h2 id="professional-profile-confirmation-title">
          {english
            ? "Professional details saved."
            : "Informations professionnelles enregistrées."}
        </h2>
        <p>{message}</p>
        <button
          className="button button--dark"
          type="button"
          onClick={() => setOpen(false)}
        >
          {english ? "Close" : "Fermer"}
        </button>
      </div>
    </dialog>
  );
}

export function AccountNavigation({
  english,
  orderCount,
  addressCount,
  professional = false,
  contractual = false,
  documentCount = 0,
  communicationCount = 0,
  activeSection = "orders",
  onSelect = () => undefined,
}: {
  english: boolean;
  orderCount: number;
  addressCount: number;
  professional?: boolean;
  contractual?: boolean;
  documentCount?: number;
  communicationCount?: number;
  activeSection?: AccountSectionId;
  onSelect?: (section: AccountSectionId) => void;
}) {
  const tab = (section: AccountSectionId, content: ReactNode) => (
    <button
      id={`account-tab-${section}`}
      className={activeSection === section ? "is-active" : undefined}
      type="button"
      role="tab"
      aria-selected={activeSection === section}
      aria-controls={`account-${section}`}
      onClick={() => onSelect(section)}
    >
      {content}
    </button>
  );
  return (
    <nav
      className="account-anchor-nav account-anchor-nav--tabs"
      role="tablist"
      aria-label={english ? "My account sections" : "Sections de mon compte"}
    >
      {contractual
        ? tab(
            "upcoming-order",
            <>
              <CalendarClock aria-hidden="true" />
              <span>
                <strong>
                  {english ? "Your next order" : "Votre prochaine commande"}
                </strong>
                <small>
                  {english ? "Contract delivery" : "Livraison contractuelle"}
                </small>
              </span>
              <ChevronRight aria-hidden="true" />
            </>,
          )
        : null}
      {tab(
        "orders",
        <>
          <Package aria-hidden="true" />
          <span>
            <strong>{english ? "Orders" : "Commandes"}</strong>
            <small>
              {english ? "Invoices and tracking" : "Factures et suivis"}
            </small>
          </span>
          <em>{orderCount}</em>
          <ChevronRight aria-hidden="true" />
        </>,
      )}
      {professional
        ? tab(
            "communication",
            <>
              <Mail aria-hidden="true" />
              <span>
                <strong>{english ? "Communication" : "Communication"}</strong>
                <small>
                  {english ? "Your email exchanges" : "Vos échanges par e-mail"}
                </small>
              </span>
              <em>{communicationCount}</em>
              <ChevronRight aria-hidden="true" />
            </>,
          )
        : null}
      {professional
        ? tab(
            "documents",
            <>
              <FileText aria-hidden="true" />
              <span>
                <strong>{english ? "Documents" : "Documents"}</strong>
                <small>
                  {english ? "Quotes and invoices" : "Devis et factures"}
                </small>
              </span>
              <em>{documentCount}</em>
              <ChevronRight aria-hidden="true" />
            </>,
          )
        : null}
      {tab(
        "addresses",
        <>
          <MapPin aria-hidden="true" />
          <span>
            <strong>{english ? "Addresses" : "Adresses"}</strong>
            <small>
              {english ? "Saved delivery details" : "Coordonnées enregistrées"}
            </small>
          </span>
          <em>{addressCount}</em>
          <ChevronRight aria-hidden="true" />
        </>,
      )}
      {tab(
        "settings",
        <>
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>{english ? "Settings" : "Paramètres"}</strong>
            <small>
              {english ? "Access and security" : "Accès et sécurité"}
            </small>
          </span>
          <ChevronRight aria-hidden="true" />
        </>,
      )}
    </nav>
  );
}

function orderStatusLabel(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ["En attente de paiement", "Awaiting payment"],
    paid: ["Payée", "Paid"],
    preparing: ["En préparation", "Preparing"],
    ready_to_ship: ["Prête à expédier", "Ready to ship"],
    shipped: ["Expédiée", "Shipped"],
    delivered: ["Livrée", "Delivered"],
    canceled: ["Annulée", "Cancelled"],
    partially_refunded: ["Partiellement remboursée", "Partially refunded"],
    refunded: ["Remboursée", "Refunded"],
  };
  return labels[status]?.[english ? 1 : 0] ?? status;
}

function sectionVisibility(
  activeSection: AccountSectionId,
  section: AccountSectionId,
) {
  return activeSection !== section;
}

export function accountShippingCountryOptions(locale: Locale) {
  return [...SHIPPING_COUNTRY_CODES].toSorted((first, second) =>
    shippingCountryLabel(first, locale).localeCompare(
      shippingCountryLabel(second, locale),
      locale,
    ),
  );
}

function AccountMfaPanel({
  mfa,
  result,
  drawer,
  accountPath,
  english,
  prefix,
}: {
  mfa: AccountMfaState | null;
  result?: AccountActionFeedback | null;
  drawer: boolean;
  accountPath: string;
  english: boolean;
  prefix: string;
}) {
  const factor = mfa?.verifiedFactors[0];
  const enrollment = result?.mfaEnrollment;
  const codeId = `${prefix}-mfa-setup-code`;

  return (
    <div className="mfa-panel">
      <p className="eyebrow">
        {english ? "Optional protection" : "Protection facultative"}
      </p>
      <h3>
        {english ? "Two-factor authentication" : "Double authentification"}
      </h3>
      {factor ? (
        <>
          <span className="mfa-status mfa-status--success">
            {english ? "Active" : "Activée"}
          </span>
          <p>
            {english
              ? "A code from your authenticator is required when a new session opens this account."
              : "Un code de votre authentificateur est demandé lorsqu’une nouvelle session ouvre ce compte."}
          </p>
          <p>
            <small>
              {factor.friendlyName} ·{" "}
              {new Date(factor.createdAt).toLocaleDateString(
                english ? "en-GB" : "fr-FR",
              )}
            </small>
          </p>
          <AccountMutationForm
            drawer={drawer}
            method="post"
            action={accountPath}
            className="mfa-disable-form"
            onSubmit={(event) => {
              if (
                !window.confirm(
                  english
                    ? "Disable two-factor authentication?"
                    : "Désactiver la double authentification ?",
                )
              )
                event.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="mfa_unenroll" />
            <input type="hidden" name="factorId" value={factor.id} />
            <button className="ui-button ui-button--danger" type="submit">
              {english
                ? "Disable two-factor authentication"
                : "Désactiver la double authentification"}
            </button>
          </AccountMutationForm>
        </>
      ) : enrollment ? (
        <div className="mfa-enrollment">
          <p>
            {english
              ? "Scan this QR code with 2FAS, Google Authenticator or 1Password, then enter the generated code."
              : "Scannez ce QR code avec 2FAS, Google Authenticator ou 1Password, puis saisissez le code généré."}
          </p>
          <img
            className="mfa-qr"
            src={enrollment.qrCode}
            alt={
              english
                ? "QR code for Zen Coffee Lab two-factor authentication"
                : "QR code pour la double authentification Zen Coffee Lab"
            }
            width="240"
            height="240"
          />
          <p>
            {english ? "Manual key:" : "Clé manuelle :"}{" "}
            <code className="mfa-secret">{enrollment.secret}</code>
          </p>
          <AccountMutationForm
            drawer={drawer}
            method="post"
            action={accountPath}
            className="mfa-code-form"
          >
            <input type="hidden" name="intent" value="mfa_verify" />
            <input type="hidden" name="purpose" value="setup" />
            <input type="hidden" name="factorId" value={enrollment.factorId} />
            <div className="field">
              <label htmlFor={codeId}>
                {english ? "Six-digit code" : "Code à six chiffres"}
                <input
                  id={codeId}
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                />
              </label>
            </div>
            <button className="button button--dark" type="submit">
              {english ? "Confirm activation" : "Confirmer l’activation"}
            </button>
          </AccountMutationForm>
        </div>
      ) : (
        <>
          <p>
            {english
              ? "Add an authenticator code after your password. This protection is optional and can be disabled here later."
              : "Ajoutez un code d’authentificateur après votre mot de passe. Cette protection est facultative et pourra être désactivée ici ultérieurement."}
          </p>
          <AccountMutationForm
            drawer={drawer}
            method="post"
            action={accountPath}
            className="mfa-enable-form"
          >
            <input type="hidden" name="intent" value="mfa_enroll" />
            <button className="ui-button ui-button--outline" type="submit">
              <ShieldCheck aria-hidden="true" />
              {english
                ? "Enable two-factor authentication"
                : "Activer la double authentification"}
            </button>
          </AccountMutationForm>
        </>
      )}
    </div>
  );
}

function ProfessionalAccountForm({
  application,
  drawer,
  accountPath,
  locale,
}: {
  application: AccountProfessionalApplication;
  drawer: boolean;
  accountPath: string;
  locale: Locale;
}) {
  const english = locale === "en-GB";
  const countries = accountShippingCountryOptions(locale);
  const billing = application.billing_address ?? {};
  const delivery = application.delivery_address ?? {};
  return (
    <AccountMutationForm
      drawer={drawer}
      method="post"
      action={accountPath}
      className="account-panel account-form professional-account-form"
    >
      <input type="hidden" name="intent" value="update_professional_profile" />
      <div className="account-form__heading">
        <div>
          <p className="eyebrow">
            {english ? "Professional account" : "Compte professionnel"}
          </p>
          <h3>
            {english
              ? "Your business details"
              : "Vos informations professionnelles"}
          </h3>
        </div>
        <UserRound aria-hidden="true" />
      </div>
      <div className="form-grid">
        <p className="professional-application-section-heading field--wide">
          {english ? "Identity" : "Identité"}
        </p>
        <div className="field professional-application-identity-field">
          <label>
            {english ? "Country" : "Pays"}
            <select
              name="countryCode"
              required
              defaultValue={application.country_code}
              disabled
            >
              {countries.map((countryCode) => (
                <option key={countryCode} value={countryCode}>
                  {shippingCountryLabel(countryCode, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field professional-application-identity-field">
          <label>
            {application.country_code === "FR"
              ? "SIRET"
              : "Company registration number"}
            <input
              name="companyRegistrationNumber"
              required
              maxLength={80}
              readOnly
              defaultValue={application.company_registration_number}
            />
          </label>
        </div>
        <div className="field professional-application-identity-field">
          <label>
            {english ? "Company" : "Raison sociale"}
            <input
              name="companyName"
              required
              autoComplete="organization"
              readOnly
              defaultValue={application.company_name}
            />
          </label>
        </div>
        <div className="field professional-application-identity-field">
          <label>
            {english ? "VAT number" : "N° de TVA intracommunautaire"}
            <input
              name="vatNumber"
              maxLength={40}
              readOnly
              defaultValue={application.vat_number ?? ""}
            />
          </label>
        </div>
        <div className="field professional-application-identity-field">
          <label>
            {english ? "Business type" : "Activité"}
            <select
              name="businessType"
              required
              defaultValue={application.business_type}
              disabled
            >
              <option>Coffee shop</option>
              <option>Restaurant</option>
              <option>Revendeur</option>
              <option>Distributeur</option>
              <option>Autre</option>
            </select>
          </label>
        </div>
        <div className="field professional-application-identity-field">
          <label>
            {english ? "Monthly volume" : "Volume mensuel"}
            <select
              name="monthlyVolume"
              required
              defaultValue={application.monthly_volume}
              disabled
            >
              <option>1-10 kg</option>
              <option>11-50 kg</option>
              <option>51-100 kg</option>
              <option>100+ kg</option>
            </select>
          </label>
        </div>
        <div className="field field--wide professional-application-address">
          <p>{english ? "Billing address" : "Adresse de facturation"}</p>
          <div className="form-grid">
            <div className="field">
              <label>
                {english ? "Last name" : "Nom"}
                <input
                  name="lastName"
                  required
                  autoComplete="family-name"
                  defaultValue={application.last_name}
                />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "First name" : "Prénom"}
                <input
                  name="firstName"
                  required
                  autoComplete="given-name"
                  defaultValue={application.first_name}
                />
              </label>
            </div>
            <div className="field field--wide">
              <label>
                {english ? "Number and street" : "Numéro et voie"}
                <input
                  name="billingLine1"
                  required
                  autoComplete="address-line1"
                  defaultValue={billing.line1 ?? ""}
                />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Postcode" : "Code postal"}
                <input
                  name="billingPostalCode"
                  required
                  autoComplete="postal-code"
                  defaultValue={billing.postalCode ?? ""}
                />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "City" : "Ville"}
                <input
                  name="billingCity"
                  required
                  autoComplete="address-level2"
                  defaultValue={billing.city ?? ""}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="field field--wide professional-application-address professional-application-delivery-address">
          <p>
            {english
              ? "Delivery address (leave blank to use billing address)"
              : "Adresse de livraison (laissez vide pour utiliser l’adresse de facturation)"}
          </p>
          <div className="form-grid">
            <div className="field">
              <label>
                {english ? "Last name" : "Nom"}
                <input
                  name="deliveryLastName"
                  autoComplete="shipping family-name"
                  defaultValue={delivery.lastName ?? ""}
                />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "First name" : "Prénom"}
                <input
                  name="deliveryFirstName"
                  autoComplete="shipping given-name"
                  defaultValue={delivery.firstName ?? ""}
                />
              </label>
            </div>
            <div className="field field--wide">
              <label>
                {english ? "Number and street" : "Numéro et voie"}
                <input
                  name="deliveryLine1"
                  autoComplete="shipping address-line1"
                  defaultValue={delivery.line1 ?? ""}
                />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Postcode" : "Code postal"}
                <input
                  name="deliveryPostalCode"
                  autoComplete="shipping postal-code"
                  defaultValue={delivery.postalCode ?? ""}
                />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "City" : "Ville"}
                <input
                  name="deliveryCity"
                  autoComplete="shipping address-level2"
                  defaultValue={delivery.city ?? ""}
                />
              </label>
            </div>
          </div>
        </div>
        <p className="professional-application-section-heading professional-application-section-heading--separated field--wide">
          {english ? "Contact" : "Contact"}
        </p>
        <div className="field">
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={application.email}
            />
          </label>
        </div>
        <div className="field">
          <label>
            {english
              ? "Electronic invoicing address"
              : "Adresse de facturation électronique"}
            <input
              name="electronicBillingAddress"
              maxLength={254}
              defaultValue={application.electronic_billing_address ?? ""}
            />
          </label>
        </div>
        <div className="field">
          <label>
            {english ? "Phone" : "Téléphone"}
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={application.phone ?? ""}
            />
          </label>
        </div>
        <div className="field field--wide professional-application-comment professional-application-section-heading--separated">
          <label>
            {english ? "Additional information" : "Information complémentaire"}
            <textarea
              name="comment"
              rows={4}
              maxLength={2_000}
              defaultValue={application.comment ?? ""}
            />
          </label>
        </div>
      </div>
      <button className="button button--dark" type="submit">
        {english
          ? "Save professional details"
          : "Enregistrer les informations professionnelles"}
      </button>
    </AccountMutationForm>
  );
}

function AccountSections({
  data,
  result,
  mode,
  activeSection,
  onNavigate,
}: {
  data: AccountDashboardData;
  result?: AccountActionFeedback | null;
  mode: "page" | "drawer";
  activeSection: AccountSectionId;
  onNavigate?: () => void;
}) {
  const {
    locale,
    viewer,
    orders,
    addresses,
    professionalApplication,
    professionalQuotes = [],
    professionalMessages = [],
    upcomingContract,
    setPassword,
    next,
    mfa,
  } = data;
  const english = locale === "en-GB";
  const drawer = mode === "drawer";
  const prefix = drawer ? "account-drawer" : "account";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const professional = viewer.profile?.professional_status === "approved";
  const passwordResetResult =
    result?.scope === "password_reset" ? result : null;
  const professionalProfileResult =
    result?.scope === "professional_profile" ? result : null;
  const shippingCountries = accountShippingCountryOptions(locale);

  return (
    <main className="account-sections">
      {result?.message &&
      !passwordResetResult &&
      !professionalProfileResult?.ok ? (
        <p
          className={result.ok ? "form-message" : "form-message form-error"}
          role="status"
        >
          {result.message}
        </p>
      ) : null}
      {professionalProfileResult?.ok && professionalProfileResult.message ? (
        <ProfessionalProfileConfirmation
          key={
            professionalProfileResult.confirmationId ??
            professionalProfileResult.message
          }
          english={english}
          message={professionalProfileResult.message}
        />
      ) : null}

      <section
        className="account-section"
        id={`${prefix}-orders`}
        aria-labelledby={
          drawer ? "account-drawer-tab-orders" : "account-tab-orders"
        }
        role="tabpanel"
        hidden={sectionVisibility(activeSection, "orders")}
      >
        <div className="account-section__heading">
          <div>
            <p className="eyebrow">{english ? "History" : "Historique"}</p>
            <h2 id={`${prefix}-orders-title`}>
              {english ? "Your orders" : "Vos commandes"}
            </h2>
          </div>
          <span>
            {orders.length}{" "}
            {english
              ? orders.length === 1
                ? "order"
                : "orders"
              : orders.length === 1
                ? "commande"
                : "commandes"}
          </span>
        </div>
        {orders.length ? (
          <div className="account-panel account-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>{english ? "Order" : "Commande"}</th>
                  <th>Date</th>
                  <th>{english ? "Status" : "Statut"}</th>
                  <th>Total</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link
                        className="account-order-link"
                        to={`${accountPath}/${english ? "orders" : "commandes"}/${order.id}`}
                        onClick={onNavigate}
                      >
                        <strong>{order.order_number}</strong>
                        <span>
                          {english ? "View details" : "Voir le détail"}
                        </span>
                      </Link>
                    </td>
                    <td>
                      {new Date(order.created_at).toLocaleDateString(locale)}
                    </td>
                    <td>
                      <span className="ui-badge account-order-status">
                        {orderStatusLabel(order.status, english)}
                      </span>
                    </td>
                    <td>
                      <strong>{formatMoney(order.total_cents, locale)}</strong>
                    </td>
                    <td>
                      <div className="account-order-links">
                        {order.paid_at ? (
                          <a
                            className="text-link"
                            href={`/api/orders/${order.id}/invoice`}
                          >
                            {english ? "Invoice PDF" : "Facture PDF"}
                          </a>
                        ) : (
                          "—"
                        )}
                        {order.shipments?.[0]?.tracking_url ? (
                          <a
                            className="text-link"
                            href={order.shipments[0].tracking_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {english ? "Track" : "Suivre"}
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="account-panel account-empty-state">
            <Package aria-hidden="true" />
            <div>
              <h3>
                {english ? "No orders yet" : "Aucune commande pour le moment"}
              </h3>
              <p>
                {english
                  ? "Your paid orders, invoices and tracking will appear here."
                  : "Vos commandes payées, factures et suivis apparaîtront ici."}
              </p>
            </div>
            <Link
              className="button button--dark"
              to={english ? "/en/shop" : "/boutique"}
              onClick={onNavigate}
            >
              {english ? "Discover our coffees" : "Découvrir nos cafés"}
            </Link>
          </div>
        )}
      </section>

      {viewer.profile?.professional_account_type === "contractual" ? (
        <section
          className="account-section"
          id={`${prefix}-upcoming-order`}
          aria-labelledby={
            drawer
              ? "account-drawer-tab-upcoming-order"
              : "account-tab-upcoming-order"
          }
          role="tabpanel"
          hidden={sectionVisibility(activeSection, "upcoming-order")}
        >
          <div className="account-section__heading">
            <div>
              <p className="eyebrow">
                {english ? "Contract delivery" : "Livraison contractuelle"}
              </p>
              <h2 id={`${prefix}-upcoming-order-title`}>
                {english ? "Your next order" : "Votre prochaine commande"}
              </h2>
            </div>
          </div>
          {upcomingContract ? (
            <div className="account-panel">
              <p>
                <strong>
                  {english ? "Expected delivery:" : "Livraison prévue :"}
                </strong>{" "}
                {new Date(
                  `${upcomingContract.next_delivery_date}T12:00:00`,
                ).toLocaleDateString(locale, { dateStyle: "long" })}
              </p>
              <div className="account-order-lines">
                {upcomingContract.professional_contract_lines?.map((line) => (
                  <article key={`${line.product_name}-${line.quantity_grams}`}>
                    <strong>{line.product_name}</strong>
                    <span>
                      {line.quantity_grams >= 1_000
                        ? `${line.quantity_grams / 1_000} kg`
                        : `${line.quantity_grams} g`}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="account-panel account-empty-state">
              <CalendarClock aria-hidden="true" />
              <div>
                <h3>
                  {english
                    ? "No order planned yet"
                    : "Aucune commande prévue pour le moment"}
                </h3>
                <p>
                  {english
                    ? "Your next contract delivery will appear here once your contract has been created."
                    : "Votre prochaine livraison apparaîtra ici dès que votre contrat aura été créé."}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {professional ? (
        <section
          className="account-section"
          id={`${prefix}-documents`}
          aria-labelledby={
            drawer ? "account-drawer-tab-documents" : "account-tab-documents"
          }
          role="tabpanel"
          hidden={sectionVisibility(activeSection, "documents")}
        >
          <div className="account-section__heading">
            <div>
              <p className="eyebrow">
                {english ? "Private archive" : "Espace privé"}
              </p>
              <h2 id={`${prefix}-documents-title`}>
                {english ? "Documents" : "Documents"}
              </h2>
            </div>
            <span>
              {orders.filter((order) => order.paid_at).length +
                professionalQuotes.length}
            </span>
          </div>
          <div className="account-panel account-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>{english ? "Document" : "Document"}</th>
                  <th>Date</th>
                  <th>{english ? "Status" : "Statut"}</th>
                  <th>{english ? "Amount" : "Montant"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter((order) => order.paid_at)
                  .map((order) => (
                    <tr key={`invoice-${order.id}`}>
                      <td>
                        <strong>
                          {english ? "Invoice" : "Facture"} {order.order_number}
                        </strong>
                      </td>
                      <td>
                        {new Date(
                          order.paid_at ?? order.created_at,
                        ).toLocaleDateString(locale)}
                      </td>
                      <td>{english ? "Available" : "Disponible"}</td>
                      <td>{formatMoney(order.total_cents, locale)}</td>
                      <td>
                        <a
                          className="text-link"
                          href={`/api/orders/${order.id}/invoice`}
                        >
                          {english ? "Open" : "Ouvrir"}
                        </a>
                      </td>
                    </tr>
                  ))}
                {professionalQuotes.map((quote) => (
                  <tr key={`quote-${quote.id}`}>
                    <td>
                      <strong>
                        {english ? "Quote" : "Devis"} {quote.quote_number}
                      </strong>
                    </td>
                    <td>
                      {new Date(quote.created_at).toLocaleDateString(locale)}
                    </td>
                    <td>{quote.status}</td>
                    <td>{formatMoney(quote.total_cents, locale)}</td>
                    <td>
                      <a
                        className="text-link"
                        href={`/api/professional-quotes/${quote.id}/pdf`}
                      >
                        {english ? "Open" : "Ouvrir"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.some((order) => order.paid_at) ||
            professionalQuotes.length ? null : (
              <p className="admin-empty-state">
                {english
                  ? "No document is available yet."
                  : "Aucun document n’est disponible pour le moment."}
              </p>
            )}
          </div>
        </section>
      ) : null}

      {professional ? (
        <section
          className="account-section"
          id={`${prefix}-communication`}
          aria-labelledby={
            drawer
              ? "account-drawer-tab-communication"
              : "account-tab-communication"
          }
          role="tabpanel"
          hidden={sectionVisibility(activeSection, "communication")}
        >
          <div className="account-section__heading">
            <div>
              <p className="eyebrow">
                {english ? "Email exchanges" : "Échanges par e-mail"}
              </p>
              <h2 id={`${prefix}-communication-title`}>
                {english ? "Communication" : "Communication"}
              </h2>
            </div>
            <span>{professionalMessages.length}</span>
          </div>
          <div className="account-communication-list">
            {professionalMessages.map((message) => (
              <article className="account-panel" key={message.id}>
                <div>
                  <p className="eyebrow">
                    {message.direction === "outbound"
                      ? english
                        ? "Sent by Zen Coffee Lab"
                        : "Envoyé par Zen Coffee Lab"
                      : english
                        ? "Your message"
                        : "Votre message"}
                  </p>
                  <h3>{message.subject}</h3>
                  <small>
                    {new Date(
                      message.sent_at ?? message.created_at,
                    ).toLocaleString(locale)}
                  </small>
                  <p>{message.text_body || "—"}</p>
                </div>
                {message.admin_mail_attachments?.filter((attachment) => attachment.disposition !== "inline" || !attachment.content_id).length ? (
                  <ul className="account-mail-attachments" aria-label={english ? "Attachments" : "Pièces jointes"}>
                    {message.admin_mail_attachments.filter((attachment) => attachment.disposition !== "inline" || !attachment.content_id).map((attachment) => (
                      <li key={attachment.id}>
                        <a href={`${english ? "/en/my-account/messaging" : "/mon-compte/messagerie"}/${message.id}/${english ? "attachments" : "pieces-jointes"}/${attachment.id}`}>
                          <Paperclip aria-hidden="true" />
                          {attachment.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <details className="account-communication-reply-toggle">
                  <summary className="ui-button ui-button--ghost ui-button--sm">
                    <Reply aria-hidden="true" />
                    {english ? "Reply" : "Répondre"}
                  </summary>
                <AccountMutationForm
                  drawer={drawer}
                  method="post"
                  action={accountPath}
                  className="account-communication-reply"
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="reply_professional_message"
                  />
                  <input type="hidden" name="messageId" value={message.id} />
                  <label>
                    {english ? "Reply" : "Répondre"}
                    <textarea name="body" rows={3} maxLength={5_000} required />
                  </label>
                  <button
                    className="ui-button ui-button--ghost ui-button--sm"
                    type="submit"
                  >
                    <Reply aria-hidden="true" />
                    {english ? "Send" : "Envoyer"}
                  </button>
                </AccountMutationForm>
                </details>
              </article>
            ))}
          </div>
          {professionalMessages.length ? null : (
            <div className="account-panel account-empty-state">
              <Mail aria-hidden="true" />
              <div>
                <h3>
                  {english ? "No message yet" : "Aucun échange pour le moment"}
                </h3>
                <p>
                  {english
                    ? "Your professional email exchanges will appear here."
                    : "Vos échanges professionnels par e-mail apparaîtront ici."}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section
        className="account-section"
        id={`${prefix}-addresses`}
        aria-labelledby={
          drawer ? "account-drawer-tab-addresses" : "account-tab-addresses"
        }
        role="tabpanel"
        hidden={sectionVisibility(activeSection, "addresses")}
      >
        <div className="account-section__heading">
          <div>
            <p className="eyebrow">
              {english ? "Saved details" : "Coordonnées enregistrées"}
            </p>
            <h2 id={`${prefix}-addresses-title`}>
              {english ? "Your addresses" : "Vos adresses"}
            </h2>
          </div>
          <span>
            {addresses.length}{" "}
            {english
              ? addresses.length === 1
                ? "address"
                : "addresses"
              : addresses.length === 1
                ? "adresse"
                : "adresses"}
          </span>
        </div>
        {professionalApplication ? (
          <ProfessionalAccountForm
            application={professionalApplication}
            drawer={drawer}
            accountPath={accountPath}
            locale={locale}
          />
        ) : null}
        {addresses.length ? (
          <div className="account-address-grid">
            {addresses.map((address) => (
              <article
                className="account-panel account-address-card"
                key={address.id}
              >
                <div className="account-address-card__icon">
                  <MapPin aria-hidden="true" />
                </div>
                <div>
                  <p className="eyebrow">
                    {address.label ||
                      (english ? "Delivery address" : "Adresse de livraison")}
                  </p>
                  <h3>
                    {address.first_name} {address.last_name}
                  </h3>
                  <p>
                    {address.company ? (
                      <>
                        {address.company}
                        <br />
                      </>
                    ) : null}
                    {address.line1}
                    <br />
                    {address.line2 ? (
                      <>
                        {address.line2}
                        <br />
                      </>
                    ) : null}
                    {address.postal_code} {address.city}
                    <br />
                    {address.country_code}
                    {address.phone ? <> · {address.phone}</> : null}
                  </p>
                </div>
                <AccountMutationForm
                  drawer={drawer}
                  method="post"
                  action={accountPath}
                >
                  <input type="hidden" name="intent" value="delete_address" />
                  <input type="hidden" name="addressId" value={address.id} />
                  <button
                    className="ui-button ui-button--ghost ui-button--sm"
                    type="submit"
                  >
                    {english ? "Delete" : "Supprimer"}
                  </button>
                </AccountMutationForm>
              </article>
            ))}
          </div>
        ) : null}
        <AccountMutationForm
          drawer={drawer}
          method="post"
          action={accountPath}
          className="account-panel account-form"
        >
          <input type="hidden" name="intent" value="save_address" />
          <div className="account-form__heading">
            <div>
              <p className="eyebrow">
                {english
                  ? "New delivery address"
                  : "Nouvelle adresse de livraison"}
              </p>
              <h3>{english ? "Add an address" : "Ajouter une adresse"}</h3>
            </div>
            <MapPin aria-hidden="true" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>
                {english ? "Label" : "Libellé"}
                <input name="label" placeholder={english ? "Home" : "Maison"} />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Company" : "Société"}
                <input name="company" />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "First name" : "Prénom"}
                <input name="firstName" required autoComplete="given-name" />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Last name" : "Nom"}
                <input name="lastName" required autoComplete="family-name" />
              </label>
            </div>
            <div className="field field--wide">
              <label>
                {english ? "Address" : "Adresse"}
                <AddressAutocomplete locale={locale} />
              </label>
            </div>
            <div className="field field--wide">
              <label>
                {english ? "Address line 2" : "Complément"}
                <input name="line2" autoComplete="address-line2" />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Postcode" : "Code postal"}
                <input name="postalCode" required autoComplete="postal-code" />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "City" : "Ville"}
                <input name="city" required autoComplete="address-level2" />
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Country" : "Pays"}
                <select
                  name="countryCode"
                  defaultValue="FR"
                  required
                  autoComplete="country"
                >
                  {shippingCountries.map((countryCode) => (
                    <option key={countryCode} value={countryCode}>
                      {shippingCountryLabel(countryCode, locale)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field">
              <label>
                {english ? "Phone" : "Téléphone"}
                <input name="phone" type="tel" autoComplete="tel" />
              </label>
            </div>
          </div>
          <button className="button button--dark" type="submit">
            {english ? "Save address" : "Enregistrer l’adresse"}
          </button>
        </AccountMutationForm>
      </section>

      <section
        className="account-section"
        id={`${prefix}-settings`}
        aria-labelledby={
          drawer ? "account-drawer-tab-settings" : "account-tab-settings"
        }
        role="tabpanel"
        hidden={sectionVisibility(activeSection, "settings")}
      >
        <div className="account-section__heading">
          <div>
            <p className="eyebrow">{english ? "Access" : "Accès"}</p>
            <h2 id={`${prefix}-settings-title`}>
              {english ? "Settings & security" : "Paramètres & sécurité"}
            </h2>
          </div>
        </div>
        {setPassword ? (
          <AccountMutationForm
            drawer={drawer}
            method="post"
            action={accountPath}
            className="account-panel account-form account-password-form"
          >
            <input type="hidden" name="intent" value="update_password" />
            <input type="hidden" name="next" value={next} />
            <div className="account-form__heading">
              <div>
                <p className="eyebrow">
                  {english ? "Password" : "Mot de passe"}
                </p>
                <h3>
                  {english
                    ? "Choose your password"
                    : "Choisissez votre mot de passe"}
                </h3>
              </div>
              <ShieldCheck aria-hidden="true" />
            </div>
            <div className="field">
              <label>
                {english ? "New password" : "Nouveau mot de passe"}
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </label>
            </div>
            <button className="button button--dark" type="submit">
              {english ? "Save password" : "Enregistrer le mot de passe"}
            </button>
          </AccountMutationForm>
        ) : null}
        <AccountMfaPanel
          mfa={mfa}
          result={result}
          drawer={drawer}
          accountPath={accountPath}
          english={english}
          prefix={prefix}
        />
        <div className="account-panel account-settings-card">
          <div className="account-settings-card__identity">
            <span>
              <UserRound aria-hidden="true" />
            </span>
            <div>
              <small>{english ? "Login email" : "E-mail de connexion"}</small>
              <strong>{viewer.user.email}</strong>
              <small>
                {professional
                  ? english
                    ? "Approved professional account"
                    : "Compte professionnel validé"
                  : english
                    ? "Customer account"
                    : "Compte client"}
              </small>
            </div>
          </div>
          <div className="account-settings-actions">
            <AccountMutationForm
              drawer={drawer}
              method="post"
              action={accountPath}
            >
              <input type="hidden" name="intent" value="reset" />
              <input
                type="hidden"
                name="email"
                value={viewer.user.email ?? ""}
              />
              <input type="hidden" name="next" value="#account-settings" />
              <button className="ui-button ui-button--ghost" type="submit">
                {english
                  ? "Change password by email"
                  : "Modifier le mot de passe par e-mail"}
              </button>
            </AccountMutationForm>
            {drawer ? null : (
              <AccountMutationForm
                drawer={false}
                method="post"
                action={accountPath}
              >
                <input type="hidden" name="intent" value="logout" />
                <button className="ui-button ui-button--ghost" type="submit">
                  {english ? "Sign out" : "Se déconnecter"}
                </button>
              </AccountMutationForm>
            )}
          </div>
          {passwordResetResult?.message ? (
            <div
              className={`account-password-reset-feedback${passwordResetResult.ok ? " is-success" : " is-error"}`}
              role={passwordResetResult.ok ? "status" : "alert"}
              aria-live={passwordResetResult.ok ? "polite" : "assertive"}
            >
              {passwordResetResult.ok ? (
                <CircleCheck aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              <div>
                <strong>
                  {passwordResetResult.ok
                    ? english
                      ? "Email sent"
                      : "E-mail envoyé"
                    : english
                      ? "Unable to send"
                      : "Envoi impossible"}
                </strong>
                <p>{passwordResetResult.message}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export function AccountDashboard({
  data,
  result,
  mode = "page",
  activeSection = "orders",
  onNavigate,
}: {
  data: AccountDashboardData;
  result?: AccountActionFeedback | null;
  mode?: "page" | "drawer";
  activeSection?: AccountSectionId;
  onNavigate?: () => void;
}) {
  const {
    locale,
    viewer,
    orders,
    addresses,
    professionalQuotes = [],
    professionalMessages = [],
  } = data;
  const english = locale === "en-GB";
  const displayName = [viewer.profile?.first_name, viewer.profile?.last_name]
    .filter(Boolean)
    .join(" ");
  const initial = (viewer.profile?.first_name || viewer.user.email || "Z")
    .slice(0, 1)
    .toLocaleUpperCase(locale);
  const [activePageSection, setActivePageSection] = useState<AccountSectionId>(
    activeSection === "orders" && viewer.profile?.professional_status === "approved"
      ? "communication"
      : activeSection === "orders" && viewer.profile?.professional_account_type === "contractual"
        ? "upcoming-order"
        : activeSection,
  );
  const selectPageSection = (section: AccountSectionId) => {
    setActivePageSection(section);
    window.requestAnimationFrame(() => {
      const title = document.getElementById(`account-${section}-title`);
      (title?.closest(".account-section__heading") ?? title)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  useEffect(() => {
    if (mode !== "page" || !result?.ok || result.scope !== "professional_communication") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [mode, result]);

  if (mode === "drawer")
    return (
      <AccountSections
        data={data}
        result={result}
        mode={mode}
        activeSection={activeSection}
        onNavigate={onNavigate}
      />
    );

  return (
    <>
      <header className="page-hero account-hero">
        <p className="eyebrow">{english ? "Private space" : "Espace privé"}</p>
        <h1>
          {displayName
            ? english
              ? `Welcome, ${displayName}`
              : `Bienvenue, ${displayName}`
            : english
              ? "Welcome back"
              : "Bienvenue"}
        </h1>
        <p className="lede">
          {english
            ? "Your orders, addresses and preferences, all in one place."
            : "Vos commandes, vos adresses et vos préférences, réunies au même endroit."}
        </p>
      </header>
      <div className="page-shell account-page-shell">
        <aside className="account-sidebar">
          <div className="account-profile-card">
            <span aria-hidden="true">{initial}</span>
            <div>
              <small>{english ? "Signed in as" : "Connecté en tant que"}</small>
              <strong>{displayName || viewer.user.email}</strong>
              {displayName ? <small>{viewer.user.email}</small> : null}
            </div>
          </div>
          <AccountNavigation
            english={english}
            orderCount={orders.length}
            addressCount={addresses.length}
            professional={viewer.profile?.professional_status === "approved"}
            contractual={
              viewer.profile?.professional_account_type === "contractual"
            }
            documentCount={
              orders.filter((order) => order.paid_at).length +
              professionalQuotes.length
            }
            communicationCount={professionalMessages.length}
            activeSection={activePageSection}
            onSelect={selectPageSection}
          />
        </aside>
        <AccountSections
          data={data}
          result={result}
          mode={mode}
          activeSection={activePageSection}
        />
      </div>
    </>
  );
}
