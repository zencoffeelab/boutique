import { CreditCard, Landmark } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { formatMoney } from "~/domain/money";
import { getViewer } from "~/lib/auth.server";
import { getLocale } from "~/lib/i18n";
import { createServiceSupabase } from "~/lib/supabase.server";
import { createProfessionalQuoteCheckout } from "~/services/professional-quotes.server";
import { captchaRejected, verifyPublicCaptcha } from "~/lib/antispam.server";

async function ownedQuote(request: Request, id?: string) {
  const viewer = await getViewer(request);
  const locale = getLocale(request);
  const accountPath = locale === "en-GB" ? "/en/my-account" : "/mon-compte";
  if (!viewer) throw redirect(`${accountPath}?next=${encodeURIComponent(new URL(request.url).pathname)}`);
  if (viewer.profile?.professional_status !== "approved") throw new Response("Professional access required.", { status: 403 });
  const client = createServiceSupabase();
  if (!client || !id) throw new Response("Quote unavailable.", { status: 503 });
  const { data: quote } = await client.from("professional_quotes").select("*,professional_quote_lines(*)").eq("id", id).eq("profile_id", viewer.user.id).maybeSingle();
  if (!quote) throw new Response("Quote not found.", { status: 404 });
  return { viewer, locale, quote };
}

export async function loader({ request, params }: LoaderFunctionArgs) { return ownedQuote(request, params.id); }
export async function action({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  if (!(await verifyPublicCaptcha(request, form))) return captchaRejected(getLocale(request));
  const { viewer, locale, quote } = await ownedQuote(request, params.id);
  const url = await createProfessionalQuoteCheckout({ quoteId: quote.id, profileId: viewer.user.id, email: viewer.user.email!, locale });
  return redirect(url);
}
export const meta: MetaFunction = () => [{ title: "Paiement du devis | Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

export default function ProfessionalQuotePayment() {
  const { locale, quote } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const payable = quote.status === "pending_payment" && new Date(quote.valid_until).getTime() > Date.now();
  return <section className="section page-shell quote-payment-page">
    <div><p className="eyebrow">{quote.quote_number}</p><h1>{english ? "Pay your quote" : "Régler votre devis"}</h1><p className="lede">{english ? "Choose card payment or SEPA bank transfer on the secure Stripe page." : "Choisissez le paiement par carte ou le virement bancaire SEPA sur la page sécurisée Stripe."}</p></div>
    <div className="ui-card quote-payment-card"><div className="quote-payment-methods"><span><CreditCard aria-hidden="true" />{english ? "Card" : "Carte bancaire"}</span><span><Landmark aria-hidden="true" />{english ? "SEPA bank transfer" : "Virement bancaire SEPA"}</span></div><strong>{formatMoney(quote.total_cents, locale)}</strong><p>{english ? "Valid until" : "Valable jusqu’au"} {new Date(quote.valid_until).toLocaleDateString(locale)}</p>{payable ? <Form method="post"><button className="button button--dark" type="submit">{english ? "Continue to secure payment" : "Continuer vers le paiement sécurisé"}</button></Form> : <p className="form-message">{quote.status === "paid" ? (english ? "This quote has been paid." : "Ce devis a été réglé.") : quote.status === "bank_transfer_pending" ? (english ? "Your bank transfer is pending." : "Votre virement bancaire est en attente.") : (english ? "This quote is no longer payable." : "Ce devis n’est plus payable.")}</p>}<a className="text-link" href={`/api/professional-quotes/${quote.id}/pdf`}>{english ? "Download quote PDF" : "Télécharger le devis PDF"}</a></div>
    <Link className="text-link" to={english ? "/en/my-account#account-professional-quotes" : "/mon-compte#account-professional-quotes"}>{english ? "Back to my account" : "Retour à mon compte"}</Link>
  </section>;
}
