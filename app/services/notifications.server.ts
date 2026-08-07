import { Resend } from "resend";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
export { escapeEmailHtml } from "~/services/email-templates.server";

export type NotificationKind = "pro_application" | "pro_application_confirmation" | "pro_decision" | "professional_quote" | "professional_quote_paid" | "invitation" | "order_confirmation" | "invoice" | "order_status" | "shipped" | "tracking" | "delivered" | "refund" | "password_reset" | "contact_message" | "contact_confirmation";

// A notification can need five subrequests (claim, metadata, download, Resend,
// and final status update). Keep each invocation safely below Workers Free's
// 50-subrequest ceiling, including the cron maintenance queries.
export const notificationBatchSize = 5;

export function notificationBatchLimit(limit = notificationBatchSize) {
  return Math.max(1, Math.min(Math.floor(limit), notificationBatchSize));
}

export async function enqueueNotification(input: { kind: NotificationKind; to: string; locale: "fr-FR" | "en-GB"; subject: string; html: string; payload?: Record<string, unknown>; dedupeKey?: string }) {
  const client = createServiceSupabase();
  if (!client) return { queued: false, demo: true };
  const { error } = await client.from("notification_outbox").insert({ kind: input.kind, recipient: input.to, locale: input.locale, subject: input.subject, html: input.html, payload: input.payload ?? {}, dedupe_key: input.dedupeKey ?? null });
  if (error?.code === "23505" && input.dedupeKey) return { queued: false, duplicate: true, demo: false };
  if (error) throw new Error(`Unable to queue notification: ${error.message}`);
  return { queued: true, demo: false };
}

export function dispatchNotificationQueue(context: unknown, logLabel: string, limit = notificationBatchSize) {
  const task = processNotificationQueue(limit).catch((cause) => {
    console.error(logLabel, { message: cause instanceof Error ? cause.message : String(cause) });
  });
  const cloudflare = (context as { cloudflare?: { ctx?: { waitUntil(promise: Promise<unknown>): void } } })?.cloudflare;
  if (cloudflare?.ctx) cloudflare.ctx.waitUntil(task);
  else void task;
}

export async function processNotificationQueue(limit = notificationBatchSize) {
  const config = env(); const client = createServiceSupabase();
  if (!client || !config.RESEND_API_KEY) return { processed: 0, skipped: true };
  const dueBefore = new Date(Date.now() + 5_000).toISOString();
  const { data, error } = await client.from("notification_outbox").select("*").is("sent_at", null).lte("next_attempt_at", dueBefore).order("created_at").limit(notificationBatchLimit(limit));
  if (error) throw new Error(`Unable to read notification queue: ${error.message}`);
  const resend = new Resend(config.RESEND_API_KEY); let processed = 0;
  for (const item of data ?? []) {
    const claimedAttempts = item.attempts + 1; const { data: claimed } = await client.from("notification_outbox").update({ attempts: claimedAttempts, next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", item.id).eq("attempts", item.attempts).is("sent_at", null).select("id").maybeSingle(); if (!claimed) continue;
    let attachments: Array<{ filename: string; content: Buffer }> | undefined;
    if ((item.kind === "invoice" || item.kind === "order_confirmation") && item.payload?.orderId) {
      const { data: invoice } = await client.from("invoices").select("invoice_number,storage_path").eq("order_id", String(item.payload.orderId)).maybeSingle();
      if (invoice?.storage_path) { const { data: file } = await client.storage.from("invoices").download(invoice.storage_path); if (file) attachments = [{ filename: `${invoice.invoice_number}.pdf`, content: Buffer.from(await file.arrayBuffer()) }]; }
    }
    if (item.kind === "professional_quote" && item.payload?.quoteId) {
      const { data: quote } = await client.from("professional_quotes").select("quote_number,storage_path").eq("id", String(item.payload.quoteId)).maybeSingle();
      if (quote?.storage_path) { const { data: file } = await client.storage.from("professional-quotes").download(quote.storage_path); if (file) attachments = [{ filename: `${quote.quote_number}.pdf`, content: Buffer.from(await file.arrayBuffer()) }]; }
    }
    const result = await resend.emails.send({ from: config.RESEND_FROM_EMAIL, to: item.recipient, subject: item.subject, html: item.html, attachments }, { idempotencyKey: item.dedupe_key || `notification/${item.id}` });
    if (result.error) {
      const minutes = Math.min(24 * 60, 2 ** claimedAttempts);
      await client.from("notification_outbox").update({ last_error: result.error.message, next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString() }).eq("id", item.id);
    } else {
      await client.from("notification_outbox").update({ sent_at: new Date().toISOString(), provider_id: result.data?.id, last_error: null }).eq("id", item.id); processed += 1;
    }
  }
  return { processed, skipped: false };
}
