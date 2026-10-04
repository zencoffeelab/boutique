import type { LoaderFunctionArgs } from "react-router";
import { Resend } from "resend";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { escapeEmailHtml } from "~/services/email-templates.server";
import { processNotificationQueue } from "~/services/notifications.server";

async function processScheduledMail(client: any) {
  const config = env();
  if (!config.RESEND_API_KEY) return { sent: 0, failed: 0 };
  const { data: due, error } = await client.from("admin_mail_messages").select("id,sender_address,recipients,subject,text_body,parent_id").eq("direction", "outbound").eq("scheduled_status", "scheduled").is("sent_at", null).lte("scheduled_at", new Date().toISOString()).limit(20);
  if (error) throw error;
  let sent = 0; let failed = 0;
  for (const message of due ?? []) {
    const claim = await client.from("admin_mail_messages").update({ scheduled_status: "sending", updated_at: new Date().toISOString() }).eq("id", message.id).eq("scheduled_status", "scheduled").select("id").maybeSingle();
    if (claim.error || !claim.data) continue;
    const parent = message.parent_id ? await client.from("admin_mail_messages").select("message_id_header,references_header").eq("id", message.parent_id).maybeSingle() : { data: null };
    const attachments = await client.from("admin_mail_attachments").select("filename,mime_type,storage_path").eq("message_id", message.id);
    const files = await Promise.all((attachments.data ?? []).map(async (attachment: { filename: string; mime_type: string; storage_path: string }) => {
      const downloaded = await client.storage.from("admin-mail-attachments").download(attachment.storage_path);
      return downloaded.data ? { filename: attachment.filename, content: Buffer.from(await downloaded.data.arrayBuffer()) } : null;
    }));
    const headers: Record<string, string> = { "X-Zen-Coffee-Mailbox-Archived": "1" };
    if (parent.data?.message_id_header) { headers["In-Reply-To"] = parent.data.message_id_header; headers.References = [parent.data.references_header, parent.data.message_id_header].filter(Boolean).join(" ").slice(0, 4_000); }
    const recipient = Array.isArray(message.recipients) ? message.recipients[0]?.address : null;
    const response = recipient ? await new Resend(config.RESEND_API_KEY).emails.send({ from: config.CONTACT_FROM_EMAIL, to: recipient, replyTo: config.CONTACT_FROM_EMAIL, subject: message.subject, text: message.text_body ?? "", html: `<div style=\"font-family:Arial,sans-serif;font-size:16px;line-height:1.65;color:#1f251d\">${escapeEmailHtml(message.text_body ?? "").replace(/\n/g, "<br>")}</div>`, headers, attachments: files.flatMap((file) => file ? [file] : []) }, { idempotencyKey: `admin-mail/${message.id}` }) : { error: new Error("Destinataire introuvable") };
    if (response.error || !response.data?.id) { failed += 1; await client.from("admin_mail_messages").update({ scheduled_status: "scheduled", updated_at: new Date().toISOString() }).eq("id", message.id); continue; }
    sent += 1; await client.from("admin_mail_messages").update({ scheduled_status: "sent", provider_id: response.data.id, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", message.id);
  }
  return { sent, failed };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const config = env(); if (!config.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${config.CRON_SECRET}`) return new Response("Unauthorized.", { status: 401 });
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  const [{ data: released, error }, { data: expiredProfessionalQuotes, error: professionalQuoteError }] = await Promise.all([client.rpc("release_expired_reservations"), client.rpc("release_expired_professional_quotes")]); if (error || professionalQuoteError) throw new Response(error?.message ?? professionalQuoteError?.message, { status: 500 });
  const [notifications, scheduledMail] = await Promise.all([processNotificationQueue(), processScheduledMail(client)]); await client.from("shipping_quotes").delete().lt("expires_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  return Response.json({ ok: true, releasedReservations: released, expiredProfessionalQuotes, notifications, scheduledMail });
}
