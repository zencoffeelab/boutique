import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { getSignedProfessionalQuoteUrl } from "~/services/professional-quotes.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const viewer = await getViewer(request);
  if (!viewer || !params.id) return new Response("Unauthorized.", { status: 401 });
  const client = createServiceSupabase();
  if (!client) return new Response("Database unavailable.", { status: 503 });
  let query = client.from("professional_quotes").select("id").eq("id", params.id);
  if (viewer.profile?.role !== "admin") query = query.eq("profile_id", viewer.user.id);
  if (!(await query.maybeSingle()).data) return new Response("Quote not found.", { status: 404 });
  const url = await getSignedProfessionalQuoteUrl(params.id);
  return url ? redirect(url) : new Response("Quote PDF not ready.", { status: 404 });
}
