import { Resend } from "resend";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export type NotificationKind = "pro_application" | "pro_decision" | "invitation" | "order_confirmation" | "invoice" | "shipped" | "tracking" | "delivered" | "password_reset";

export function escapeEmailHtml(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

export async function enqueueNotification(input: { kind: NotificationKind; to: string; locale: "fr-FR" | "en-GB"; subject: string; html: string; payload?: Record<string, unknown> }) {
  const client = createServiceSupabase();
  if (!client) return { queued: false, demo: true };
  const { error } = await client.from("notification_outbox").insert({ kind: input.kind, recipient: input.to, locale: input.locale, subject: input.subject, html: input.html, payload: input.payload ?? {} });
  if (error) throw new Error(`Unable to queue notification: ${error.message}`);
  return { queued: true, demo: false };
}

export async function processNotificationQueue(limit = 25) {
  const config = env(); const client = createServiceSupabase();
  if (!client || !config.RESEND_API_KEY) return { processed: 0, skipped: true };
  const { data, error } = await client.from("notification_outbox").select("*").is("sent_at", null).lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(limit);
  if (error) throw new Error(`Unable to read notification queue: ${error.message}`);
  const resend = new Resend(config.RESEND_API_KEY); let processed = 0;
  for (const item of data ?? []) {
    const claimedAttempts = item.attempts + 1; const { data: claimed } = await client.from("notification_outbox").update({ attempts: claimedAttempts, next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", item.id).eq("attempts", item.attempts).is("sent_at", null).select("id").maybeSingle(); if (!claimed) continue;
    let attachments: Array<{ filename: string; content: Buffer }> | undefined;
    if (item.kind === "invoice" && item.payload?.orderId) {
      const { data: invoice } = await client.from("invoices").select("invoice_number,storage_path").eq("order_id", String(item.payload.orderId)).maybeSingle();
      if (invoice?.storage_path) { const { data: file } = await client.storage.from("invoices").download(invoice.storage_path); if (file) attachments = [{ filename: `${invoice.invoice_number}.pdf`, content: Buffer.from(await file.arrayBuffer()) }]; }
    }
    const result = await resend.emails.send({ from: config.RESEND_FROM_EMAIL, to: item.recipient, subject: item.subject, html: item.html, attachments });
    if (result.error) {
      const minutes = Math.min(24 * 60, 2 ** claimedAttempts);
      await client.from("notification_outbox").update({ last_error: result.error.message, next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString() }).eq("id", item.id);
    } else {
      await client.from("notification_outbox").update({ sent_at: new Date().toISOString(), provider_id: result.data?.id, last_error: null }).eq("id", item.id); processed += 1;
    }
  }
  return { processed, skipped: false };
}
