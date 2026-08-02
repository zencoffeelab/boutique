import { ArrowLeft, Download, Inbox, Mail, MailOpen, Paperclip, PenLine, Reply, Search, Send } from "lucide-react";
import { Resend } from "resend";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { z } from "zod";
import { AdminShell } from "~/components/admin-shell";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { escapeEmailHtml } from "~/services/email-templates.server";

type MailAddress = { name?: string; address: string };
type MailAttachment = { id: string; filename: string; mime_type: string; size_bytes: number };
type AdminMailMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender_name: string | null;
  sender_address: string;
  recipients: MailAddress[];
  cc_addresses: MailAddress[];
  reply_to_address: string | null;
  subject: string;
  text_body: string | null;
  message_id_header: string | null;
  in_reply_to_header: string | null;
  references_header: string | null;
  parent_id: string | null;
  is_read: boolean;
  provider_id: string | null;
  raw_size: number;
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
  admin_mail_attachments: MailAttachment[];
};

type MailboxView = "inbox" | "sent";
type MailActionResult = { ok: boolean; message: string; errors?: Record<string, string[]> };

const openSchema = z.object({
  messageId: z.uuid(),
  view: z.enum(["inbox", "sent"]).default("inbox"),
  q: z.string().trim().max(120).default(""),
});
const sendSchema = z.object({
  recipient: z.email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  composeToken: z.uuid(),
  replyToId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
});
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

function mailboxUrl(view: MailboxView, q = "", messageId?: string) {
  const params = new URLSearchParams({ view });
  if (q) params.set("q", q);
  if (messageId) params.set("message", messageId);
  return `/admin/messagerie?${params}`;
}

function normalizeAddresses(value: unknown): MailAddress[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const address = "address" in entry && typeof entry.address === "string" ? entry.address : "";
    const name = "name" in entry && typeof entry.name === "string" ? entry.name : "";
    return address ? [{ name, address }] : [];
  });
}

