import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import { contactFormSchema } from "~/domain/schemas";
import { formatMoney } from "~/domain/money";
import type { Locale, Product } from "~/domain/types";
import { getViewer } from "~/lib/auth.server";
import { getProfessionalProducts } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { env } from "~/lib/env.server";
import { getLocale } from "~/lib/i18n";
import { getProfessionalConnectedPageContent } from "~/lib/professional-content";
import { pageMeta } from "~/lib/seo";
import { createServiceSupabase } from "~/lib/supabase.server";
import { captchaRejected, verifyPublicCaptcha } from "~/lib/antispam.server";
import {
  contactAdminAlertEmail,
  contactMessageReceivedEmail,
} from "~/services/email-templates.server";
import {
  dispatchNotificationQueue,
  enqueueNotification,
} from "~/services/notifications.server";

const SUBJECT_LABELS = {
  "fr-FR": {
    order: "Une commande",
    coffee: "Un café",
    professional: "Un projet professionnel",
    other: "Autre demande",
  },
  "en-GB": {
    order: "An order",
    coffee: "A coffee",
    professional: "A professional project",
    other: "Another question",
  },
} as const;
const proSchema = z.object({
  locale: z.enum(["fr-FR", "en-GB"]),
  message: z.string().trim().min(10).max(5_000),
  privacyConsent: z.literal(true),
  website: z.string().max(500).optional().default(""),
  selectedLines: z.string().max(20_000),
});
type Result = {
  ok: boolean;
  message: string;
  errors?: Record<string, string[]>;
};
type ProLine = {
  product: Product;
  variant: Product["variants"][number];
  unitPriceCents: number;
};
const PROFESSIONAL_CONTACT_SELECTION_STORAGE_KEY =
  "zen-coffee-lab/professional-contact-selection/v1";
