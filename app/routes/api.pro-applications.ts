import type { ActionFunctionArgs } from "react-router";
import { professionalApplicationSchema } from "~/domain/schemas";
import { getViewer } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { professionalAdminAlertEmail, professionalApplicationReceivedEmail } from "~/services/email-templates.server";
import { dispatchNotificationQueue, enqueueNotification, processNotificationQueue } from "~/services/notifications.server";
import { captchaRejected, verifyPublicCaptcha } from "~/lib/antispam.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const contentType = request.headers.get("content-type") ?? "";
  const raw = contentType.includes("application/json") ? await request.json().catch(() => null) : Object.fromEntries(await request.formData());
  const locale = raw && typeof raw === "object" && (raw as Record<string, unknown>).locale === "en-GB" ? "en-GB" : "fr-FR";
  if (!(await verifyPublicCaptcha(request, raw && typeof raw === "object" ? raw as Record<string, unknown> : {}))) return captchaRejected(locale);
  const viewer = await getViewer(request);
  const input = raw && typeof raw === "object" ? { ...raw, email: viewer?.user.email ?? (raw as Record<string, unknown>).email, privacyConsent: (raw as Record<string, unknown>).privacyConsent === true || (raw as Record<string, unknown>).privacyConsent === "true" } : raw;
  const parsed = professionalApplicationSchema.safeParse(input);
  if (!parsed.success) return Response.json({ ok: false, message: "Veuillez vérifier les champs du formulaire.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  const english = parsed.data.locale === "en-GB";
  if (parsed.data.website) return Response.json({ ok: true, message: english ? "Application received." : "Demande bien reçue." });
  const client = createServiceSupabase();
  if (client) {
    const email = parsed.data.email.toLowerCase();
    const applicationValues = { company_name: parsed.data.companyName, country_code: parsed.data.countryCode, comment: parsed.data.comment, last_name: parsed.data.lastName, first_name: parsed.data.firstName, email, phone: parsed.data.phone, business_type: parsed.data.businessType, monthly_volume: parsed.data.monthlyVolume, locale: parsed.data.locale, status: "pending" as const, invited_user_id: viewer?.user.id ?? null };
    let { data: application, error } = await client.from("professional_applications").insert(applicationValues).select("id,status").single();
    if (error) {
      if (error.code !== "23505") return Response.json({ ok: false, message: english ? "The application could not be saved." : "La demande n’a pas pu être enregistrée." }, { status: 500 });
      const existing = await client.from("professional_applications").select("id,status").eq("email", email).maybeSingle();
      if (existing.error || !existing.data || existing.data.status !== "pending") return Response.json({ ok: false, message: english ? "An application already exists for this email." : "Une demande existe déjà pour cet e-mail." }, { status: 409 });
      const updated = await client.from("professional_applications").update({ ...applicationValues, updated_at: new Date().toISOString() }).eq("id", existing.data.id).eq("status", "pending").select("id,status").single();
      if (updated.error) return Response.json({ ok: false, message: english ? "The application could not be updated." : "La demande n’a pas pu être mise à jour." }, { status: 500 });
      application = updated.data;
      error = null;
    }
    try {
      const adminEmail = professionalAdminAlertEmail({ company: parsed.data.companyName, name: `${parsed.data.firstName} ${parsed.data.lastName}`, businessType: parsed.data.businessType, monthlyVolume: parsed.data.monthlyVolume, comment: parsed.data.comment, adminUrl: `${env().VITE_SITE_URL}/admin/professionnels` });
      const customerEmail = professionalApplicationReceivedEmail({ locale: parsed.data.locale, firstName: parsed.data.firstName });
      const notificationAttempt = crypto.randomUUID();
      await enqueueNotification({ kind: "pro_application", to: env().ADMIN_NOTIFICATION_EMAIL, locale: "fr-FR", ...adminEmail, payload: { applicationId: application?.id, email }, dedupeKey: `pro-application-admin/${application?.id}/${notificationAttempt}` });
      await enqueueNotification({ kind: "pro_application_confirmation", to: email, locale: parsed.data.locale, ...customerEmail, payload: { applicationId: application?.id }, dedupeKey: `pro-application-confirmation/${application?.id}/${notificationAttempt}` });
      dispatchNotificationQueue(context, "professional_application_notification_delivery_failed", 10);
      await processNotificationQueue(1).catch((cause) => console.error("professional_application_notification_immediate_delivery_failed", { message: cause instanceof Error ? cause.message : String(cause) }));
    }
    catch (cause) { console.error("professional_application_notification_failed", { message: cause instanceof Error ? cause.message : String(cause) }); }
  }
  return Response.json({ ok: true, message: english ? "Thank you. Your application will be reviewed and you will receive an email." : "Merci. Votre demande va être étudiée et vous recevrez une réponse par e-mail." }, { status: 201 });
}
