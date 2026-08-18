import { formatMoney } from "~/domain/money";
import type { Locale } from "~/domain/types";

export type EmailContent = Readonly<{ subject: string; html: string }>;

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function emailLayout(input: { locale: Locale; preheader: string; title: string; body: string }): string {
  const english = input.locale === "en-GB";
  const signoff = english ? "Kind regards," : "Cordialement,";
  return `<!doctype html><html lang="${english ? "en" : "fr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f2ef;color:#1f251d;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeEmailHtml(input.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2ef"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fbfaf8;border:1px solid #c8ccc4"><tr><td style="padding:28px 32px;border-bottom:1px solid #c8ccc4;font-family:Georgia,serif;font-size:30px">Zen Coffee Lab</td></tr><tr><td style="height:8px;background:#253021"></td></tr><tr><td role="main" style="padding:40px 32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:38px;line-height:1.08;font-weight:400">${escapeEmailHtml(input.title)}</h1>${input.body}<div style="margin-top:32px;padding-top:24px;border-top:1px solid #c8ccc4;font-size:16px;line-height:1.65">${signoff}<br><strong>Zen Coffee Lab</strong></div></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #c8ccc4;color:#62675c;font-size:12px;line-height:1.6">Zen Coffee Lab · Tours, France<br><a href="mailto:contact@zencoffeelab.com" style="color:#45503f">contact@zencoffeelab.com</a></td></tr></table></td></tr></table></body></html>`;
}

function paragraph(value: unknown): string {
  return `<p style="margin:0 0 18px;font-size:16px;line-height:1.65">${escapeEmailHtml(value)}</p>`;
}

function actionLink(label: string, url: string): string {
  return `<p style="margin:28px 0"><a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#253021;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeEmailHtml(label)}</a></p>`;
}

type OrderLineSnapshot = Readonly<{
  product_name: string;
  variant_label: string;
  quantity: number;
  line_total_cents: number;
}>;

type OrderSnapshot = Readonly<{
  order_number: string;
  locale: Locale;
  shipping_address?: Record<string, any> | null;
  shipping_carrier?: string | null;
  shipping_service?: string | null;
  subtotal_cents: number;
  shipping_charged_cents: number;
  total_cents: number;
  order_lines?: readonly OrderLineSnapshot[];
}>;

