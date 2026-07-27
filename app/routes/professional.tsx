import { ArrowRight, CircleCheck, LogIn } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { ContentBlocks } from "~/components/content-blocks";
import { getViewer } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const viewer = await getViewer(request);
  const professionalStatus = viewer?.profile?.professional_status ?? null;
  const approved = professionalStatus === "approved";
  const [products, content] = await Promise.all([
    approved ? getProducts({ status: "published", audience: "professional" }) : Promise.resolve([]),
    approved ? Promise.resolve(null) : getContentPage("professionnel", locale),
  ]);
  return { locale, approved, signedIn: Boolean(viewer), accountEmail: viewer?.user.email ?? null, professionalStatus, products: products.filter((product) => product.professionalEnabled && product.professionalStockKg - product.professionalStockReservedKg >= 1 && product.variants.length > 0), content };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Coffee for professionals | Zen Coffee Lab" : "Café pour professionnels | Zen Coffee Lab", data?.locale === "en-GB" ? "Specialty coffee and support for cafés, restaurants and resellers." : "Cafés de spécialité et accompagnement pour coffee shops, restaurants et revendeurs.", data?.locale === "en-GB" ? "/en/professional" : "/professionnel");

type ApplicationResponse = { ok?: boolean; message?: string; errors?: Record<string, string[]> };

export function ProfessionalApplicationSuccess({ english, signedIn, accountPath }: { english: boolean; signedIn: boolean; accountPath: string }) {
  return <section className="professional-application-success" role="status" aria-labelledby="professional-application-success-title">
    <span aria-hidden="true"><CircleCheck /></span>
    <p className="eyebrow">{english ? "Application sent" : "Demande envoyée"}</p>
    <h2 id="professional-application-success-title">{english ? "Thank you, we have received your application." : "Merci, votre demande a bien été prise en compte."}</h2>
    <p>{english ? "Our team will review it. You will receive an email as soon as a decision has been made." : "Notre équipe va maintenant l’étudier. Vous recevrez un e-mail dès qu’une décision aura été prise."}</p>
    <Link className="button button--dark" to={signedIn ? accountPath : (english ? "/en/shop" : "/boutique")}>{signedIn ? (english ? "View my account" : "Voir mon compte") : (english ? "Discover our coffees" : "Découvrir nos cafés")}<ArrowRight aria-hidden="true" /></Link>
  </section>;
}

export default function Professional() {
  const { locale, approved, signedIn, accountEmail, products, content } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const fetcher = useFetcher<ApplicationResponse>();
  const professionalPath = english ? "/en/professional" : "/professionnel";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const loginPath = `${accountPath}?next=${encodeURIComponent(professionalPath)}`;
  if (approved) return <section className="section page-shell professional-catalog" aria-label={english ? "Professional coffee catalogue" : "Catalogue de cafés professionnels"}>
    <h1 className="sr-only">{english ? "Professional coffees" : "Cafés professionnels"}</h1>
    {products.length > 0
      ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} audience="professional" quoteAdd />)}</div>
      : <div className="empty-state"><h2>{english ? "No professional coffee is currently available." : "Aucun café professionnel n’est disponible actuellement."}</h2></div>}
  </section>;
  return <>
    <header className="page-hero professional-hero"><p className="eyebrow">B2B · Zen Coffee Lab</p><h1>{content?.title ?? (english ? "Coffee made for your business" : "Du café pensé pour votre établissement")}</h1><p className="lede">{english ? "Traceable coffees, consistent profiles and direct support from the roaster." : "Des cafés traçables, des profils constants et un accompagnement direct par le torréfacteur."}</p><Link className="button button--dark professional-login-link" to={signedIn ? accountPath : loginPath}><LogIn aria-hidden="true" />{english ? "Sign in" : "Connexion"}</Link></header>
    <ContentBlocks blocks={content?.blocks} />
    <div className="professional-application-layout page-shell">
      <section className="steps professional-application-steps" aria-label={english ? "Professional account steps" : "Étapes du compte professionnel"}><article><span>01</span><h3>{english ? "Tell us about your business" : "Présentez votre activité"}</h3><p>{english ? "Complete the form in a few minutes." : "Complétez le formulaire en quelques minutes."}</p></article><article><span>02</span><h3>{english ? "Manual review" : "Validation manuelle"}</h3><p>{english ? "We review every request and get back to you." : "Nous étudions chaque demande et revenons vers vous."}</p></article><article><span>03</span><h3>{english ? "Secure access" : "Accès sécurisé"}</h3><p>{english ? "Set your password and access professional terms." : "Définissez votre mot de passe et accédez aux conditions pro."}</p></article></section>
      {fetcher.data?.ok ? <ProfessionalApplicationSuccess english={english} signedIn={signedIn} accountPath={accountPath} /> : <fetcher.Form className="form-card professional-application-form" method="post" action="/api/pro-applications">
        <h2>{english ? "Apply for an account" : "Demander un compte"}</h2><p>{english ? "All fields are required." : "Tous les champs sont obligatoires."}</p>
        {fetcher.data?.message ? <p className={fetcher.data.ok ? "form-message" : "form-message form-error"} role="status">{fetcher.data.message}</p> : null}
        <input type="hidden" name="locale" value={locale} /><div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <div className="form-grid">
          <div className="field field--wide"><label htmlFor="companyName">{english ? "Company name" : "Votre raison sociale"}</label><input id="companyName" name="companyName" required autoComplete="organization" /></div>
          <div className="field"><label htmlFor="lastName">{english ? "Last name" : "Nom"}</label><input id="lastName" name="lastName" required autoComplete="family-name" /></div>
          <div className="field"><label htmlFor="firstName">{english ? "First name" : "Prénom"}</label><input id="firstName" name="firstName" required autoComplete="given-name" /></div>
          {accountEmail ? null : <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>}
          <div className="field"><label htmlFor="phone">{english ? "Phone" : "Téléphone"}</label><input id="phone" name="phone" type="tel" required autoComplete="tel" /></div>
          <div className="field"><label htmlFor="businessType">Business</label><select id="businessType" name="businessType" required defaultValue=""><option value="" disabled>{english ? "Choose" : "Choisir"}</option><option>Coffee shop</option><option>Restaurant</option><option>Revendeur</option><option>Distributeur</option><option>Autre</option></select></div>
          <div className="field"><label htmlFor="monthlyVolume">{english ? "Monthly volume" : "Volume mensuel"}</label><select id="monthlyVolume" name="monthlyVolume" required defaultValue=""><option value="" disabled>{english ? "Choose" : "Choisir"}</option><option>1-10 kg</option><option>11-50 kg</option><option>51-100 kg</option><option>100+ kg</option></select></div>
          <label className="field--wide"><input name="privacyConsent" type="checkbox" value="true" required /> {english ? "I agree that my data will be used to process this application." : "J’accepte que mes données soient utilisées pour traiter cette demande."}</label>
        </div>
        <button className="button button--dark" type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state === "idle" ? (english ? "Send application" : "Envoyer la demande") : (english ? "Sending…" : "Envoi…")}</button>
      </fetcher.Form>}
    </div>
    <aside className="professional-banner"><p className="eyebrow">{english ? "A real relationship" : "Une vraie relation"}</p><h2>{english ? "Coffee is only the beginning." : "Le café n’est que le début."}</h2><p>{english ? "Recipes, calibration, team guidance and seasonal recommendations." : "Recettes, calibrage, accompagnement des équipes et recommandations de saison."}</p></aside>
  </>;
}
