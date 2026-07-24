import type { ActionFunctionArgs } from "react-router";
import { professionalDecisionSchema } from "~/domain/schemas";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { enqueueNotification, escapeEmailHtml, processNotificationQueue } from "~/services/notifications.server";
import { generateProfessionalAccessLink, professionalDecisionFeedback, ProfessionalAccessError } from "~/services/professional-access.server";

function processQueuedEmail(context: ActionFunctionArgs["context"]) {
  const task = processNotificationQueue(10).catch((cause) => {
    console.error("professional_access_notification_failed", { message: cause instanceof Error ? cause.message : String(cause) });
  });
  const cloudflare = (context as { cloudflare?: { ctx?: { waitUntil(promise: Promise<unknown>): void } } }).cloudflare;
  if (cloudflare?.ctx) cloudflare.ctx.waitUntil(task);
  else void task;
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Méthode non autorisée." }, { status: 405 });
  const admin = await requireAdmin(request);
  const raw = request.headers.get("content-type")?.includes("json") ? await request.json().catch(() => null) : Object.fromEntries(await request.formData());
  const parsed = professionalDecisionSchema.safeParse(raw);
  if (!parsed.success || !params.id) return Response.json({ ok: false, message: "Décision invalide." }, { status: 422 });

  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Base de données indisponible." }, { status: 503 });
  const { data: application, error: applicationError } = await client.from("professional_applications").select("*").eq("id", params.id).maybeSingle();
  if (applicationError) return Response.json({ ok: false, message: applicationError.message }, { status: 500 });
  if (!application) return Response.json({ ok: false, message: "Demande introuvable." }, { status: 404 });
  if (application.status !== "pending") return Response.json({ ok: false, message: "Cette demande a déjà été traitée." }, { status: 409 });

  const approved = parsed.data.decision === "approved";
  const english = application.locale === "en-GB";
  let invitedUserId: string | undefined;
  let invitationLink: string | undefined;
  let existingUser = false;

  if (approved) {
    try {
      const access = await generateProfessionalAccessLink(client, { email: application.email, locale: application.locale, siteUrl: env().VITE_SITE_URL });
      invitedUserId = access.userId;
      invitationLink = access.url;
      existingUser = access.existingUser;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La création de l’accès professionnel a échoué.";
      return Response.json({ ok: false, message }, { status: cause instanceof ProfessionalAccessError ? cause.status : 502 });
    }

    const { error: profileError } = await client.from("profiles").upsert({
      id: invitedUserId,
      first_name: application.first_name,
      last_name: application.last_name,
      phone: application.phone,
      professional_status: "approved",
      updated_at: new Date().toISOString(),
    });
    if (profileError) return Response.json({ ok: false, message: profileError.message }, { status: 500 });
  }

  const decidedAt = new Date().toISOString();
  const { error: decisionError } = await client.from("professional_applications").update({
    status: parsed.data.decision,
    decision_note: parsed.data.note,
    decided_by: admin.id === "demo-admin" ? null : admin.id,
    decided_at: decidedAt,
    updated_at: decidedAt,
    invited_user_id: invitedUserId ?? application.invited_user_id,
  }).eq("id", application.id).eq("status", "pending");
  if (decisionError) return Response.json({ ok: false, message: decisionError.message }, { status: 500 });

  const accessLabel = existingUser
    ? (english ? "Choose a new password and open your professional space" : "Choisir un nouveau mot de passe et ouvrir votre espace professionnel")
    : (english ? "Set your password and open your professional space" : "Définir votre mot de passe et ouvrir votre espace professionnel");
  const emailConfigured = Boolean(env().RESEND_API_KEY);
  let emailQueued = false;
  try {
    const queued = await enqueueNotification({
      kind: approved ? "invitation" : "pro_decision",
      to: application.email,
      locale: application.locale,
      subject: approved ? (english ? "Your professional access is ready" : "Votre accès professionnel est prêt") : (english ? "Your professional application" : "Votre demande professionnelle"),
      html: approved
        ? `<h1>${english ? "Welcome to Zen Coffee Lab" : "Bienvenue chez Zen Coffee Lab"}</h1><p>${english ? "Your application has been approved by our team." : "Votre demande a été validée par notre équipe."}</p><p><a href="${escapeEmailHtml(invitationLink)}">${accessLabel}</a></p><p>${english ? "This secure link is temporary." : "Ce lien sécurisé est temporaire."}</p>`
        : `<h1>${english ? "Your application has been reviewed" : "Votre demande a été étudiée"}</h1>${parsed.data.note ? `<p>${escapeEmailHtml(parsed.data.note)}</p>` : ""}`,
      payload: { applicationId: application.id, invitedUserId, existingUser },
    });
    emailQueued = queued.queued;
    if (emailConfigured && emailQueued) processQueuedEmail(context);
  } catch (cause) {
    console.error("professional_access_notification_queue_failed", { message: cause instanceof Error ? cause.message : String(cause) });
  }

  await client.from("audit_log").insert({
    actor_id: admin.id === "demo-admin" ? null : admin.id,
    action: `professional_application.${parsed.data.decision}`,
    entity_type: "professional_application",
    entity_id: application.id,
    before_data: { status: application.status },
    after_data: { ...parsed.data, invitedUserId, existingUser },
  });
  return Response.json({
    ok: true,
    ...professionalDecisionFeedback({ approved, email: application.email, emailConfigured, emailQueued, activationUrl: invitationLink }),
  });
}
