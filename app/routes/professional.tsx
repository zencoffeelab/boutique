import { ArrowRight, CircleCheck, LogIn } from "lucide-react";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData, useNavigate } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { ContentBlocks } from "~/components/content-blocks";
import { buildProductCartLine } from "~/domain/cart";
import type { Product } from "~/domain/types";
import { SHIPPING_COUNTRY_CODES, shippingCountryLabel } from "~/domain/shipping-countries";
import { getViewer } from "~/lib/auth.server";
import { getSampleSetProduct } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";
import { getProfessionalConnectedPageContent, getProfessionalPageContent } from "~/lib/professional-content";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const viewer = await getViewer(request);
  const professionalStatus = viewer?.profile?.professional_status ?? null;
  const approved = professionalStatus === "approved";
  const admin = viewer?.profile?.role === "admin";
  const [content, connectedContent, sampleSet] = await Promise.all([
    approved || admin ? Promise.resolve(null) : getContentPage("professionnel", locale),
    approved || admin ? getContentPage("professionnel-connecte", locale) : Promise.resolve(null),
    approved || admin ? getSampleSetProduct() : Promise.resolve(null),
  ]);
  return { locale, approved, admin, signedIn: Boolean(viewer), accountEmail: viewer?.user.email ?? null, professionalStatus, content, connectedContent, sampleSet };
}
export function headers() { return { "Cache-Control": "private, no-store" }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Coffee for professionals | Zen Coffee Lab" : "Café pour professionnels | Zen Coffee Lab", data?.locale === "en-GB" ? "Specialty coffee and support for cafés, restaurants and resellers." : "Cafés de spécialité et accompagnement pour coffee shops, restaurants et revendeurs.", data?.locale === "en-GB" ? "/en/professional" : "/professionnel");

type ApplicationResponse = { ok?: boolean; message?: string; errors?: Record<string, string[]> };

function RequiredMark() {
  return <span className="required-mark" aria-hidden="true">*</span>;
}

export function ProfessionalApplicationSuccess({ english, signedIn, accountPath, content: providedContent }: { english: boolean; signedIn: boolean; accountPath: string; content?: ReturnType<typeof getProfessionalPageContent> }) {
  const content = providedContent ?? getProfessionalPageContent(english ? "en-GB" : "fr-FR");
  return <section className="professional-application-success" role="status" aria-labelledby="professional-application-success-title">
    <span aria-hidden="true"><CircleCheck /></span>
    <p className="eyebrow">{content.success.eyebrow}</p>
    <h2 id="professional-application-success-title">{content.success.title}</h2>
    <p>{content.success.text}</p>
    <Link className="button button--dark" to={signedIn ? accountPath : (english ? "/en/shop" : "/boutique")}>{signedIn ? content.success.accountLabel : content.success.shopLabel}<ArrowRight aria-hidden="true" /></Link>
  </section>;
}

export function ProfessionalLoginLink({ signedIn, english, loginPath, content }: { signedIn: boolean; english: boolean; loginPath: string; content?: ReturnType<typeof getProfessionalPageContent> }) {
  if (signedIn) return null;
  return <Link className="button button--dark professional-login-link" to={loginPath}><LogIn aria-hidden="true" />{(content ?? getProfessionalPageContent(english ? "en-GB" : "fr-FR")).loginLabel}</Link>;
}

export function ProfessionalCatalogHeading({ english, content }: { english: boolean; content?: ReturnType<typeof getProfessionalPageContent> }) {
  const copy = content ?? getProfessionalPageContent(english ? "en-GB" : "fr-FR");
  return <header className="page-hero page-hero--listing">
    <p className="eyebrow">{copy.catalog.eyebrow}</p>
    <h1>{copy.catalog.title}</h1>
    <p className="lede">{copy.catalog.lede}</p>
  </header>;
}

function ProfessionalConnectedAction({ text, button, to }: { text: string; button: string; to: string }) {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim());
  const heading = headingIndex === -1 ? text : lines[headingIndex].trim();
  const descriptionLines = headingIndex === -1 ? [] : lines.slice(headingIndex + 1);
  const questionIndex = descriptionLines.findIndex((line) => line.trim());
  const question = questionIndex === -1 ? "" : descriptionLines[questionIndex].trim();
  const detail = questionIndex === -1 ? "" : descriptionLines.slice(questionIndex + 1).join("\n").trim();
  return <article><h3>{heading}</h3>{question ? <p className="professional-connected-actions__question">{question}</p> : null}{detail ? <p>{detail}</p> : null}<Link className="button button--dark" to={to}>{button}<ArrowRight aria-hidden="true" /></Link></article>;
}

