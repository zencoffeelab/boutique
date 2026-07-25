import type { ActionFunctionArgs } from "react-router";
import { professionalApplicationSchema } from "~/domain/schemas";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { professionalAdminAlertEmail, professionalApplicationReceivedEmail } from "~/services/email-templates.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";

export async function action({ request, context }: ActionFunctionArgs) {
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
    const { data: application, error } = await client.from("professional_applications").insert({ company_name: parsed.data.companyName, last_name: parsed.data.lastName, first_name: parsed.data.firstName, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone, business_type: parsed.data.businessType, monthly_volume: parsed.data.monthlyVolume, locale: parsed.data.locale, status: "pending" }).select("id").single();
    if (error) {
      const duplicate = error.code === "23505";
      return Response.json({ ok: false, message: duplicate ? (english ? "An application already exists for this email." : "Une demande existe déjà pour cet e-mail.") : (english ? "The application could not be saved." : "La demande n’a pas pu être enregistrée.") }, { status: duplicate ? 409 : 500 });
    }
    try {
      const adminEmail = professionalAdminAlertEmail({ company: parsed.data.companyName, name: `${parsed.data.firstName} ${parsed.data.lastName}`, businessType: parsed.data.businessType, monthlyVolume: parsed.data.monthlyVolume, adminUrl: `${env().VITE_SITE_URL}/admin/professionnels` });
      const customerEmail = professionalApplicationReceivedEmail({ locale: parsed.data.locale, firstName: parsed.data.firstName });
      await enqueueNotification({ kind: "pro_application", to: env().ADMIN_NOTIFICATION_EMAIL, locale: "fr-FR", ...adminEmail, payload: { applicationId: application?.id, email: parsed.data.email }, dedupeKey: `pro-application-admin/${application?.id}` });
      await enqueueNotification({ kind: "pro_application_confirmation", to: parsed.data.email, locale: parsed.data.locale, ...customerEmail, payload: { applicationId: application?.id }, dedupeKey: `pro-application-confirmation/${application?.id}` });
      dispatchNotificationQueue(context, "professional_application_notification_delivery_failed", 10);
    }
    catch (cause) { console.error("professional_application_notification_failed", { message: cause instanceof Error ? cause.message : String(cause) }); }
  }
  return Response.json({ ok: true, message: english ? "Thank you. Your application will be reviewed and you will receive an email." : "Merci. Votre demande va être étudiée et vous recevrez une réponse par e-mail." }, { status: 201 });
}
