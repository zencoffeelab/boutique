import type { LoaderFunctionArgs } from "react-router";
import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const viewer = await getViewer(request);
  if (!viewer) return Response.json({ ok: false, message: "Authentification requise." }, { status: 401 });
  if (viewer.profile?.professional_status !== "approved") return Response.json({ ok: false, message: "Accès professionnel requis." }, { status: 403 });
  if (!params.id) return Response.json({ ok: false, message: "Devis invalide." }, { status: 400 });
  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Base de données indisponible." }, { status: 503 });
  const { data: quote, error } = await client
    .from("professional_quotes")
    .select(`
      id, quote_number, status, total_weight_kg, subtotal_before_discount_cents, discount_cents, total_cents, valid_until, created_at,
      professional_quote_lines(id, product_name, variant_label, kilograms, discount_percent, discounted_price_cents_per_kg, line_total_cents, created_at)
    `)
    .eq("id", params.id)
    .eq("profile_id", viewer.user.id)
    .maybeSingle();
  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  if (!quote) return Response.json({ ok: false, message: "Devis introuvable." }, { status: 404 });
  const lines = (quote.professional_quote_lines ?? [])
    .toSorted((left, right) => left.created_at.localeCompare(right.created_at))
    .map(({ created_at: _, ...line }) => line);
  const { professional_quote_lines: _, ...summary } = quote;
  return Response.json({ ok: true, quote: { ...summary, lines } }, { headers: { "Cache-Control": "private, no-store" } });
}