export function orderConfirmationEmail(order: OrderSnapshot): EmailContent {
  const english = order.locale === "en-GB";
  const lines = (order.order_lines ?? []).map((line) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e1e3dd">${line.quantity} × ${escapeEmailHtml(line.product_name)} · ${escapeEmailHtml(line.variant_label)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e1e3dd;white-space:nowrap">${escapeEmailHtml(formatMoney(line.line_total_cents, order.locale))}</td></tr>`).join("");
  const pickup = order.shipping_address?.pickupPoint;
  const delivery = pickup
    ? `${english ? "Pickup point" : "Point relais"}: ${pickup.name}, ${pickup.address1}, ${pickup.postalCode} ${pickup.city}`
    : `${order.shipping_address?.line1 ?? ""}, ${order.shipping_address?.postalCode ?? ""} ${order.shipping_address?.city ?? ""}`;
  const body = `${paragraph(english ? `We have received your payment. Your order ${order.order_number} is confirmed.` : `Nous avons bien reçu votre paiement. Votre commande ${order.order_number} est confirmée.`)}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;font-size:14px;line-height:1.5">${lines}<tr><td style="padding:10px 0">${english ? "Shipping" : "Livraison"} · ${escapeEmailHtml(order.shipping_carrier ?? "")}</td><td align="right" style="padding:10px 0">${escapeEmailHtml(formatMoney(order.shipping_charged_cents, order.locale))}</td></tr><tr><td style="padding:14px 0;border-top:2px solid #253021;font-weight:700">Total</td><td align="right" style="padding:14px 0;border-top:2px solid #253021;font-weight:700">${escapeEmailHtml(formatMoney(order.total_cents, order.locale))}</td></tr></table>${paragraph(delivery)}`;
  return {
    subject: english ? "Order confirmed" : "Commande confirmée",
    html: emailLayout({ locale: order.locale, preheader: english ? "Your payment has been received." : "Votre paiement a bien été reçu.", title: english ? "Thank you for your order" : "Merci pour votre commande", body }),
  };
}

export function invoiceEmail(input: { locale: Locale; orderNumber: string }): EmailContent {
  const english = input.locale === "en-GB";
  return {
    subject: english ? "Your invoice" : "Votre facture",
    html: emailLayout({ locale: input.locale, preheader: english ? "Your PDF invoice is attached." : "Votre facture PDF est jointe.", title: english ? "Your invoice is ready" : "Votre facture est disponible", body: paragraph(english ? "You will find the PDF invoice for your order attached to this message." : "Vous trouverez la facture PDF de votre commande en pièce jointe de ce message.") }),
  };
}

export function orderStatusEmail(input: { locale: Locale; orderNumber: string; status: "preparing" | "ready_to_ship" | "canceled" }): EmailContent {
  const english = input.locale === "en-GB";
  const copy = {
    preparing: english ? ["Your order is being prepared", "Our team is now preparing your coffees with care."] : ["Votre commande est en préparation", "Notre équipe prépare maintenant vos cafés avec soin."],
    ready_to_ship: english ? ["Your order is ready to ship", "Your parcel is ready and will shortly be handed over to the carrier."] : ["Votre commande est prête à partir", "Votre colis est prêt et sera prochainement remis au transporteur."],
    canceled: english ? ["Your order has been canceled", "Your order has been canceled. Contact us if you need any help."] : ["Votre commande a été annulée", "Votre commande a été annulée. Contactez-nous si vous avez besoin d’aide."],
  }[input.status];
  return {
    subject: copy[0],
    html: emailLayout({ locale: input.locale, preheader: copy[1], title: copy[0], body: paragraph(`${copy[1]} ${input.orderNumber}`) }),
  };
}

export function trackingEmail(input: { locale: Locale; orderNumber: string; delivered: boolean; trackingUrl?: string | null }): EmailContent {
  const english = input.locale === "en-GB";
  const title = input.delivered ? (english ? "Your order has been delivered" : "Votre commande a été livrée") : (english ? "Your order is on its way" : "Votre commande est en route");
  const body = `${paragraph(input.orderNumber)}${!input.delivered && input.trackingUrl ? actionLink(english ? "Track my parcel" : "Suivre mon colis", input.trackingUrl) : ""}`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: title, title, body }) };
}

export function refundEmail(input: { locale: Locale; orderNumber: string; amountCents: number; fullyRefunded: boolean }): EmailContent {
  const english = input.locale === "en-GB";
  const title = input.fullyRefunded ? (english ? "Your order has been refunded" : "Votre commande a été remboursée") : (english ? "A partial refund has been issued" : "Un remboursement partiel a été effectué");
  const details = english ? `${formatMoney(input.amountCents, input.locale)} has been refunded to the payment method used for order ${input.orderNumber}.` : `${formatMoney(input.amountCents, input.locale)} ont été remboursés sur le moyen de paiement utilisé pour la commande ${input.orderNumber}.`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: details, title, body: paragraph(details) }) };
}

export function professionalApplicationReceivedEmail(input: { locale: Locale; firstName: string }): EmailContent {
  const english = input.locale === "en-GB";
  const title = english ? "Your professional application has been received" : "Votre demande professionnelle a bien été reçue";
  const details = english ? `Thank you ${input.firstName}. Our team will review your application and contact you by email.` : `Merci ${input.firstName}. Notre équipe va étudier votre demande et vous répondra par e-mail.`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: details, title, body: paragraph(details) }) };
}

export function professionalAdminAlertEmail(input: { company: string; name: string; businessType: string; monthlyVolume: string; comment?: string; adminUrl: string }): EmailContent {
  const title = `Nouvelle demande pro · ${input.company}`;
  const body = `${paragraph(`${input.name} · ${input.company}`)}${paragraph(`${input.businessType} · ${input.monthlyVolume}`)}${input.comment ? paragraph(`Commentaire : ${input.comment}`) : ""}${actionLink("Ouvrir le back-office", input.adminUrl)}`;
  return { subject: title, html: emailLayout({ locale: "fr-FR", preheader: title, title: "Nouvelle demande professionnelle", body }) };
}