function normalizeMessage(value: Record<string, unknown>): AdminMailMessage {
  return {
    ...value,
    direction: value.direction === "outbound" ? "outbound" : "inbound",
    recipients: normalizeAddresses(value.recipients),
    cc_addresses: normalizeAddresses(value.cc_addresses),
    admin_mail_attachments: Array.isArray(value.admin_mail_attachments) ? value.admin_mail_attachments as MailAttachment[] : [],
  } as AdminMailMessage;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const view: MailboxView = url.searchParams.get("view") === "sent" ? "sent" : "inbox";
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const selectedId = url.searchParams.get("reply") ?? url.searchParams.get("message");
  const compose = url.searchParams.get("compose") === "1";
  if (admin.demo) return { demo: true, view, query, compose, composeToken: crypto.randomUUID(), messages: [] as AdminMailMessage[], selected: null as AdminMailMessage | null, stats: { inbox: 0, unread: 0, sent: 0 } };
  const client = createServiceSupabase();
  if (!client) throw new Response("Base de données indisponible.", { status: 503 });
  const [messageResult, inboxResult, unreadResult, sentResult] = await Promise.all([
    client.from("admin_mail_messages").select("id,direction,sender_name,sender_address,recipients,cc_addresses,reply_to_address,subject,text_body,message_id_header,in_reply_to_header,references_header,parent_id,is_read,provider_id,raw_size,received_at,sent_at,created_at,admin_mail_attachments(id,filename,mime_type,size_bytes)").order("created_at", { ascending: false }).limit(250),
    client.from("admin_mail_messages").select("id", { count: "exact", head: true }).eq("direction", "inbound"),
    client.from("admin_mail_messages").select("id", { count: "exact", head: true }).eq("direction", "inbound").eq("is_read", false),
    client.from("admin_mail_messages").select("id", { count: "exact", head: true }).eq("direction", "outbound"),
  ]);
  const queryError = messageResult.error ?? inboxResult.error ?? unreadResult.error ?? sentResult.error;
  if (queryError) throw new Response(queryError.message, { status: 500 });
  const rows = messageResult.data;
  const allMessages = (rows ?? []).map((row) => normalizeMessage(row as Record<string, unknown>));
  const normalizedQuery = query.toLocaleLowerCase("fr-FR");
  const messages = allMessages.filter((message) => {
    if (message.direction !== (view === "sent" ? "outbound" : "inbound")) return false;
    if (!normalizedQuery) return true;
    const participants = [message.sender_name, message.sender_address, ...message.recipients.flatMap((recipient) => [recipient.name, recipient.address])].filter(Boolean).join(" ");
    return `${message.subject} ${participants}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
  });
  const selected = selectedId ? allMessages.find((message) => message.id === selectedId) ?? null : compose ? null : messages[0] ?? null;
  return {
    demo: false,
    view,
    query,
    compose,
    composeToken: crypto.randomUUID(),
    messages,
    selected,
    stats: {
      inbox: inboxResult.count ?? 0,
      unread: unreadResult.count ?? 0,
      sent: sentResult.count ?? 0,
    },
  };
}

function safeStorageFilename(filename: string, index: number) {
  return (filename || `piece-jointe-${index + 1}`).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || `piece-jointe-${index + 1}`;
}

function senderAddress(from: string) {
  return from.match(/<([^>]+)>/)?.[1]?.trim().toLocaleLowerCase("en-US") ?? from.trim().toLocaleLowerCase("en-US");
}

function emailHtml(body: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.65;color:#1f251d">${escapeEmailHtml(body).replace(/\n/g, "<br>")}</div>`;
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return data<MailActionResult>({ ok: false, message: "Les mutations sont désactivées en mode démonstration." }, { status: 403 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const client = createServiceSupabase();
  if (!client) return data<MailActionResult>({ ok: false, message: "Base de données indisponible." }, { status: 503 });

  if (intent === "open" || intent === "mark_read" || intent === "mark_unread") {
    const parsed = openSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return data<MailActionResult>({ ok: false, message: "Message invalide." }, { status: 422 });
    const isRead = intent !== "mark_unread";
    const { error } = await client.from("admin_mail_messages").update({ is_read: isRead, read_at: isRead ? new Date().toISOString() : null, read_by: isRead ? admin.id : null, updated_at: new Date().toISOString() }).eq("id", parsed.data.messageId);
    if (error) return data<MailActionResult>({ ok: false, message: error.message }, { status: 500 });
    throw redirect(mailboxUrl(parsed.data.view, parsed.data.q, parsed.data.messageId));
  }

  if (intent !== "send_mail") return data<MailActionResult>({ ok: false, message: "Action invalide." }, { status: 400 });
  const parsed = sendSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return data<MailActionResult>({ ok: false, message: "Vérifiez le destinataire, l’objet et le message.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
  const files = form.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  const totalAttachmentBytes = files.reduce((total, file) => total + file.size, 0);
  if (files.length > MAX_ATTACHMENTS || files.some((file) => file.size > MAX_ATTACHMENT_BYTES) || totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return data<MailActionResult>({ ok: false, message: "Ajoutez au maximum 5 pièces jointes de 10 Mo chacune, pour un total de 20 Mo." }, { status: 422 });
  }
  const config = env();
  if (!config.RESEND_API_KEY) return data<MailActionResult>({ ok: false, message: "Resend n’est pas configuré." }, { status: 503 });
  const parentResult = parsed.data.replyToId
    ? await client.from("admin_mail_messages").select("id,message_id_header,references_header").eq("id", parsed.data.replyToId).maybeSingle()
    : { data: null, error: null };
  if (parentResult.error) return data<MailActionResult>({ ok: false, message: parentResult.error.message }, { status: 500 });
  const parent = parentResult.data;
  const headers: Record<string, string> = {};
  if (parent?.message_id_header) {
    headers["In-Reply-To"] = parent.message_id_header;
    headers.References = [parent.references_header, parent.message_id_header].filter(Boolean).join(" ").slice(0, 4_000);
  }
  const preparedFiles = await Promise.all(files.map(async (file) => ({ filename: file.name, mimeType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) })));
  const sent = await new Resend(config.RESEND_API_KEY).emails.send({
    from: config.CONTACT_FROM_EMAIL,
    to: parsed.data.recipient,
    replyTo: senderAddress(config.CONTACT_FROM_EMAIL),
    subject: parsed.data.subject,
    text: parsed.data.body,
    html: emailHtml(parsed.data.body),
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    attachments: preparedFiles.length > 0 ? preparedFiles.map((file) => ({ filename: file.filename, content: Buffer.from(file.bytes) })) : undefined,
  }, { idempotencyKey: `admin-mail/${parsed.data.composeToken}` });
  if (sent.error || !sent.data?.id) return data<MailActionResult>({ ok: false, message: sent.error?.message ?? "L’e-mail n’a pas pu être envoyé." }, { status: 502 });
  const now = new Date().toISOString();
  const { data: stored, error: storeError } = await client.from("admin_mail_messages").insert({
    direction: "outbound",
    sender_name: "Zen Coffee Lab",
    sender_address: senderAddress(config.CONTACT_FROM_EMAIL),
    recipients: [{ name: "", address: parsed.data.recipient.toLocaleLowerCase("en-US") }],
    cc_addresses: [],
    reply_to_address: senderAddress(config.CONTACT_FROM_EMAIL),
    subject: parsed.data.subject,
    text_body: parsed.data.body,
    html_body: emailHtml(parsed.data.body),
    parent_id: parent?.id ?? null,
    is_read: true,
    read_at: now,
    read_by: admin.id,
    provider_id: sent.data.id,
    raw_size: new TextEncoder().encode(parsed.data.body).byteLength + totalAttachmentBytes,
    sent_at: now,
  }).select("id").single();
  if (storeError || !stored) return data<MailActionResult>({ ok: true, message: "L’e-mail est envoyé, mais son archivage a échoué." });
  for (const [index, file] of preparedFiles.entries()) {
    const filename = safeStorageFilename(file.filename, index);
    const storagePath = `${stored.id}/${String(index + 1).padStart(2, "0")}-${filename}`;
    const uploaded = await client.storage.from("admin-mail-attachments").upload(storagePath, file.bytes, { contentType: file.mimeType, upsert: true });
    if (!uploaded.error) await client.from("admin_mail_attachments").insert({ message_id: stored.id, filename: file.filename || filename, mime_type: file.mimeType, size_bytes: file.bytes.byteLength, storage_path: storagePath });
  }
  await client.from("audit_log").insert({ actor_id: admin.id, action: parent ? "admin_mail.replied" : "admin_mail.sent", entity_type: "admin_mail_message", entity_id: stored.id, after_data: { recipient: parsed.data.recipient, subject: parsed.data.subject, providerId: sent.data.id, attachmentCount: preparedFiles.length } });
  throw redirect(`/admin/messagerie?view=sent&message=${stored.id}&confirmation=mail-sent`);
}

export function headers() { return { "Cache-Control": "private, no-store" }; }

export const meta: MetaFunction = () => [
  { title: "Messagerie | Administration Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function messageDate(message: AdminMailMessage) {
  return message.sent_at ?? message.received_at ?? message.created_at;
}

function participantLabel(message: AdminMailMessage) {
  if (message.direction === "outbound") return message.recipients[0]?.name || message.recipients[0]?.address || "Destinataire inconnu";
  return message.sender_name || message.sender_address;
}

function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} o`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} Ko`;
  return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} Mo`;
}

function replySubject(subject: string) {
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

function MailComposer({ replyMessage, composeToken, result }: { replyMessage: AdminMailMessage | null; composeToken: string; result?: MailActionResult }) {
  const navigation = useNavigation();
  const sending = navigation.state === "submitting" && navigation.formData?.get("intent") === "send_mail";
  const replyRecipient = replyMessage
    ? replyMessage.direction === "inbound"
      ? replyMessage.reply_to_address || replyMessage.sender_address
      : replyMessage.recipients[0]?.address || ""
    : "";
  return <section className="admin-mail-compose" aria-labelledby="mail-compose-title">
    <div className="admin-mail-compose__heading">
      <div><p className="eyebrow">{replyMessage ? "Réponse" : "Nouveau message"}</p><h2 id="mail-compose-title">{replyMessage ? `Répondre à ${participantLabel(replyMessage)}` : "Rédiger un e-mail"}</h2></div>
      <Link className="ui-button ui-button--ghost ui-button--sm" to={replyMessage ? mailboxUrl(replyMessage.direction === "outbound" ? "sent" : "inbox", "", replyMessage.id) : "/admin/messagerie"}><ArrowLeft aria-hidden="true" /> Annuler</Link>
    </div>
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    <Form method="post" encType="multipart/form-data" className="admin-mail-compose__form">
      <input type="hidden" name="intent" value="send_mail" />
      <input type="hidden" name="composeToken" value={composeToken} />
      <input type="hidden" name="replyToId" value={replyMessage?.id ?? ""} />
      <label>Destinataire<input name="recipient" type="email" required autoComplete="email" defaultValue={replyRecipient} aria-invalid={Boolean(result?.errors?.recipient) || undefined} /></label>
      <label>Objet<input name="subject" required maxLength={200} defaultValue={replyMessage ? replySubject(replyMessage.subject) : ""} aria-invalid={Boolean(result?.errors?.subject) || undefined} /></label>
      <label>Message<textarea name="body" required rows={12} maxLength={20_000} aria-invalid={Boolean(result?.errors?.body) || undefined} /></label>
      <label className="admin-mail-compose__attachments"><span><Paperclip aria-hidden="true" /> Pièces jointes</span><input name="attachments" type="file" multiple /><small>5 fichiers maximum · 10 Mo par fichier · 20 Mo au total</small></label>
      <button className="ui-button ui-button--default" type="submit" disabled={sending}>{sending ? "Envoi…" : <><Send aria-hidden="true" /> Envoyer</>}</button>
    </Form>
  </section>;
}

function MailDetail({ message, view, query }: { message: AdminMailMessage; view: MailboxView; query: string }) {
  const recipientText = message.recipients.map((recipient) => recipient.name ? `${recipient.name} <${recipient.address}>` : recipient.address).join(", ");
  return <article className="admin-mail-detail">
    <header className="admin-mail-detail__heading">
      <div><p className="eyebrow">{message.direction === "inbound" ? "Message reçu" : "Message envoyé"}</p><h2>{message.subject}</h2></div>
      <div className="admin-mail-detail__actions">
        {message.direction === "inbound" ? <Link className="ui-button ui-button--outline ui-button--sm" to={`/admin/messagerie?compose=1&reply=${message.id}`}><Reply aria-hidden="true" /> Répondre</Link> : null}
        <Form method="post">
          <input type="hidden" name="intent" value={message.is_read ? "mark_unread" : "mark_read"} />
          <input type="hidden" name="messageId" value={message.id} />
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="q" value={query} />
          <button className="ui-button ui-button--ghost ui-button--sm" type="submit">{message.is_read ? <><Mail aria-hidden="true" /> Marquer non lu</> : <><MailOpen aria-hidden="true" /> Marquer lu</>}</button>
        </Form>
      </div>
    </header>
    <dl className="admin-mail-detail__meta">
      <div><dt>De</dt><dd>{message.sender_name ? `${message.sender_name} <${message.sender_address}>` : message.sender_address}</dd></div>
      <div><dt>À</dt><dd>{recipientText || "—"}</dd></div>
      <div><dt>Date</dt><dd><time dateTime={messageDate(message)}>{dateFormatter.format(new Date(messageDate(message)))}</time></dd></div>
    </dl>
    {message.admin_mail_attachments.length > 0 ? <section className="admin-mail-attachments" aria-label="Pièces jointes">
      {message.admin_mail_attachments.map((attachment) => <a key={attachment.id} href={`/admin/messagerie/${message.id}/pieces-jointes/${attachment.id}`}><Paperclip aria-hidden="true" /><span><strong>{attachment.filename}</strong><small>{formatFileSize(attachment.size_bytes)}</small></span><Download aria-hidden="true" /></a>)}
    </section> : null}
    <div className="admin-mail-detail__body">{message.text_body || "Ce message ne contient pas de version texte consultable."}</div>
  </article>;
}

export default function AdminMail() {
  const { demo, view, query, compose, composeToken, messages, selected, stats } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <AdminShell active="mail">
    <header className="admin-heading">
      <div><p className="eyebrow">Contact</p><h1>Messagerie</h1><p className="admin-heading__description">Consultez les messages reçus sur contact@zencoffeelab.com et répondez directement depuis le back-office.</p></div>
      <Link className="ui-button ui-button--default" to="/admin/messagerie?compose=1"><PenLine aria-hidden="true" /> Nouveau message</Link>
    </header>
    {demo ? <p className="admin-notice">Mode démonstration local : la messagerie est masquée et aucun e-mail ne peut être envoyé.</p> : null}
    {!compose && result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    <nav className="admin-mail-tabs" aria-label="Dossiers de messagerie">
      <Link className={view === "inbox" ? "is-active" : undefined} aria-current={view === "inbox" ? "page" : undefined} to="/admin/messagerie?view=inbox"><Inbox aria-hidden="true" /> Boîte de réception <span>{stats.inbox}</span>{stats.unread > 0 ? <strong>{stats.unread} non lu{stats.unread > 1 ? "s" : ""}</strong> : null}</Link>
      <Link className={view === "sent" ? "is-active" : undefined} aria-current={view === "sent" ? "page" : undefined} to="/admin/messagerie?view=sent"><Send aria-hidden="true" /> Envoyés <span>{stats.sent}</span></Link>
    </nav>
    <div className="admin-mail-layout">
      <aside className="admin-mail-list" aria-label={view === "inbox" ? "Messages reçus" : "Messages envoyés"}>
        <Form method="get" className="admin-mail-search">
          <input type="hidden" name="view" value={view} />
          <label><span className="sr-only">Rechercher dans la messagerie</span><Search aria-hidden="true" /><input name="q" type="search" defaultValue={query} placeholder="Rechercher…" /></label>
          <button className="ui-button ui-button--outline ui-button--sm" type="submit">Rechercher</button>
        </Form>
        <div className="admin-mail-list__items">
          {messages.map((message) => <Form method="post" key={message.id} className="admin-mail-open-form">
            <input type="hidden" name="intent" value="open" />
            <input type="hidden" name="messageId" value={message.id} />
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="q" value={query} />
            <button className={`admin-mail-item${selected?.id === message.id && !compose ? " is-active" : ""}${!message.is_read && message.direction === "inbound" ? " is-unread" : ""}`} type="submit">
              <span className="admin-mail-item__top"><strong>{participantLabel(message)}</strong><time dateTime={messageDate(message)}>{dateFormatter.format(new Date(messageDate(message)))}</time></span>
              <span className="admin-mail-item__subject">{message.subject}</span>
              <span className="admin-mail-item__preview">{message.text_body?.slice(0, 120) || "Aucun aperçu disponible"}</span>
              {message.admin_mail_attachments.length > 0 ? <span className="admin-mail-item__attachment"><Paperclip aria-hidden="true" /> {message.admin_mail_attachments.length}</span> : null}
            </button>
          </Form>)}
          {messages.length === 0 ? <p className="admin-empty-state">{query ? "Aucun message ne correspond à cette recherche." : view === "inbox" ? "Aucun e-mail reçu pour le moment." : "Aucun e-mail envoyé pour le moment."}</p> : null}
        </div>
      </aside>
      <div className="admin-mail-content">
        {compose ? <MailComposer key={selected?.id ?? "new"} replyMessage={selected} composeToken={composeToken} result={result} /> : selected ? <MailDetail message={selected} view={view} query={query} /> : <div className="admin-mail-empty"><Mail aria-hidden="true" /><h2>Sélectionnez un message</h2><p>Le contenu apparaîtra ici.</p></div>}
      </div>
    </div>
  </AdminShell>;
}