function formatProfessionalContactMoney(cents: number, locale: Locale) {
  if (locale !== "en-GB") return formatMoney(cents, locale);
  return `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} €`;
}
const proLine = (product: Product): ProLine | null => {
  const variant = product.variants.find(
    (item) =>
      item.weightGrams === 1_000 &&
      item.offers.some(
        (offer) => offer.audience === "professional" && offer.active,
      ),
  );
  const offer = variant?.offers.find(
    (item) => item.audience === "professional" && item.active,
  );
  return variant && offer
    ? { product, variant, unitPriceCents: offer.price.amount }
    : null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const viewer = await getViewer(request);
  const special =
    new URL(request.url).searchParams.get("professional") === "1" &&
    Boolean(
      viewer &&
      (viewer.profile?.professional_status === "approved" ||
        viewer.profile?.role === "admin"),
    );
  const [content, products, professionalContent] = await Promise.all([
    getContentPage("contact", locale),
    special ? getProfessionalProducts() : Promise.resolve([]),
    special
      ? getContentPage("professionnel-connecte", locale)
      : Promise.resolve(null),
  ]);
  const professionalPage = special
    ? getProfessionalConnectedPageContent(locale, professionalContent?.blocks)
    : null;
  return {
    locale,
    content,
    special,
    steps: professionalPage?.steps ?? [],
    professionalBanner: professionalPage
      ? {
          eyebrow: professionalPage.bannerEyebrow,
          title: professionalPage.bannerTitle,
          text: professionalPage.bannerText,
        }
      : null,
    products: products
      .map(proLine)
      .filter((item): item is ProLine => Boolean(item))
      .toSorted((first, second) =>
        first.product.translations[locale].name.localeCompare(
          second.product.translations[locale].name,
          locale,
        ),
      ),
  };
}
export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST")
    return Response.json(
      { ok: false, message: "Method not allowed." },
      { status: 405 },
    );
  const raw = Object.fromEntries(await request.formData());
  const locale = raw.locale === "en-GB" ? "en-GB" : "fr-FR";
  const english = locale === "en-GB";
  if (!(await verifyPublicCaptcha(request, raw, "contact")))
    return captchaRejected(locale);
  let name: string,
    email: string,
    phone = "",
    subject: keyof (typeof SUBJECT_LABELS)["fr-FR"],
    message: string;
  if (raw.intent === "professional-selection") {
    const viewer = await getViewer(request);
    if (
      !viewer ||
      (viewer.profile?.professional_status !== "approved" &&
        viewer.profile?.role !== "admin")
    )
      return data<Result>(
        {
          ok: false,
          message: english
            ? "This request is reserved for approved professional accounts."
            : "Cette demande est réservée aux comptes professionnels validés.",
        },
        { status: 403 },
      );
    const parsed = proSchema.safeParse({
      ...raw,
      privacyConsent: raw.privacyConsent === "true",
    });
    if (!parsed.success)
      return data<Result>(
        {
          ok: false,
          message: english
            ? "Please check the highlighted fields."
            : "Veuillez vérifier les champs du formulaire.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    if (parsed.data.website)
      return data<Result>({
        ok: true,
        message: english
          ? "Your message has been sent."
          : "Votre message a bien été envoyé.",
      });
    let quantities: Record<string, number>;
    try {
      quantities = z
        .record(z.string(), z.number().int().positive().max(10_000))
        .parse(JSON.parse(parsed.data.selectedLines));
    } catch {
      return data<Result>(
        {
          ok: false,
          message: english
            ? "Select at least one coffee and enter a valid quantity."
            : "Sélectionnez au moins un café et indiquez une quantité valide.",
        },
        { status: 422 },
      );
    }
    const lines = (await getProfessionalProducts())
      .map(proLine)
      .filter((item): item is ProLine => Boolean(item))
      .flatMap((line) =>
        quantities[line.variant.id]
          ? [{ ...line, quantity: quantities[line.variant.id] }]
          : [],
      );
    if (!lines.length)
      return data<Result>(
        {
          ok: false,
          message: english
            ? "Select at least one coffee."
            : "Sélectionnez au moins un café.",
        },
        { status: 422 },
      );
    const details = lines
      .map(
        ({ product, variant, quantity, unitPriceCents }) =>
          `${product.translations[locale].name}${variant.label ? ` · ${variant.label}` : ""} — ${quantity} × ${formatMoney(unitPriceCents, locale)} HT = ${formatMoney(unitPriceCents * quantity, locale)} HT`,
      )
      .join("\n");
    const accountEmail = viewer.user.email;
    if (!accountEmail)
      return data<Result>(
        {
          ok: false,
          message: english
            ? "Your account email address is unavailable."
            : "L’adresse e-mail de votre compte est indisponible.",
        },
        { status: 422 },
      );
    const total = lines.reduce(
      (sum, line) => sum + line.unitPriceCents * line.quantity,
      0,
    );
    message = `${english ? "Selected coffees:" : "Cafés sélectionnés :"}\n${details}\n\n${english ? "Total:" : "Total :"} ${formatMoney(total, locale)} HT\n\n${parsed.data.message}`;
    name =
      [viewer.profile?.first_name, viewer.profile?.last_name]
        .filter(Boolean)
        .join(" ") || accountEmail;
    email = accountEmail;
    subject = "professional";
  } else {
    const parsed = contactFormSchema.safeParse({
      ...raw,
      privacyConsent: raw.privacyConsent === "true",
    });
    if (!parsed.success)
      return data<Result>(
        {
          ok: false,
          message: english
            ? "Please check the highlighted fields."
            : "Veuillez vérifier les champs du formulaire.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    if (parsed.data.website)
      return data<Result>({
        ok: true,
        message: english
          ? "Your message has been sent."
          : "Votre message a bien été envoyé.",
      });
    ({ name, email, phone, subject, message } = parsed.data);
  }
  const client = createServiceSupabase();
  if (!client)
    return data<Result>(
      {
        ok: false,
        message: english
          ? "The contact form is temporarily unavailable."
          : "Le formulaire de contact est temporairement indisponible.",
      },
      { status: 503 },
    );
  const { data: stored, error } = await client
    .from("contact_messages")
    .insert({
      locale,
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      subject,
      message,
    })
    .select("id")
    .single();
  if (error || !stored)
    return data<Result>(
      {
        ok: false,
        message: english
          ? "Your message could not be saved. Please try again."
          : "Votre message n’a pas pu être enregistré. Veuillez réessayer.",
      },
      { status: 500 },
    );
  try {
    const label = SUBJECT_LABELS[locale][subject];
    const adminEmail = contactAdminAlertEmail({
      name,
      email,
      phone,
      subject: label,
      message,
    });
    const confirmationEmail = contactMessageReceivedEmail({
      locale,
      name,
      subject: label,
    });
    await enqueueNotification({
      kind: "contact_message",
      to: env().ADMIN_NOTIFICATION_EMAIL,
      locale: "fr-FR",
      ...adminEmail,
      payload: { contactMessageId: stored.id, replyTo: email },
      dedupeKey: `contact-admin/${stored.id}`,
    });
    await enqueueNotification({
      kind: "contact_confirmation",
      to: email,
      locale,
      ...confirmationEmail,
      payload: { contactMessageId: stored.id },
      dedupeKey: `contact-confirmation/${stored.id}`,
    });
    dispatchNotificationQueue(
      context,
      "contact_notification_delivery_failed",
      10,
    );
  } catch (cause) {
    console.error("contact_notification_queue_failed", {
      message: cause instanceof Error ? cause.message : String(cause),
      contactMessageId: stored.id,
    });
  }
  return data<Result>(
    {
      ok: true,
      message: english
        ? "Thank you. Your message has been sent and a confirmation email is on its way."
        : "Merci. Votre message a bien été envoyé et un e-mail de confirmation est en cours d’envoi.",
    },
    { status: 201 },
  );
}
export const meta: MetaFunction<typeof loader> = ({ data }) =>
  pageMeta(
    data?.content?.seoTitle ?? "Contact | Zen Coffee Lab",
    data?.content?.seoDescription ??
      "Contacter la micro-torréfaction Zen Coffee Lab.",
    data?.locale === "en-GB" ? "/en/contact" : "/contact",
  );

function ProForm({
  locale,
  lines,
  result,
  sending,
}: {
  locale: Locale;
  lines: ProLine[];
  result?: Result;
  sending: boolean;
}) {
  const english = locale === "en-GB";
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(
          PROFESSIONAL_CONTACT_SELECTION_STORAGE_KEY,
        ) ?? "{}",
      );
      const parsedQuantities = z
        .record(z.string(), z.number().int().positive())
        .safeParse(saved);
      if (parsedQuantities.success) setQuantities(parsedQuantities.data);
    } catch {
      window.localStorage.removeItem(
        PROFESSIONAL_CONTACT_SELECTION_STORAGE_KEY,
      );
    }
  }, []);
  const set = (id: string, value: number) =>
    setQuantities((all) => {
      const next = {
        ...all,
        [id]: Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0),
      };
      window.localStorage.setItem(
        PROFESSIONAL_CONTACT_SELECTION_STORAGE_KEY,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(next).filter(([, quantity]) => quantity > 0),
          ),
        ),
      );
      return next;
    });
  const total = lines.reduce(
    (sum, line) =>
      sum + line.unitPriceCents * (quantities[line.variant.id] ?? 0),
    0,
  );
  return (
    <Form
      method="post"
      className="form-card contact-form professional-contact-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intent" value="professional-selection" />
      <input
        type="hidden"
        name="selectedLines"
        value={JSON.stringify(
          Object.fromEntries(
            Object.entries(quantities).filter(([, amount]) => amount > 0),
          ),
        )}
      />
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <p className="eyebrow">
          {english ? "Professional request" : "Demande professionnelle"}
        </p>
        <h2 id="contact-form-title">
          {english ? "Tell us what you need" : "Indiquez-nous vos besoins"}
        </h2>
        <p>
          {english
            ? "Select the coffees and quantities you would like to discuss. All catalogue coffees are shown, including those temporarily out of stock."
            : "Sélectionnez les cafés et quantités que vous souhaitez nous demander. Tous les cafés de la boutique sont affichés, y compris ceux temporairement en rupture."}
        </p>
      </div>
      {result?.message ? (
        <p className="form-message form-error" role="alert">
          {result.message}
        </p>
      ) : null}
      <div className="professional-contact-table-wrap">
        <table className="professional-contact-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">
                  {english ? "Select" : "Sélectionner"}
                </span>
              </th>
              <th>{english ? "Coffee" : "Café"}</th>
              <th>
                {english ? (
                  <>
                    Tasting
                    <br />
                    notes
                  </>
                ) : (
                  <>
                    Notes de
                    <br />
                    dégustation
                  </>
                )}
              </th>
              <th>
                <span className="professional-contact-table__quantity-heading">
                  {english ? (
                    <>
                      Desired
                      <br />
                      quantity
                    </>
                  ) : (
                    <>
                      Quantité
                      <br />
                      souhaitée
                    </>
                  )}
                </span>
              </th>
              <th>
                {english ? (
                  <>
                    Unit price
                    <br />
                    (excl. VAT)
                  </>
                ) : (
                  <>
                    Prix unitaire
                    <br />
                    (HT)
                  </>
                )}
              </th>
              <th>
                {english ? (
                  <>
                    Total
                    <br />
                    (excl. VAT)
                  </>
                ) : (
                  <>
                    Prix total
                    <br />
                    (HT)
                  </>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const quantity = quantities[line.variant.id] ?? 0;
              const translation = line.product.translations[locale];
              return (
                <tr
                  key={line.variant.id}
                  className={quantity ? "is-selected" : undefined}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(quantity)}
                      onChange={(event) =>
                        set(
                          line.variant.id,
                          event.currentTarget.checked
                            ? Math.max(1, quantity)
                            : 0,
                        )
                      }
                      aria-label={`${english ? "Select" : "Sélectionner"} ${translation.name}`}
                    />
                  </td>
                  <th scope="row">
                    <Link
                      className="professional-contact-table__coffee-link"
                      to={
                        english
                          ? `/en/shop/${line.product.slug}`
                          : `/boutique/${line.product.slug}`
                      }
                    >
                      {translation.name}
                    </Link>
                    <small>{line.variant.label}</small>
                  </th>
                  <td>
                    <span className="professional-contact-table__tasting-notes">
                      {translation.tastingNotes.slice(0, 4).join(" · ") || "—"}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={quantity || ""}
                      onChange={(event) =>
                        set(line.variant.id, event.currentTarget.valueAsNumber)
                      }
                      aria-label={`${english ? "Desired quantity for" : "Quantité souhaitée pour"} ${translation.name}`}
                    />
                  </td>
                  <td>{formatProfessionalContactMoney(line.unitPriceCents, locale)}</td>
                  <td>{formatProfessionalContactMoney(line.unitPriceCents * quantity, locale)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={5}>
                {english ? "Total (excl. VAT)" : "Total (HT)"}
              </th>
              <td>{formatProfessionalContactMoney(total, locale)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="form-grid">
        <div className="field field--wide">
          <label htmlFor="contact-message">
            {english ? "Your message *" : "Votre message *"}
          </label>
          <textarea
            id="contact-message"
            name="message"
            required
            minLength={10}
            maxLength={5_000}
            rows={6}
            aria-invalid={Boolean(result?.errors?.message) || undefined}
          />
          {result?.errors?.message?.[0] ? (
            <small className="field-error">{result.errors.message[0]}</small>
          ) : null}
        </div>
        <label className="contact-consent field--wide">
          <input name="privacyConsent" type="checkbox" value="true" required />
          <span>
            {english
              ? "I agree that my details may be used to answer my request. *"
              : "J’accepte que mes coordonnées soient utilisées pour répondre à ma demande. *"}
          </span>
        </label>
      </div>
      <button className="button button--dark" type="submit" disabled={sending}>
        {sending
          ? english
            ? "Sending…"
            : "Envoi…"
          : english
            ? "Send my request"
            : "Envoyer ma demande"}
      </button>
    </Form>
  );
}

export default function Contact() {
  const { locale, content, special, steps, professionalBanner, products } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const english = locale === "en-GB";
  const sending = navigation.state === "submitting";
  const error = (field: string) => result?.errors?.[field]?.[0];
  return (
    <>
      <header className="page-hero contact-hero">
        <p className="eyebrow">
          {special
            ? english
              ? "Professionals"
              : "Professionnels"
            : english
              ? "Let’s talk coffee"
              : "Parlons café"}
        </p>
        <h1>{content?.title ?? (english ? "Contact us" : "Contactez-nous")}</h1>
        <p className="lede">
          {special
            ? english
              ? "Let’s put together an initial quote outline."
              : "Établissons ensemble une première ébauche de devis."
            : english
              ? "A question about an order, a coffee or a professional project?"
              : "Une question sur une commande, un café ou un projet professionnel ?"}
        </p>
      </header>
      <section
        className={`contact-layout page-shell${special ? " contact-layout--professional" : ""}`}
        aria-labelledby="contact-form-title"
      >
        {special ? (
          <section
            className="steps professional-connected-steps"
            aria-label={
              english
                ? "Professional account steps"
                : "Étapes du compte professionnel"
            }
          >
            {steps.map((step, index) => (
              <article key={index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{index === 0 ? (english ? "Choose the coffees you would like." : "Choisissez les cafés que vous souhaitez.") : index === 1 ? (english ? "Overall discounts" : "Des réductions globales") : index === 2 ? (english ? "Add comments" : "Ajoutez des commentaires") : step.title}</h3>
                <p>{index === 0 ? (english ? "We check their availability, then get back to you." : "Nous vérifions leurs disponibilités puis revenons vers vous.") : index === 1 ? (english ? "Discounts on the total will be added to the quote according to the quantities requested." : "Des réductions sur le total seront ajoutées au devis en fonction des quantités demandées.") : index === 2 ? (english ? "If you have a specific request, a question, or anything else: we will reply." : "Si vous avez une demande particulière, une question, ou autre : nous y répondrons.") : step.text}</p>
              </article>
            ))}
          </section>
        ) : (
          <aside className="contact-details">
            <p className="eyebrow">Zen Coffee Lab · Tours</p>
            <h2>
              {english
                ? "A direct line to the roastery."
                : "Un lien direct avec la torréfaction."}
            </h2>
            <p>
              {english
                ? "Tell us what you need. We generally reply within two business days."
                : "Expliquez-nous votre besoin. Nous répondons généralement sous deux jours ouvrés."}
            </p>
            <div>
              <small>
                {english ? "Prefer email?" : "Vous préférez votre messagerie ?"}
              </small>
              <a href="mailto:contact@zencoffeelab.com">
                contact@zencoffeelab.com
              </a>
            </div>
          </aside>
        )}
        {result?.ok ? (
          <div className="contact-success" role="status">
            <span aria-hidden="true">✓</span>
            <p className="eyebrow">
              {english ? "Message sent" : "Message envoyé"}
            </p>
            <h2>
              {english
                ? "Thank you for writing to us."
                : "Merci de nous avoir écrit."}
            </h2>
            <p>{result.message}</p>
          </div>
        ) : special ? (
          <ProForm
            locale={locale}
            lines={products}
            result={result}
            sending={sending}
          />
        ) : (
          <Form method="post" className="form-card contact-form">
            <input type="hidden" name="locale" value={locale} />
            <div className="sr-only" aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <div>
              <p className="eyebrow">
                {english ? "Contact form" : "Formulaire de contact"}
              </p>
              <h2 id="contact-form-title">
                {english ? "Write to us" : "Écrivez-nous"}
              </h2>
              <p>
                {english
                  ? "Fields marked with an asterisk are required."
                  : "Les champs marqués d’un astérisque sont obligatoires."}
              </p>
            </div>
            {result?.message ? (
              <p className="form-message form-error" role="alert">
                {result.message}
              </p>
            ) : null}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="contact-name">
                  {english ? "Name *" : "Nom *"}
                </label>
                <input
                  id="contact-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  aria-invalid={Boolean(error("name")) || undefined}
                />
                {error("name") ? (
                  <small className="field-error">{error("name")}</small>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="contact-email">Email *</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(error("email")) || undefined}
                />
                {error("email") ? (
                  <small className="field-error">{error("email")}</small>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="contact-phone">
                  {english ? "Phone" : "Téléphone"}
                </label>
                <input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  maxLength={30}
                  autoComplete="tel"
                />
              </div>
              <div className="field">
                <label htmlFor="contact-subject">
                  {english ? "Subject *" : "Sujet *"}
                </label>
                <select
                  id="contact-subject"
                  name="subject"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    {english ? "Choose a subject" : "Choisissez un sujet"}
                  </option>
                  {Object.entries(SUBJECT_LABELS[locale]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="field field--wide">
                <label htmlFor="contact-message">
                  {english ? "Message *" : "Votre message *"}
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  minLength={10}
                  maxLength={5_000}
                  rows={8}
                  aria-invalid={Boolean(error("message")) || undefined}
                />
                {error("message") ? (
                  <small className="field-error">{error("message")}</small>
                ) : null}
              </div>
              <label className="contact-consent field--wide">
                <input
                  name="privacyConsent"
                  type="checkbox"
                  value="true"
                  required
                />
                <span>
                  {english
                    ? "I agree that my details may be used to answer my request. *"
                    : "J’accepte que mes coordonnées soient utilisées pour répondre à ma demande. *"}
                </span>
              </label>
            </div>
            <button
              className="button button--dark"
              type="submit"
              disabled={sending}
            >
              {sending
                ? english
                  ? "Sending…"
                  : "Envoi…"
                : english
                  ? "Send my message"
                  : "Envoyer mon message"}
            </button>
          </Form>
        )}
      </section>
      {special && professionalBanner ? (
        <aside className="professional-banner professional-banner--connected">
          <p className="eyebrow">{professionalBanner.eyebrow}</p>
          <h2>{professionalBanner.title}</h2>
          <p>{professionalBanner.text}</p>
        </aside>
      ) : null}
    </>
  );
}
