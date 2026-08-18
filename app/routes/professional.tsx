import { ArrowRight, CircleCheck, LogIn } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { ContentBlocks } from "~/components/content-blocks";
import { SHIPPING_COUNTRY_CODES, shippingCountryLabel } from "~/domain/shipping-countries";
import { getViewer } from "~/lib/auth.server";
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
  const [content, connectedContent] = await Promise.all([
    viewer ? Promise.resolve(null) : getContentPage("professionnel", locale),
    approved || admin ? getContentPage("professionnel-connecte", locale) : Promise.resolve(null),
  ]);
  return { locale, approved, admin, signedIn: Boolean(viewer), accountEmail: viewer?.user.email ?? null, professionalStatus, content, connectedContent };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Coffee for professionals | Zen Coffee Lab" : "Café pour professionnels | Zen Coffee Lab", data?.locale === "en-GB" ? "Specialty coffee and support for cafés, restaurants and resellers." : "Cafés de spécialité et accompagnement pour coffee shops, restaurants et revendeurs.", data?.locale === "en-GB" ? "/en/professional" : "/professionnel");

type ApplicationResponse = { ok?: boolean; message?: string; errors?: Record<string, string[]> };

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

function ProfessionalConnectedPage({ english, content }: { english: boolean; content: { blocks: Array<{ type?: unknown; content?: unknown }> } | null }) {
  const copy = getProfessionalConnectedPageContent(english ? "en-GB" : "fr-FR", content?.blocks);
  return <>
    <header className="page-hero professional-hero professional-hero--connected"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="lede">{copy.lede}</p></header>
    <section className="professional-connected-layout page-shell" aria-label={english ? "Professional next steps" : "Prochaines étapes professionnelles"}>
      <section className="steps professional-connected-steps" aria-label={english ? "Professional account steps" : "Étapes du compte professionnel"}>{copy.steps.map((step, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</section>
      <section className="professional-connected-actions"><ContentBlocks blocks={content?.blocks} className="professional-connected-content" /><article><p>{copy.shopText}</p><Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{copy.shopButton}<ArrowRight aria-hidden="true" /></Link></article><article><p>{copy.contactText}</p><Link className="button button--dark" to={english ? "/en/contact" : "/contact"}>{copy.contactButton}<ArrowRight aria-hidden="true" /></Link></article><article><p>{copy.sampleText}</p><Link className="button button--dark" to={english ? "/en/professional/quote" : "/professionnel/devis"}>{copy.sampleButton}<ArrowRight aria-hidden="true" /></Link></article></section>
    </section>
    <aside className="professional-banner"><p className="eyebrow">{copy.bannerEyebrow}</p><h2>{copy.bannerTitle}</h2><p>{copy.bannerText}</p></aside>
  </>;
}

export default function Professional() {
  const { locale, approved, admin, signedIn, accountEmail, content, connectedContent } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const fetcher = useFetcher<ApplicationResponse>();
  const professionalPath = english ? "/en/professional" : "/professionnel";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const loginPath = `${accountPath}?next=${encodeURIComponent(professionalPath)}`;
  const pageContent = getProfessionalPageContent(english ? "en-GB" : "fr-FR", content?.blocks);
  if (approved || admin) return <ProfessionalConnectedPage english={english} content={connectedContent} />;
  return <>
    <header className="page-hero professional-hero"><p className="eyebrow">{pageContent.eyebrow}</p><h1>{content?.title ?? (english ? "Coffee made for your business" : "Du café pensé pour votre établissement")}</h1><p className="lede">{pageContent.lede}</p><ProfessionalLoginLink signedIn={signedIn} english={english} loginPath={loginPath} content={pageContent} /></header>
    {signedIn ? null : <ContentBlocks blocks={content?.blocks} />}
    <div className="professional-application-layout page-shell">
      <section className="steps professional-application-steps" aria-label={english ? "Professional account steps" : "Étapes du compte professionnel"}>{pageContent.steps.map((step, index) => <article key={index}><span>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</section>
      {fetcher.data?.ok ? <ProfessionalApplicationSuccess english={english} signedIn={signedIn} accountPath={accountPath} content={pageContent} /> : <fetcher.Form className="form-card professional-application-form" method="post" action="/api/pro-applications">
        <h2>{pageContent.applicationTitle}</h2><p>{pageContent.applicationIntro}</p>
        {fetcher.data?.message ? <p className={fetcher.data.ok ? "form-message" : "form-message form-error"} role="status">{fetcher.data.message}</p> : null}
        <input type="hidden" name="locale" value={locale} /><div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="companyName">{pageContent.fieldLabels.company}</label><input id="companyName" name="companyName" required autoComplete="organization" /></div>
          <div className="field"><label htmlFor="countryCode">{pageContent.fieldLabels.country}</label><select id="countryCode" name="countryCode" required autoComplete="country" defaultValue="FR"><option value="" disabled>{pageContent.fieldLabels.choose}</option>{[...SHIPPING_COUNTRY_CODES].toSorted((first, second) => shippingCountryLabel(first, locale).localeCompare(shippingCountryLabel(second, locale), locale)).map((code) => <option key={code} value={code}>{shippingCountryLabel(code, locale)}</option>)}</select></div>
          <div className="field"><label htmlFor="lastName">{pageContent.fieldLabels.lastName}</label><input id="lastName" name="lastName" required autoComplete="family-name" /></div>
          <div className="field"><label htmlFor="firstName">{pageContent.fieldLabels.firstName}</label><input id="firstName" name="firstName" required autoComplete="given-name" /></div>
          {accountEmail ? null : <div className="field"><label htmlFor="email">{pageContent.fieldLabels.email}</label><input id="email" name="email" type="email" required autoComplete="email" /></div>}
          <div className="field"><label htmlFor="phone">{pageContent.fieldLabels.phone}</label><input id="phone" name="phone" type="tel" required autoComplete="tel" /></div>
          <div className="field"><label htmlFor="businessType">{pageContent.fieldLabels.business}</label><select id="businessType" name="businessType" required defaultValue=""><option value="" disabled>{pageContent.fieldLabels.choose}</option><option>Coffee shop</option><option>Restaurant</option><option>Revendeur</option><option>Distributeur</option><option>Autre</option></select></div>
          <div className="field"><label htmlFor="monthlyVolume">{pageContent.fieldLabels.volume}</label><select id="monthlyVolume" name="monthlyVolume" required defaultValue=""><option value="" disabled>{pageContent.fieldLabels.choose}</option><option>1-10 kg</option><option>11-50 kg</option><option>51-100 kg</option><option>100+ kg</option></select></div>
        </div>
        <div className="field professional-application-comment"><label htmlFor="comment">{english ? "Comment (optional)" : "Commentaire (facultatif)"}</label><textarea id="comment" name="comment" rows={4} maxLength={2_000} /><small>{english ? "(if you have questions, a specific budget, a set date, etc.)" : "(si vous avez des questions, un budget précis, une date déterminée, etc.)"}</small></div>
        <label className="field--wide professional-application-privacy"><input name="privacyConsent" type="checkbox" value="true" required /> {pageContent.fieldLabels.privacy}</label>
        <button className="button button--dark" type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state === "idle" ? pageContent.submitLabel : pageContent.sendingLabel}</button>
      </fetcher.Form>}
    </div>
    <aside className="professional-banner"><p className="eyebrow">{pageContent.banner.eyebrow}</p><h2>{pageContent.banner.title}</h2><p>{pageContent.banner.text}</p></aside>
  </>;
}
