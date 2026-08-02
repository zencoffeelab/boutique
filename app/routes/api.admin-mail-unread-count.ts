import type { LoaderFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return Response.json({ unread: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  const client = createServiceSupabase();
  if (!client) return Response.json({ unread: 0, error: "Base de données indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  const { count, error } = await client.from("admin_mail_messages").select("id", { count: "exact", head: true }).eq("direction", "inbound").eq("is_read", false);
  if (error) return Response.json({ unread: 0, error: error.message }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  return Response.json({ unread: Math.min(count ?? 0, 999) }, { headers: { "Cache-Control": "private, no-store" } });
}
