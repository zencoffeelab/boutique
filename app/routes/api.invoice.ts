import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { getSignedInvoiceUrl } from "~/services/invoice.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const viewer = await getViewer(request); if (!viewer || !params.id) return new Response("Unauthorized.", { status: 401 });
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  let query = client.from("orders").select("id").eq("id", params.id); if (viewer.profile?.role !== "admin") query = query.eq("profile_id", viewer.user.id);
  if (!(await query.maybeSingle()).data) return new Response("Order not found.", { status: 404 });
  const url = await getSignedInvoiceUrl(params.id); if (!url) return new Response("Invoice not ready.", { status: 404 }); return redirect(url);
}
