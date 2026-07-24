import type { SupabaseClient } from "@supabase/supabase-js";

type ProfessionalLocale = "fr-FR" | "en-GB";

export class ProfessionalAccessError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export function professionalAccessPaths(locale: ProfessionalLocale) {
  return locale === "en-GB"
    ? { account: "/en/my-account", professional: "/en/professional" }
    : { account: "/mon-compte", professional: "/professionnel" };
}

export function authUserAlreadyExists(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["email_exists", "user_already_exists"].includes(error.code ?? "")) return true;
  return /already (?:registered|exists)|déjà (?:enregistré|utilisé)/i.test(error.message ?? "");
}

export function professionalDecisionFeedback(input: {
  approved: boolean;
  email: string;
  emailConfigured: boolean;
  emailQueued: boolean;
  activationUrl?: string;
}): { message: string; activationUrl?: string } {
  if (input.emailConfigured && input.emailQueued) {
    return {
      message: input.approved
        ? `Demande approuvée. L’e-mail d’activation est en cours d’envoi à ${input.email}.`
        : `Demande refusée. L’e-mail d’information est en cours d’envoi à ${input.email}.`,
    };
  }
  if (input.approved) {
    return {
      message: "Demande approuvée. L’envoi automatique n’est pas disponible : transmettez le lien d’activation ci-dessous au professionnel.",
      activationUrl: input.activationUrl,
    };
  }
  return { message: "Demande refusée, mais l’e-mail d’information n’a pas pu être envoyé automatiquement." };
}

export async function generateProfessionalAccessLink(
  client: SupabaseClient,
  input: { email: string; locale: ProfessionalLocale; siteUrl: string },
): Promise<{ url: string; userId: string; type: "invite" | "recovery"; existingUser: boolean }> {
  const paths = professionalAccessPaths(input.locale);
  const redirectTo = new URL(paths.professional, input.siteUrl).toString();
  let type: "invite" | "recovery" = "invite";
  let generated = await client.auth.admin.generateLink({ type, email: input.email, options: { redirectTo } });

  if (generated.error && authUserAlreadyExists(generated.error)) {
    type = "recovery";
    generated = await client.auth.admin.generateLink({ type, email: input.email, options: { redirectTo } });
  }

  if (generated.error) throw new ProfessionalAccessError(generated.error.message);
  const userId = generated.data.user?.id;
  const tokenHash = generated.data.properties?.hashed_token;
  if (!userId || !tokenHash) throw new ProfessionalAccessError("Supabase n’a pas renvoyé de lien d’accès professionnel complet.");

  const next = `${paths.account}?set-password=1&next=${encodeURIComponent(paths.professional)}`;
  const confirmation = new URL("/auth/confirm", input.siteUrl);
  confirmation.searchParams.set("token_hash", tokenHash);
  confirmation.searchParams.set("type", type);
  confirmation.searchParams.set("next", next);
  return { url: confirmation.toString(), userId, type, existingUser: type === "recovery" };
}
