import type { LoaderFunctionArgs } from "react-router";
import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { getInvoicePdfDownload } from "~/services/invoice.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const viewer = await getViewer(request); if (!viewer || !params.id) return new Response("Unauthorized.", { status: 401 });
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  let query = client.from("orders").select("id").eq("id", params.id); if (viewer.profile?.role !== "admin") query = query.eq("profile_id", viewer.user.id);
  if (!(await query.maybeSingle()).data) return new Response("Order not found.", { status: 404 });
  const invoice = await getInvoicePdfDownload(params.id);
  if (!invoice) return new Response("Invoice not ready.", { status: 404 });
  return new Response(invoice.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
