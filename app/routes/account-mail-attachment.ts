import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

function messageHasRecipient(recipients: unknown, email: string) {
  return (
    Array.isArray(recipients) &&
    recipients.some(
      (recipient) =>
        recipient &&
        typeof recipient === "object" &&
        "address" in recipient &&
        typeof recipient.address === "string" &&
        recipient.address.toLocaleLowerCase("en-US") === email,
    )
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const viewer = await getViewer(request);
  const email = viewer?.user.email?.toLocaleLowerCase("en-US");
  if (viewer?.profile?.professional_status !== "approved" || !email) {
    throw new Response("Accès non autorisé.", { status: 403 });
  }

  const messageId = z.uuid().safeParse(params.messageId);
  const attachmentId = z.uuid().safeParse(params.attachmentId);
  if (!messageId.success || !attachmentId.success) {
    throw new Response("Pièce jointe invalide.", { status: 400 });
  }

  const client = createServiceSupabase();
  if (!client) throw new Response("Stockage indisponible.", { status: 503 });

  const { data: message, error: messageError } = await client
    .from("admin_mail_messages")
    .select("id,direction,sender_address,recipients")
    .eq("id", messageId.data)
    .maybeSingle();
  if (messageError) throw new Response(messageError.message, { status: 500 });

  const mayReadMessage =
    message &&
    (message.direction === "inbound"
      ? message.sender_address.toLocaleLowerCase("en-US") === email
      : messageHasRecipient(message.recipients, email));
  if (!mayReadMessage)
    throw new Response("Pièce jointe introuvable.", { status: 404 });

  const { data: attachment, error } = await client
    .from("admin_mail_attachments")
    .select("filename,mime_type,storage_path")
    .eq("id", attachmentId.data)
    .eq("message_id", messageId.data)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  if (!attachment)
    throw new Response("Pièce jointe introuvable.", { status: 404 });

  const downloaded = await client.storage
    .from("admin-mail-attachments")
    .download(attachment.storage_path);
  if (downloaded.error || !downloaded.data) {
    throw new Response("Fichier indisponible.", { status: 404 });
  }

  const filename = attachment.filename.replace(/["\r\n]/g, "_");
  return new Response(downloaded.data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
