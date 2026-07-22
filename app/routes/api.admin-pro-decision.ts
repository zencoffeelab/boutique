import type { ActionFunctionArgs } from "react-router";
import { professionalDecisionSchema } from "~/domain/schemas";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { enqueueNotification, escapeEmailHtml } from "~/services/notifications.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request); const raw = request.headers.get("content-type")?.includes("json") ? await request.json().catch(() => null) : Object.fromEntries(await request.formData()); const parsed = professionalDecisionSchema.safeParse(raw);
  if (!parsed.success || !params.id) return Response.json({ ok: false, message: "Invalid decision." }, { status: 422 });
  const client = createServiceSupabase(); if (!client) return Response.json({ ok: false, message: "Database unavailable." }, { status: 503 });
  const { data: application } = await client.from("professional_applications").select("*").eq("id", params.id).maybeSingle(); if (!application) return Response.json({ ok: false, message: "Application not found." }, { status: 404 });
  let invitationLink: string | undefined; let invitedUserId: string | undefined;
  if (parsed.data.decision === "approved") {
    const { data, error } = await client.auth.admin.generateLink({ type: "invite", email: application.email, options: { redirectTo: `${env().VITE_SITE_URL}${application.locale === "en-GB" ? "/en/my-account" : "/mon-compte"}` } });
    if (error) return Response.json({ ok: false, message: error.message }, { status: 502 });
    const next = application.locale === "en-GB" ? "/en/my-account?set-password=1" : "/mon-compte?set-password=1";
    invitationLink = `${env().VITE_SITE_URL}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite&next=${encodeURIComponent(next)}`; invitedUserId = data.user.id;
    await client.from("profiles").upsert({ id: invitedUserId, first_name: application.first_name, last_name: application.last_name, phone: application.phone, professional_status: "approved" });
  }
  const { error } = await client.from("professional_applications").update({ status: parsed.data.decision, decision_note: parsed.data.note, decided_by: admin.id === "demo-admin" ? null : admin.id, decided_at: new Date().toISOString(), invited_user_id: invitedUserId ?? application.invited_user_id }).eq("id", application.id);
  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  const approved = parsed.data.decision === "approved"; const english = application.locale === "en-GB";
  await enqueueNotification({ kind: approved ? "invitation" : "pro_decision", to: application.email, locale: application.locale, subject: approved ? (english ? "Your professional access is ready" : "Votre accès professionnel est prêt") : (english ? "Your professional application" : "Votre demande professionnelle"), html: approved ? `<h1>${english ? "Welcome to Zen Coffee Lab" : "Bienvenue chez Zen Coffee Lab"}</h1><p><a href="${escapeEmailHtml(invitationLink)}">${english ? "Set your password" : "Définir votre mot de passe"}</a></p>` : `<h1>${english ? "Your application has been reviewed" : "Votre demande a été étudiée"}</h1><p>${escapeEmailHtml(parsed.data.note)}</p>`, payload: { applicationId: application.id } });
  await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: `professional_application.${parsed.data.decision}`, entity_type: "professional_application", entity_id: application.id, before_data: { status: application.status }, after_data: parsed.data });
  return Response.json({ ok: true });
}
