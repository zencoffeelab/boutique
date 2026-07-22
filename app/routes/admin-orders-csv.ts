import type { LoaderFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

function csv(value: unknown) {
  const text = String(value ?? "");
  const spreadsheetSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}
export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request); const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  const { data, error } = await client.from("orders").select("order_number,email,status,audience,subtotal_cents,shipping_charged_cents,total_cents,cost_of_goods_cents,actual_shipping_cost_cents,stripe_fee_cents,created_at,paid_at").order("created_at", { ascending: false }); if (error) return new Response(error.message, { status: 500 });
  const keys = ["order_number","email","status","audience","subtotal_cents","shipping_charged_cents","total_cents","cost_of_goods_cents","actual_shipping_cost_cents","stripe_fee_cents","created_at","paid_at"] as const; const body = [keys.join(","), ...(data ?? []).map((row) => keys.map((key) => csv(row[key])).join(","))].join("\r\n");
  return new Response(`\uFEFF${body}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="commandes-${new Date().toISOString().slice(0,10)}.csv"`, "cache-control": "private, no-store" } });
}