function ProfessionalSampleSetAction({ text, button, sampleSet, english }: { text: string; button: string; sampleSet: Product | null; english: boolean }) {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim());
  const heading = headingIndex === -1 ? text : lines[headingIndex].trim();
  const descriptionLines = headingIndex === -1 ? [] : lines.slice(headingIndex + 1);
  const questionIndex = descriptionLines.findIndex((line) => line.trim());
  const question = questionIndex === -1 ? "" : descriptionLines[questionIndex].trim();
  const detail = questionIndex === -1 ? "" : descriptionLines.slice(questionIndex + 1).join("\n").trim();
  const { addItem, hydrated } = useCart();
  const navigate = useNavigate();
  const variant = sampleSet?.variants.find((item) => item.offers.some((offer) => offer.audience === "retail" && offer.active));
  const offer = variant?.offers.find((item) => item.audience === "retail" && item.active);
  const addSampleSet = () => {
    if (!sampleSet || !variant || !offer) return;
    addItem(buildProductCartLine({ product: sampleSet, variant, offer, audience: "retail", quantity: Math.max(1, offer.minimumQuantity) }));
    navigate(english ? "/en/cart" : "/panier");
  };
  return <article><h3>{heading}</h3>{question ? <p className="professional-connected-actions__question">{question}</p> : null}{detail ? <p>{detail}</p> : null}<button className="button button--dark" type="button" onClick={addSampleSet} disabled={!hydrated || !sampleSet || !variant || !offer}>{button}<ArrowRight aria-hidden="true" /></button></article>;
}

