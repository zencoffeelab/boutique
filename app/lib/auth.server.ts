import { redirect } from "react-router";
import { env } from "./env.server";
import { createRequestSupabase } from "./supabase.server";

export function accountInitials(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const initials = [firstName, lastName]
    .map((value) => value?.trim().charAt(0) ?? "")
    .filter(Boolean)
    .join("")
    .slice(0, 2);
  return (initials || email?.trim().slice(0, 2) || "Z").toLocaleUpperCase("fr-FR");
}

export async function getSessionStatus(request: Request) {
  const supabase = createRequestSupabase(request);
  if (!supabase) return { signedIn: false, professional: false, professionalUserId: null, accountInitials: null, admin: false, passwordSetupRequired: false, responseHeaders: new Headers() };
  const { data, error } = await supabase.client.auth.getUser();
  let profile: { role?: string | null; professional_status?: string | null; password_setup_required?: boolean; first_name?: string | null; last_name?: string | null } | null = null;
  if (!error && data.user) {
    const result = await supabase.client.from("profiles").select("role,professional_status,password_setup_required,first_name,last_name").eq("id", data.user.id).maybeSingle();
    if (result.error?.code === "42703") {
      const legacy = await supabase.client.from("profiles").select("role,professional_status,first_name,last_name").eq("id", data.user.id).maybeSingle();
      if (legacy.error) throw new Response("Unable to verify account activation status.", { status: 503 });
      profile = legacy.data;
    } else if (result.error) {
      throw new Response("Unable to verify account activation status.", { status: 503 });
    } else {
      profile = result.data;
    }
  }
  const adminAssurance = profile?.role === "admin"
    ? await supabase.client.auth.mfa.getAuthenticatorAssuranceLevel()
    : null;
  return {
    signedIn: !error && Boolean(data.user),
    professional: profile?.professional_status === "approved",
    professionalUserId: profile?.professional_status === "approved" ? data.user?.id ?? null : null,
    accountInitials: !error && data.user ? accountInitials(profile?.first_name, profile?.last_name, data.user.email) : null,
    admin: profile?.role === "admin" && adminAssurance?.data?.currentLevel === "aal2",
    passwordSetupRequired: profile?.password_setup_required === true,
    responseHeaders: supabase.responseHeaders,
  };
}

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
    throw redirect(`${accountPath}?admin-login=2fa&next=${encodeURIComponent(next)}`, { headers: viewer.responseHeaders });
  }
  return { id: viewer.user.id, role: "admin" as const, demo: false };
}

export async function getAudience(request: Request): Promise<"retail" | "professional"> {
  const viewer = await getViewer(request);
  return viewer?.profile?.professional_status === "approved" ? "professional" : "retail";
}
