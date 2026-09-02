import PostalMime, { type Address, type Attachment } from "postal-mime";

export interface EmailForwardingEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface ForwardableEmail {
  readonly from?: string;
  readonly to?: string;
  readonly headers?: Headers;
  readonly raw?: ReadableStream;
  readonly rawSize?: number;
  forward(recipient: string): Promise<unknown>;
  setReject(reason: string): void;
}

type StoredAddress = { name: string; address: string };

const HTML_BLOCKS = /<\/(p|div|li|h[1-6]|blockquote|tr)>/gi;
const HTML_BREAKS = /<br\s*\/?>/gi;
const HTML_TAGS = /<[^>]+>/g;
const HTML_SPACING = /\n{3,}/g;

function flattenAddresses(addresses: Address[] | undefined): StoredAddress[] {
  return (addresses ?? []).flatMap((entry) => {
    if ("group" in entry && entry.group) return entry.group.map((mailbox) => ({ name: mailbox.name ?? "", address: mailbox.address.toLocaleLowerCase("en-US") }));
    return entry.address ? [{ name: entry.name ?? "", address: entry.address.toLocaleLowerCase("en-US") }] : [];
  });
}

function firstAddress(address: Address | undefined): StoredAddress | null {
  return flattenAddresses(address ? [address] : [])[0] ?? null;
}

function htmlToPlainText(html: string | undefined) {
  if (!html) return "";
  return html
    .replace(HTML_BREAKS, "\n")
    .replace(HTML_BLOCKS, "\n")
    .replace(HTML_TAGS, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(HTML_SPACING, "\n\n")
    .trim();
}

function safeFilename(filename: string | null, index: number) {
  const normalized = (filename || `piece-jointe-${index + 1}`).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 180) || `piece-jointe-${index + 1}`;
}

function attachmentBytes(attachment: Attachment) {
  if (typeof attachment.content === "string") return new TextEncoder().encode(attachment.content);
  return attachment.content instanceof Uint8Array ? attachment.content : new Uint8Array(attachment.content);
}

async function stableMessageId(raw: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", raw);
  const suffix = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `<cloudflare-${suffix}@zencoffeelab.com>`;
}

function supabaseHeaders(env: EmailForwardingEnv, extra?: HeadersInit) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    ...extra,
  };
}

export function classifyIncomingEmail(input: { senderAddress: string; recipientAddresses: string[]; subject: string; text: string; headers?: Headers }) {
  const searchable = `${input.subject} ${input.text}`.toLocaleLowerCase("en-US");
  const spamStatus = input.headers?.get("x-spam-status") ?? "";
  const links = (input.text.match(/https?:\/\//gi) ?? []).length;
  const spamTerms = /(buy now|seo service|guest post|backlinks?|crypto(?:currency)?|bitcoin|casino|viagra|loan approval|traffic to your website|rank your website)/i;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.senderAddress) || /\byes\b/i.test(spamStatus) || spamTerms.test(searchable) || links > 5) return "Spam";
  const noReplyNotification = /(no-?reply|no.?reply)/i.test(input.senderAddress);
  const actualDeliveryError = /(mailer-daemon|postmaster|bounce|delivery status|undeliverable|failed|failure|error|erreur|exception|stack trace|http 5\d\d)/i.test(`${input.senderAddress} ${input.subject} ${searchable}`);
  if (noReplyNotification && !actualDeliveryError) return "Système";
  if (/(mailer-daemon|postmaster|no-?reply|no.?reply|bounce|delivery status|undeliverable|erreur|error|failed|failure)/i.test(`${input.senderAddress} ${input.subject}`) || /(exception|stack trace|http 5\d\d|delivery failed|échec de livraison|erreur système)/i.test(searchable)) return "Erreur";
  if (/(system|système|notification|automated|automatique|cron|stripe|sendcloud|supabase|cloudflare)/i.test(`${input.senderAddress} ${searchable}`)) return "Système";
  const professional = /(professionnel|entreprise|société|siret|tva|facture pro|devis|grossiste|revendeur|wholesale|company|business|vat|invoice)/i.test(searchable);
  const siteMessage = input.recipientAddresses.some((address) => /@(?:www\.)?zencoffeelab\.com$/i.test(address));
  return `${siteMessage ? "Site" : "Extérieur"} · Client ${professional ? "professionnel" : "particulier"}`;
}

