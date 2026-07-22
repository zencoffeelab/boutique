import type { LoaderFunctionArgs } from "react-router";
import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const viewer = await getViewer(request); if (!viewer || !params.id) return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  const client = createServiceSupabase(); if (!client) return Response.json({ ok: false, message: "Database unavailable." }, { status: 503 });
  let query = client.from("orders").select("id, order_number, status, email, locale, subtotal_cents, shipping_charged_cents, total_cents, paid_at, created_at, order_lines(product_name,variant_label,quantity,unit_price_cents,line_total_cents), shipments(carrier,service,tracking_number,tracking_url,status,status_date)").eq("id", params.id);
  if (viewer.profile?.role !== "admin") query = query.eq("profile_id", viewer.user.id);
  const { data } = await query.maybeSingle(); if (!data) return Response.json({ ok: false, message: "Order not found." }, { status: 404 });
  return Response.json({ ok: true, order: data }, { headers: { "cache-control": "private, no-store" } });
}