export function professionalDecisionEmail(input: { locale: Locale; approved: boolean; activationUrl?: string; accessLabel?: string; note?: string; temporaryAccessLink?: boolean }): EmailContent {
  const english = input.locale === "en-GB";
  const title = input.approved ? (english ? "Your professional access is ready" : "Votre accès professionnel est prêt") : (english ? "Your application has been reviewed" : "Votre demande a été étudiée");
  const intro = input.approved ? (english ? "Your application has been approved by our team." : "Votre demande a été validée par notre équipe.") : (input.note || (english ? "Our team has reviewed your professional application." : "Notre équipe a étudié votre demande professionnelle."));
  const note = input.approved && input.note ? paragraph(english ? `Message from our team: ${input.note}` : `Message de notre équipe : ${input.note}`) : "";
  const body = `${paragraph(intro)}${note}${input.approved && input.activationUrl ? actionLink(input.accessLabel ?? title, input.activationUrl) : ""}${input.approved && input.temporaryAccessLink !== false ? paragraph(english ? "This secure link is temporary." : "Ce lien sécurisé est temporaire.") : ""}`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: intro, title: input.approved ? (english ? "Welcome to Zen Coffee Lab" : "Bienvenue chez Zen Coffee Lab") : title, body }) };
}

export function professionalQuoteEmail(input: { locale: Locale; quoteNumber: string; totalCents: number; validUntil: string; paymentUrl: string }): EmailContent {
  const english = input.locale === "en-GB";
  const title = english ? "Your professional quote is ready" : "Votre devis professionnel est prêt";
  const details = english
    ? `Quote ${input.quoteNumber}, for a total of ${formatMoney(input.totalCents, input.locale)}, is valid until ${new Date(input.validUntil).toLocaleDateString(input.locale)}.`
    : `Le devis ${input.quoteNumber}, d’un montant total de ${formatMoney(input.totalCents, input.locale)}, est valable jusqu’au ${new Date(input.validUntil).toLocaleDateString(input.locale)}.`;
  const body = `${paragraph(details)}${paragraph(english ? "The PDF is attached. You can pay by card or SEPA bank transfer." : "Le PDF est joint à cet e-mail. Vous pouvez régler par carte ou par virement bancaire SEPA.")}${actionLink(english ? "View and pay my quote" : "Voir et payer mon devis", input.paymentUrl)}`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: details, title, body }) };
}

export function professionalQuotePaidEmail(input: { locale: Locale; quoteNumber: string; totalCents: number }): EmailContent {
  const english = input.locale === "en-GB";
  const title = english ? "Payment received" : "Paiement reçu";
  const details = english ? `We have received ${formatMoney(input.totalCents, input.locale)} for quote ${input.quoteNumber}.` : `Nous avons reçu le règlement de ${formatMoney(input.totalCents, input.locale)} pour le devis ${input.quoteNumber}.`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: details, title, body: paragraph(details) }) };
}

export function contactMessageReceivedEmail(input: { locale: Locale; name: string; subject: string }): EmailContent {
  const english = input.locale === "en-GB";
  const title = english ? "We have received your message" : "Nous avons bien reçu votre message";
  const details = english
    ? `Thank you ${input.name}. Your message about “${input.subject}” has reached the roastery. We generally reply within two business days.`
    : `Merci ${input.name}. Votre message au sujet de « ${input.subject} » est bien arrivé à la torréfaction. Nous répondons généralement sous deux jours ouvrés.`;
  return { subject: title, html: emailLayout({ locale: input.locale, preheader: title, title, body: paragraph(details) }) };
}

export function contactAdminAlertEmail(input: { name: string; email: string; phone?: string; subject: string; message: string }): EmailContent {
  const title = `Nouveau message · ${input.subject}`;
  const safeMessage = escapeEmailHtml(input.message).replaceAll("\n", "<br>");
  const body = `${paragraph(input.name)}${paragraph(input.email)}${input.phone ? paragraph(input.phone) : ""}<div style="margin:24px 0;padding:20px;background:#f5f2ef;border-left:4px solid #45503f;font-size:16px;line-height:1.65">${safeMessage}</div>${actionLink("Répondre par e-mail", `mailto:${input.email}`)}`;
  return { subject: title, html: emailLayout({ locale: "fr-FR", preheader: `${input.name} vous a écrit depuis le site.`, title: "Nouveau message depuis le site", body }) };
}
