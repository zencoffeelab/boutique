import type { ActionFunctionArgs } from "react-router";
import { professionalApplicationSchema } from "~/domain/schemas";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { enqueueNotification, escapeEmailHtml } from "~/services/notifications.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const contentType = request.headers.get("content-type") ?? "";
  const raw = contentType.includes("application/json") ? await request.json().catch(() => null) : Object.fromEntries(await request.formData());
  const input = raw && typeof raw === "object" ? { ...raw, privacyConsent: (raw as Record<string, unknown>).privacyConsent === true || (raw as Record<string, unknown>).privacyConsent === "true" } : raw;
  const parsed = professionalApplicationSchema.safeParse(input);
  if (!parsed.success) return Response.json({ ok: false, message: "Veuillez vérifier les champs du formulaire.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  const english = parsed.data.locale === "en-GB";
  if (parsed.data.website) return Response.json({ ok: true, message: english ? "Application received." : "Demande bien reçue." });
  const client = createServiceSupabase();
  if (client) {
    const { error } = await client.from("professional_applications").insert({ company_name: parsed.data.companyName, last_name: parsed.data.lastName, first_name: parsed.data.firstName, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone, business_type: parsed.data.businessType, monthly_volume: parsed.data.monthlyVolume, locale: parsed.data.locale, status: "pending" });
    if (error) {
      const duplicate = error.code === "23505";
      return Response.json({ ok: false, message: duplicate ? (english ? "An application already exists for this email." : "Une demande existe déjà pour cet e-mail.") : (english ? "The application could not be saved." : "La demande n’a pas pu être enregistrée.") }, { status: duplicate ? 409 : 500 });
    }
    try { await enqueueNotification({ kind: "pro_application", to: env().ADMIN_NOTIFICATION_EMAIL, locale: parsed.data.locale, subject: `Nouvelle demande pro · ${parsed.data.companyName}`, html: `<h1>Nouvelle demande professionnelle</h1><p>${escapeEmailHtml(parsed.data.firstName)} ${escapeEmailHtml(parsed.data.lastName)} · ${escapeEmailHtml(parsed.data.companyName)}</p><p>${escapeEmailHtml(parsed.data.businessType)} · ${escapeEmailHtml(parsed.data.monthlyVolume)}</p>`, payload: { email: parsed.data.email } }); }
    catch (cause) { console.error("professional_application_notification_failed", { message: cause instanceof Error ? cause.message : String(cause) }); }
  }
  return Response.json({ ok: true, message: english ? "Thank you. Your application will be reviewed and you will receive an email." : "Merci. Votre demande va être étudiée et vous recevrez une réponse par e-mail." }, { status: 201 });
}
