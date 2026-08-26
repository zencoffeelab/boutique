import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { contactFormSchema } from "~/domain/schemas";
import { getContentPage } from "~/lib/content.server";
import { env } from "~/lib/env.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";
import { createServiceSupabase } from "~/lib/supabase.server";
import { contactAdminAlertEmail, contactMessageReceivedEmail } from "~/services/email-templates.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";
import { captchaRejected, verifyPublicCaptcha } from "~/lib/antispam.server";

export async function loader({ request }: LoaderFunctionArgs) { const locale = getLocale(request); return { locale, content: await getContentPage("contact", locale) }; }

type ContactActionResult = { ok: boolean; message: string; errors?: Record<string, string[]> };
const SUBJECT_LABELS = {
  "fr-FR": { order: "Une commande", coffee: "Un café", professional: "Un projet professionnel", other: "Autre demande" },
  "en-GB": { order: "An order", coffee: "A coffee", professional: "A professional project", other: "Another question" },
} as const;

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const raw = Object.fromEntries(await request.formData());
  const locale = raw.locale === "en-GB" ? "en-GB" : "fr-FR";
  if (!(await verifyPublicCaptcha(request, raw))) return captchaRejected(locale);
  const input = { ...raw, privacyConsent: raw.privacyConsent === "true" };
  const parsed = contactFormSchema.safeParse(input);
  const english = locale === "en-GB";
  if (!parsed.success) return data<ContactActionResult>({ ok: false, message: english ? "Please check the highlighted fields." : "Veuillez vérifier les champs du formulaire.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  if (parsed.data.website) return data<ContactActionResult>({ ok: true, message: english ? "Your message has been sent." : "Votre message a bien été envoyé." });
  const client = createServiceSupabase();
  if (!client) return data<ContactActionResult>({ ok: false, message: english ? "The contact form is temporarily unavailable." : "Le formulaire de contact est temporairement indisponible." }, { status: 503 });
  const { data: message, error } = await client.from("contact_messages").insert({ locale: parsed.data.locale, name: parsed.data.name, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone || null, subject: parsed.data.subject, message: parsed.data.message }).select("id").single();
  if (error || !message) return data<ContactActionResult>({ ok: false, message: english ? "Your message could not be saved. Please try again." : "Votre message n’a pas pu être enregistré. Veuillez réessayer." }, { status: 500 });
  try {
    const subjectLabel = SUBJECT_LABELS[parsed.data.locale][parsed.data.subject];
    const adminEmail = contactAdminAlertEmail({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone, subject: subjectLabel, message: parsed.data.message });
    const confirmationEmail = contactMessageReceivedEmail({ locale: parsed.data.locale, name: parsed.data.name, subject: subjectLabel });
    await enqueueNotification({ kind: "contact_message", to: env().ADMIN_NOTIFICATION_EMAIL, locale: "fr-FR", ...adminEmail, payload: { contactMessageId: message.id, replyTo: parsed.data.email }, dedupeKey: `contact-admin/${message.id}` });
    await enqueueNotification({ kind: "contact_confirmation", to: parsed.data.email, locale: parsed.data.locale, ...confirmationEmail, payload: { contactMessageId: message.id }, dedupeKey: `contact-confirmation/${message.id}` });
    dispatchNotificationQueue(context, "contact_notification_delivery_failed", 10);
  } catch (cause) {
    console.error("contact_notification_queue_failed", { message: cause instanceof Error ? cause.message : String(cause), contactMessageId: message.id });
  }
  return data<ContactActionResult>({ ok: true, message: english ? "Thank you. Your message has been sent and a confirmation email is on its way." : "Merci. Votre message a bien été envoyé et un e-mail de confirmation est en cours d’envoi." }, { status: 201 });
}

export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.content?.seoTitle ?? `Contact | Zen Coffee Lab`, data?.content?.seoDescription ?? (data?.locale === "en-GB" ? "Contact the Zen Coffee Lab roastery." : "Contacter la micro-torréfaction Zen Coffee Lab."), data?.locale === "en-GB" ? "/en/contact" : "/contact");
export default function Contact() {
  const { locale, content } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>(); const navigation = useNavigation(); const english = locale === "en-GB"; const sending = navigation.state === "submitting";
  const error = (field: string) => result?.errors?.[field]?.[0];
  return <><header className="page-hero contact-hero"><p className="eyebrow">{english ? "Let’s talk coffee" : "Parlons café"}</p><h1>{content?.title ?? (english ? "Contact us" : "Contactez-nous")}</h1><p className="lede">{english ? "A question about an order, a coffee or a professional project?" : "Une question sur une commande, un café ou un projet professionnel ?"}</p></header><section className="contact-layout page-shell" aria-labelledby="contact-form-title"><aside className="contact-details"><p className="eyebrow">Zen Coffee Lab · Tours</p><h2>{english ? "A direct line to the roastery." : "Un lien direct avec la torréfaction."}</h2><p>{english ? "Tell us what you need. We generally reply within two business days." : "Expliquez-nous votre besoin. Nous répondons généralement sous deux jours ouvrés."}</p><div><small>{english ? "Prefer email?" : "Vous préférez votre messagerie ?"}</small><a href="mailto:contact@zencoffeelab.com">contact@zencoffeelab.com</a></div></aside>{result?.ok ? <div className="contact-success" role="status"><span aria-hidden="true">✓</span><p className="eyebrow">{english ? "Message sent" : "Message envoyé"}</p><h2>{english ? "Thank you for writing to us." : "Merci de nous avoir écrit."}</h2><p>{result.message}</p></div> : <Form method="post" className="form-card contact-form"><input type="hidden" name="locale" value={locale} /><div className="sr-only" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div><div><p className="eyebrow">{english ? "Contact form" : "Formulaire de contact"}</p><h2 id="contact-form-title">{english ? "Write to us" : "Écrivez-nous"}</h2><p>{english ? "Fields marked with an asterisk are required." : "Les champs marqués d’un astérisque sont obligatoires."}</p></div>{result?.message ? <p className="form-message form-error" role="alert">{result.message}</p> : null}<div className="form-grid"><div className="field"><label htmlFor="contact-name">{english ? "Name *" : "Nom *"}</label><input id="contact-name" name="name" required minLength={2} maxLength={120} autoComplete="name" aria-invalid={Boolean(error("name")) || undefined} />{error("name") ? <small className="field-error">{error("name")}</small> : null}</div><div className="field"><label htmlFor="contact-email">Email *</label><input id="contact-email" name="email" type="email" required autoComplete="email" aria-invalid={Boolean(error("email")) || undefined} />{error("email") ? <small className="field-error">{error("email")}</small> : null}</div><div className="field"><label htmlFor="contact-phone">{english ? "Phone" : "Téléphone"}</label><input id="contact-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" /></div><div className="field"><label htmlFor="contact-subject">{english ? "Subject *" : "Sujet *"}</label><select id="contact-subject" name="subject" required defaultValue=""><option value="" disabled>{english ? "Choose a subject" : "Choisissez un sujet"}</option>{Object.entries(SUBJECT_LABELS[locale]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field field--wide"><label htmlFor="contact-message">{english ? "Message *" : "Votre message *"}</label><textarea id="contact-message" name="message" required minLength={10} maxLength={5_000} rows={8} aria-invalid={Boolean(error("message")) || undefined} />{error("message") ? <small className="field-error">{error("message")}</small> : null}</div><label className="contact-consent field--wide"><input name="privacyConsent" type="checkbox" value="true" required /><span>{english ? "I agree that my details may be used to answer my request. *" : "J’accepte que mes coordonnées soient utilisées pour répondre à ma demande. *"}</span></label></div><button className="button button--dark" type="submit" disabled={sending}>{sending ? (english ? "Sending…" : "Envoi…") : (english ? "Send my message" : "Envoyer mon message")}</button></Form>}</section></>;
}
