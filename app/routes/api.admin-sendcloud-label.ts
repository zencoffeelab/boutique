import type { LoaderFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { downloadSendcloudLabel } from "~/services/sendcloud-labels.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  if (!params.id) return new Response("Not found.", { status: 404 });
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  const { data } = await client.from("shipments").select("sendcloud_parcel_id,label_provider").eq("id", params.id).maybeSingle();
  if (!data?.sendcloud_parcel_id || data.label_provider !== "sendcloud") return new Response("Label not found.", { status: 404 });
  const response = await downloadSendcloudLabel(`https://panel.sendcloud.sc/api/v3/parcels/${encodeURIComponent(data.sendcloud_parcel_id)}/documents/label`);
  return new Response(response.body, { headers: { "content-type": response.headers.get("content-type") ?? "application/pdf", "content-disposition": `inline; filename="sendcloud-${data.sendcloud_parcel_id}.pdf"`, "cache-control": "private, no-store" } });
}