function ProfessionalConnectedPage({ english, content, sampleSet }: { english: boolean; content: { blocks: Array<{ type?: unknown; content?: unknown }> } | null; sampleSet: Product | null }) {
  const copy = getProfessionalConnectedPageContent(english ? "en-GB" : "fr-FR", content?.blocks);
  return <>
    <header className="page-hero professional-hero professional-hero--connected"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="lede">{copy.lede}</p></header>
    <section className="professional-connected-layout page-shell" aria-label={english ? "Professional next steps" : "Prochaines étapes professionnelles"}>
      <section className="steps professional-connected-steps" aria-label={english ? "Professional account steps" : "Étapes du compte professionnel"}>{copy.steps.map((step, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</section>
      <section className="professional-connected-actions"><ProfessionalConnectedAction text={copy.shopText} button={copy.shopButton} to={english ? "/en/shop" : "/boutique"} /><ProfessionalConnectedAction text={copy.contactText} button={copy.contactButton} to={english ? "/en/contact?professional=1" : "/contact?professional=1"} /><ProfessionalSampleSetAction text={copy.sampleText} button={copy.sampleButton} sampleSet={sampleSet} english={english} /></section>
    </section>
    <aside className="professional-banner professional-banner--connected"><p className="eyebrow">{copy.bannerEyebrow}</p><h2>{copy.bannerTitle}</h2><p>{copy.bannerText}</p></aside>
  </>;
}

export default function Professional() {
  const { locale, approved, admin, signedIn, accountEmail, content, connectedContent, sampleSet } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const fetcher = useFetcher<ApplicationResponse>();
  const [countryCode, setCountryCode] = useState("FR");
  const [deliveryAddressOpen, setDeliveryAddressOpen] = useState(false);
  const professionalPath = english ? "/en/professional" : "/professionnel";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const loginPath = `${accountPath}?next=${encodeURIComponent(professionalPath)}`;
  const pageContent = getProfessionalPageContent(english ? "en-GB" : "fr-FR", content?.blocks);
  if (approved || admin) return <ProfessionalConnectedPage english={english} content={connectedContent} sampleSet={sampleSet} />;
  return <>
    <header className="page-hero professional-hero"><p className="eyebrow">{pageContent.eyebrow}</p><h1>{content?.title ?? (english ? "Coffee made for your business" : "Du café pensé pour votre établissement")}</h1><p className="lede">{pageContent.lede}</p><ProfessionalLoginLink signedIn={signedIn} english={english} loginPath={loginPath} content={pageContent} /></header>
    <ContentBlocks blocks={content?.blocks} />
    <div className="professional-application-layout page-shell">
      <section className="steps professional-application-steps" aria-label={english ? "Professional account steps" : "Étapes du compte professionnel"}>{pageContent.steps.map((step, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</section>
      {fetcher.data?.ok ? <ProfessionalApplicationSuccess english={english} signedIn={signedIn} accountPath={accountPath} content={pageContent} /> : <fetcher.Form className="form-card professional-application-form" method="post" action="/api/pro-applications">
        <h2>{english ? "Request access" : "Demander un accès"}</h2>
        <p className="professional-application-required-note"><RequiredMark />{english ? "required fields" : "champs obligatoires"}</p>
        {fetcher.data?.message ? <p className={fetcher.data.ok ? "form-message" : "form-message form-error"} role="status">{fetcher.data.message}</p> : null}
        <input type="hidden" name="locale" value={locale} /><div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <div className="form-grid">
          <p className="professional-application-section-heading field--wide">{english ? "Identity" : "Identité"}</p>
          <div className="field"><label htmlFor="countryCode">{pageContent.fieldLabels.country}<RequiredMark /></label><select id="countryCode" name="countryCode" required autoComplete="country" value={countryCode} onChange={(event) => setCountryCode(event.currentTarget.value)}><option value="" disabled>{pageContent.fieldLabels.choose}</option>{[...SHIPPING_COUNTRY_CODES].toSorted((first, second) => shippingCountryLabel(first, locale).localeCompare(shippingCountryLabel(second, locale), locale)).map((code) => <option key={code} value={code}>{shippingCountryLabel(code, locale)}</option>)}</select></div>
          <div className="field"><label htmlFor="companyRegistrationNumber">{countryCode === "FR" ? "SIRET" : "Company registration number"}<RequiredMark /></label><input id="companyRegistrationNumber" name="companyRegistrationNumber" required maxLength={80} autoComplete="off" /></div>
          <div className="field"><label htmlFor="companyName">{pageContent.fieldLabels.company}<RequiredMark /></label><input id="companyName" name="companyName" required autoComplete="organization" /></div>
          <div className="field"><label htmlFor="vatNumber">{english ? "VAT number" : "N° de TVA Intracommunautaire"}</label><input id="vatNumber" name="vatNumber" maxLength={40} autoComplete="off" /></div>
          <div className="field"><label htmlFor="businessType">{pageContent.fieldLabels.business}<RequiredMark /></label><select id="businessType" name="businessType" required defaultValue=""><option value="" disabled>{pageContent.fieldLabels.choose}</option><option>Coffee shop</option><option>Restaurant</option><option>Revendeur</option><option>Distributeur</option><option>Autre</option></select></div>
          <div className="field"><label htmlFor="monthlyVolume">{pageContent.fieldLabels.volume}<RequiredMark /></label><select id="monthlyVolume" name="monthlyVolume" required defaultValue=""><option value="" disabled>{pageContent.fieldLabels.choose}</option><option>1-10 kg</option><option>11-50 kg</option><option>51-100 kg</option><option>100+ kg</option></select></div>
          <div className="field field--wide professional-application-address"><p>{english ? "Billing address" : "Adresse de facturation"}</p><div className="form-grid"><div className="field"><label htmlFor="lastName">{pageContent.fieldLabels.lastName}<RequiredMark /></label><input id="lastName" name="lastName" required autoComplete="family-name" /></div><div className="field"><label htmlFor="firstName">{pageContent.fieldLabels.firstName}<RequiredMark /></label><input id="firstName" name="firstName" required autoComplete="given-name" /></div><div className="field field--wide"><label htmlFor="billingLine1">{english ? "Number and street" : "Numéro et voie"}<RequiredMark /></label><input id="billingLine1" name="billingLine1" required autoComplete="address-line1" /></div><div className="field"><label htmlFor="billingPostalCode">{english ? "Postcode" : "Code postal"}<RequiredMark /></label><input id="billingPostalCode" name="billingPostalCode" required autoComplete="postal-code" /></div><div className="field"><label htmlFor="billingCity">{english ? "City" : "Ville"}<RequiredMark /></label><input id="billingCity" name="billingCity" required autoComplete="address-level2" /></div></div></div>
        </div>
        <button className="button button--dark professional-delivery-address-toggle" type="button" onClick={() => setDeliveryAddressOpen((open) => !open)} aria-expanded={deliveryAddressOpen}>{deliveryAddressOpen ? (english ? "Use billing address for delivery" : "Utiliser l'adresse de facturation pour la livraison") : (english ? "Add a delivery address" : "Ajouter une adresse de livraison")}</button>
        {deliveryAddressOpen ? <section className="professional-application-address professional-application-delivery-address"><p>{english ? "Delivery address" : "Adresse de livraison"}<RequiredMark /></p><div className="form-grid"><div className="field"><label htmlFor="deliveryLastName">{pageContent.fieldLabels.lastName}<RequiredMark /></label><input id="deliveryLastName" name="deliveryLastName" required autoComplete="shipping family-name" /></div><div className="field"><label htmlFor="deliveryFirstName">{pageContent.fieldLabels.firstName}<RequiredMark /></label><input id="deliveryFirstName" name="deliveryFirstName" required autoComplete="shipping given-name" /></div><div className="field field--wide"><label htmlFor="deliveryLine1">{english ? "Number and street" : "Numéro et voie"}<RequiredMark /></label><input id="deliveryLine1" name="deliveryLine1" required autoComplete="shipping address-line1" /></div><div className="field"><label htmlFor="deliveryPostalCode">{english ? "Postcode" : "Code postal"}<RequiredMark /></label><input id="deliveryPostalCode" name="deliveryPostalCode" required autoComplete="shipping postal-code" /></div><div className="field"><label htmlFor="deliveryCity">{english ? "City" : "Ville"}<RequiredMark /></label><input id="deliveryCity" name="deliveryCity" required autoComplete="shipping address-level2" /></div></div></section> : null}
        <div className="form-grid professional-application-contact">
          <p className="professional-application-section-heading professional-application-section-heading--separated field--wide">{english ? "Contact" : "Contact"}</p>
          {accountEmail ? null : <div className="field"><label htmlFor="email">{pageContent.fieldLabels.email}<RequiredMark /></label><input id="email" name="email" type="email" required autoComplete="email" /></div>}
          <div className="field"><label htmlFor="electronicBillingAddress">{english ? "Electronic invoicing address" : "Adresse de facturation électronique"}</label><input id="electronicBillingAddress" name="electronicBillingAddress" maxLength={254} autoComplete="off" /></div>
          <div className="field"><label htmlFor="phone">{pageContent.fieldLabels.phone}</label><input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
        </div>
        <div className="field professional-application-comment professional-application-section-heading--separated"><label htmlFor="comment">{english ? "Additional information" : "Information complémentaire"}</label><textarea id="comment" name="comment" rows={4} maxLength={2_000} /><small>{english ? "(if you have questions, a specific budget, a set date, etc.)" : "(si vous avez des questions, un budget précis, une date déterminée, etc.)"}</small></div>
        <label className="field--wide professional-application-privacy"><input name="privacyConsent" type="checkbox" value="true" required /> {pageContent.fieldLabels.privacy}<RequiredMark /></label>
        <button className="button button--dark" type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state === "idle" ? pageContent.submitLabel : pageContent.sendingLabel}</button>
      </fetcher.Form>}
    </div>
    <aside className="professional-banner"><p className="eyebrow">{pageContent.banner.eyebrow}</p><h2>{pageContent.banner.title}</h2><p>{pageContent.banner.text}</p></aside>
  </>;
}
