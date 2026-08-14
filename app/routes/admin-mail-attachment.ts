import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) throw new Response("Pièce jointe indisponible en démonstration.", { status: 404 });
  const messageId = z.uuid().safeParse(params.messageId);
  const attachmentId = z.uuid().safeParse(params.attachmentId);
  if (!messageId.success || !attachmentId.success) throw new Response("Pièce jointe invalide.", { status: 400 });
  const client = createServiceSupabase();
  if (!client) throw new Response("Stockage indisponible.", { status: 503 });
  const { data: attachment, error } = await client
    .from("admin_mail_attachments")
    .select("filename,mime_type,storage_path")
    .eq("id", attachmentId.data)
    .eq("message_id", messageId.data)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  if (!attachment) throw new Response("Pièce jointe introuvable.", { status: 404 });
  const downloaded = await client.storage.from("admin-mail-attachments").download(attachment.storage_path);
  if (downloaded.error || !downloaded.data) throw new Response("Fichier indisponible.", { status: 404 });
  const filename = attachment.filename.replace(/["\r\n]/g, "_");
  const inline = new URL(request.url).searchParams.get("inline") === "1" && attachment.mime_type.startsWith("image/");
  return new Response(downloaded.data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
