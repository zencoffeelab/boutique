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

export function optionalMfaSatisfied(verifiedFactorCount: number, currentLevel?: string | null) {
  return verifiedFactorCount === 0 || currentLevel === "aal2";
}

export async function getSessionStatus(request: Request) {
  const supabase = createRequestSupabase(request);
  if (!supabase) return { signedIn: false, professional: false, professionalUserId: null, accountInitials: null, admin: false, passwordSetupRequired: false, responseHeaders: new Headers() };
  let data: Awaited<ReturnType<typeof supabase.client.auth.getUser>>["data"];
  let error: Awaited<ReturnType<typeof supabase.client.auth.getUser>>["error"];
  try {
    ({ data, error } = await supabase.client.auth.getUser());
  } catch {
    // A temporary auth/network outage must not turn every public page into a 500.
    return { signedIn: false, professional: false, professionalUserId: null, accountInitials: null, admin: false, passwordSetupRequired: false, responseHeaders: supabase.responseHeaders };
  }
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
  const adminMfa = profile?.role === "admin"
    ? await Promise.all([
        supabase.client.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.client.auth.mfa.listFactors(),
      ])
    : null;
  const adminMfaAvailable = adminMfa && !adminMfa[0].error && !adminMfa[1].error;
  return {
    signedIn: !error && Boolean(data.user),
    professional: profile?.professional_status === "approved",
    professionalUserId: profile?.professional_status === "approved" ? data.user?.id ?? null : null,
    accountInitials: !error && data.user ? accountInitials(profile?.first_name, profile?.last_name, data.user.email) : null,
    admin: profile?.role === "admin" && Boolean(adminMfaAvailable) && optionalMfaSatisfied(adminMfa?.[1].data?.totp.length ?? 0, adminMfa?.[0].data?.currentLevel),
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
  const requestSupabase = createRequestSupabase(request);
  if (!requestSupabase) throw new Response("Authentication unavailable.", { status: 503 });
  const factors = await requestSupabase.client.auth.mfa.listFactors();
  if (factors.error) throw new Response("Unable to verify two-factor settings.", { status: 503 });
  const aal = factors.data.totp.length > 0
    ? await requestSupabase.client.auth.mfa.getAuthenticatorAssuranceLevel()
    : null;
  if (aal?.error) throw new Response("Unable to verify two-factor authentication.", { status: 503 });
  if (!optionalMfaSatisfied(factors.data.totp.length, aal?.data?.currentLevel)) {
    throw redirect(`${accountPath}?admin-login=2fa&next=${encodeURIComponent(next)}`, { headers: viewer.responseHeaders });
  }
  return { id: viewer.user.id, role: "admin" as const, demo: false };
}

export async function getAudience(request: Request): Promise<"retail" | "professional"> {
  const viewer = await getViewer(request);
  return viewer?.profile?.professional_status === "approved" ? "professional" : "retail";
}
