import type { Locale } from "~/domain/types";

export function passwordSetupPath(locale: Locale) {
  return locale === "en-GB" ? "/en/activate/password" : "/activation/mot-de-passe";
}

export function isAllowedDuringRequiredPasswordSetup(pathname: string) {
  return pathname === "/activation/mot-de-passe"
    || pathname === "/en/activate/password"
    || pathname === "/auth/confirm"
    || pathname.startsWith("/media/");
}
