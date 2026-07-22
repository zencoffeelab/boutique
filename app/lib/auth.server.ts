import { redirect } from "react-router";
import { env } from "./env.server";
import { createRequestSupabase } from "./supabase.server";

export async function getViewer(request: Request) {
  const supabase = createRequestSupabase(request);
  if (!supabase) return null;
  const { data, error } = await supabase.client.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase.client
    .from("profiles")
    .select("id, role, professional_status, first_name, last_name")
    .eq("id", data.user.id)
    .maybeSingle();
  return { user: data.user, profile, responseHeaders: supabase.responseHeaders };
}

export async function requireAdmin(request: Request) {
  if (env().NODE_ENV !== "production" && env().DEMO_ADMIN) {
    return { id: "demo-admin", role: "admin" as const, demo: true };
  }
  const viewer = await getViewer(request);
  const url = new URL(request.url);
  const next = `${url.pathname}${url.search}`;
  const accountPath = url.pathname.startsWith("/en/") ? "/en/my-account" : "/mon-compte";
  if (!viewer?.profile || viewer.profile.role !== "admin") {
    throw redirect(`${accountPath}?next=${encodeURIComponent(next)}`, { headers: viewer?.responseHeaders });
  }
  const aal = await createRequestSupabase(request)?.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.data?.currentLevel !== "aal2") {
    throw redirect(`${accountPath}?mfa=1&next=${encodeURIComponent(next)}`, { headers: viewer.responseHeaders });
  }
  return { id: viewer.user.id, role: "admin" as const, demo: false };
}

export async function getAudience(request: Request): Promise<"retail" | "professional"> {
  const viewer = await getViewer(request);
  return viewer?.profile?.professional_status === "approved" ? "professional" : "retail";
}
