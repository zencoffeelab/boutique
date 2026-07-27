import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { getViewer } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { professionalQuoteEmail } from "~/services/email-templates.server";
import { professionalQuoteValidityDays } from "~/domain/professional-quote";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";
import { generateProfessionalQuotePdf } from "~/services/professional-quotes.server";

const schema = z.object({
  locale: z.enum(["fr-FR", "en-GB"]),
  lines: z.array(z.object({ productId: z.uuid(), variantId: z.uuid(), kilograms: z.number().int().min(1).max(10_000) })).min(1).max(50),
}).superRefine((value, context) => {
  const ids = value.lines.map((line) => line.productId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "A coffee can only appear once." });
});

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.profile?.professional_status !== "approved") return Response.json({ ok: false, message: "Accès professionnel requis." }, { status: 403 });
  if (!viewer.user.email) return Response.json({ ok: false, message: "Une adresse e-mail est requise pour générer le devis." }, { status: 422 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Sélection de devis invalide." }, { status: 422 });
  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "La génération des devis nécessite la base de données." }, { status: 503 });
  let quoteId: string | undefined;
  try {
    const { data, error } = await client.rpc("create_professional_quote", { p_profile_id: viewer.user.id, p_email: viewer.user.email, p_locale: parsed.data.locale, p_lines: parsed.data.lines, p_valid_days: professionalQuoteValidityDays });
    if (error || !data?.id) throw new Error(error?.message ?? "Unable to create professional quote.");
    quoteId = String(data.id);
    const paymentPath = parsed.data.locale === "en-GB" ? `/en/quotes/${quoteId}/payment` : `/devis/${quoteId}/paiement`;
    const paymentUrl = `${env().VITE_SITE_URL}${paymentPath}`;
    await generateProfessionalQuotePdf(quoteId, paymentUrl);
    const { data: quote } = await client.from("professional_quotes").select("quote_number,total_cents,valid_until").eq("id", quoteId).single();
    if (!quote) throw new Error("Professional quote unavailable after creation.");
    const email = professionalQuoteEmail({ locale: parsed.data.locale, quoteNumber: quote.quote_number, totalCents: quote.total_cents, validUntil: quote.valid_until, paymentUrl });
    await enqueueNotification({ kind: "professional_quote", to: viewer.user.email, locale: parsed.data.locale, ...email, payload: { quoteId }, dedupeKey: `professional-quote/${quoteId}` });
    dispatchNotificationQueue(context, "professional_quote_delivery_failed");
    const accountPath = parsed.data.locale === "en-GB" ? "/en/my-account" : "/mon-compte";
    return Response.json({ ok: true, quoteId, accountUrl: `${accountPath}?quote=${encodeURIComponent(quote.quote_number)}#account-professional-quotes` });
  } catch (cause) {
    if (quoteId) await client.rpc("release_professional_quote", { p_quote_id: quoteId, p_status: "canceled" });
    return Response.json({ ok: false, message: cause instanceof Error ? cause.message : "Impossible de générer le devis." }, { status: 409 });
  }
}