async function classificationLabelId(env: EmailForwardingEnv, name: string) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/admin_mail_labels`);
  url.searchParams.set("name", `eq.${name}`);
  url.searchParams.set("select", "id");
  const response = await fetch(url, { headers: supabaseHeaders(env) });
  if (!response.ok) return null;
  return ((await response.json()) as Array<{ id: string }>)[0]?.id ?? null;
}

async function persistAttachments(env: EmailForwardingEnv, messageId: string, attachments: Attachment[]) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || attachments.length === 0) return;
  const rows: Array<{ message_id: string; filename: string; mime_type: string; size_bytes: number; storage_path: string; content_id: string | null; disposition: "attachment" | "inline" | null }> = [];

  for (const [index, attachment] of attachments.entries()) {
    const content = attachmentBytes(attachment);
    const filename = safeFilename(attachment.filename, index);
    const storagePath = `${messageId}/${String(index + 1).padStart(2, "0")}-${filename}`;
    const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
    const upload = await fetch(`${env.SUPABASE_URL}/storage/v1/object/admin-mail-attachments/${encodedPath}`, {
      method: "POST",
      headers: supabaseHeaders(env, { "Content-Type": attachment.mimeType || "application/octet-stream", "x-upsert": "true" }),
      body: Uint8Array.from(content).buffer,
    });
    if (!upload.ok) throw new Error(`Unable to store attachment ${filename}: ${upload.status}`);
    rows.push({
      message_id: messageId,
      filename: attachment.filename || filename,
      mime_type: attachment.mimeType || "application/octet-stream",
      size_bytes: content.byteLength,
      storage_path: storagePath,
      content_id: attachment.contentId?.trim().replace(/^<|>$/g, "") || null,
      disposition: attachment.disposition,
    });
  }

  const stored = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_mail_attachments?on_conflict=storage_path`, {
    method: "POST",
    headers: supabaseHeaders(env, { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!stored.ok) throw new Error(`Unable to register attachments: ${stored.status}`);
}

export async function persistIncomingEmail(message: ForwardableEmail, env: EmailForwardingEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !message.raw) return null;
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
  const sender = firstAddress(parsed.from) ?? { name: "", address: message.from?.toLocaleLowerCase("en-US") || "expediteur-inconnu@invalid.local" };
  const replyTo = flattenAddresses(parsed.replyTo)[0]?.address ?? null;
  const recipients = flattenAddresses(parsed.to);
  if (recipients.length === 0 && message.to) recipients.push({ name: "", address: message.to.toLocaleLowerCase("en-US") });
  const messageIdHeader = (parsed.messageId || message.headers?.get("message-id") || await stableMessageId(raw)).slice(0, 998);
  const receivedDate = parsed.date && !Number.isNaN(Date.parse(parsed.date)) ? new Date(parsed.date).toISOString() : new Date().toISOString();
  const classification = classifyIncomingEmail({ senderAddress: sender.address, recipientAddresses: recipients.map((recipient) => recipient.address), subject: parsed.subject?.trim() || "", text: parsed.text?.trim() || htmlToPlainText(parsed.html), headers: message.headers });
  const labelId = await classificationLabelId(env, classification);
  const body = {
    direction: "inbound",
    sender_name: sender.name || null,
    sender_address: sender.address,
    recipients,
    cc_addresses: flattenAddresses(parsed.cc),
    reply_to_address: replyTo,
    subject: (parsed.subject?.trim() || "(Sans objet)").slice(0, 998),
    text_body: (parsed.text?.trim() || htmlToPlainText(parsed.html)).slice(0, 2_000_000) || null,
    html_body: parsed.html?.slice(0, 2_000_000) || null,
    message_id_header: messageIdHeader,
    in_reply_to_header: parsed.inReplyTo?.slice(0, 998) || null,
    references_header: parsed.references?.slice(0, 4_000) || null,
    label_id: labelId,
    is_read: false,
    raw_size: message.rawSize ?? raw.byteLength,
    received_at: receivedDate,
  };
  const endpoint = `${env.SUPABASE_URL}/rest/v1/admin_mail_messages?on_conflict=message_id_header&select=id`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: supabaseHeaders(env, { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Unable to store incoming email: ${response.status}`);
  const inserted = await response.json() as Array<{ id: string }>;
  let storedMessageId = inserted[0]?.id;
  if (!storedMessageId) {
    const lookup = new URL(`${env.SUPABASE_URL}/rest/v1/admin_mail_messages`);
    lookup.searchParams.set("message_id_header", `eq.${messageIdHeader}`);
    lookup.searchParams.set("select", "id");
    const existing = await fetch(lookup, { headers: supabaseHeaders(env) });
    if (!existing.ok) throw new Error(`Unable to find stored incoming email: ${existing.status}`);
    storedMessageId = ((await existing.json()) as Array<{ id: string }>)[0]?.id;
  }
  if (!storedMessageId) throw new Error("Incoming email storage returned no identifier.");
  await persistAttachments(env, storedMessageId, parsed.attachments);
  return storedMessageId;
}

export default {
  async email(message: ForwardableEmail, env: EmailForwardingEnv) {
    try {
      const storedMessageId = await persistIncomingEmail(message, env);
      if (!storedMessageId) throw new Error("Incoming email storage is not configured.");
    } catch (cause) {
      console.error("incoming_email_storage_failed", { message: cause instanceof Error ? cause.message : String(cause) });
      message.setReject("La messagerie Zen Coffee Lab est temporairement indisponible. Veuillez réessayer plus tard.");
    }
  },
};
