import type { Locale } from "~/domain/types";

export type ComingSoonCopy = {
  title: string;
  message: string;
};

export type ComingSoonSettings = {
  active: boolean;
  translations: Record<Locale, ComingSoonCopy>;
};

export const defaultComingSoonSettings: ComingSoonSettings = {
  active: false,
  translations: {
    "fr-FR": {
      title: "Notre nouveau site arrive bientôt.",
      message: "Zen Coffee Lab prépare une nouvelle expérience. Revenez nous voir très prochainement.",
    },
    "en-GB": {
      title: "Our new website is coming soon.",
      message: "Zen Coffee Lab is preparing a new experience. Come back and see us very soon.",
    },
  },
};

function cleanText(value: unknown, fallback: string, maximumLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

export function parseComingSoonSettings(value: unknown): ComingSoonSettings {
  if (!value || typeof value !== "object") return structuredClone(defaultComingSoonSettings);
  const candidate = value as Partial<ComingSoonSettings>;
  const translations = candidate.translations && typeof candidate.translations === "object"
    ? candidate.translations as Partial<Record<Locale, Partial<ComingSoonCopy>>>
    : {};
  return {
    active: candidate.active === true,
    translations: {
      "fr-FR": {
        title: cleanText(translations["fr-FR"]?.title, defaultComingSoonSettings.translations["fr-FR"].title, 140),
        message: cleanText(translations["fr-FR"]?.message, defaultComingSoonSettings.translations["fr-FR"].message, 500),
      },
      "en-GB": {
        title: cleanText(translations["en-GB"]?.title, defaultComingSoonSettings.translations["en-GB"].title, 140),
        message: cleanText(translations["en-GB"]?.message, defaultComingSoonSettings.translations["en-GB"].message, 500),
      },
    },
  };
}

export function comingSoonCopy(settings: ComingSoonSettings, locale: Locale) {
  return { active: settings.active, ...settings.translations[locale] };
}

export function isComingSoonExemptPath(pathname: string) {
  return pathname === "/admin"
    || pathname.startsWith("/admin/")
    || pathname === "/activation/mot-de-passe"
    || pathname === "/en/activate/password";
}

export function shouldShowComingSoon(active: boolean, pathname: string, isAdmin: boolean) {
  return active && !isAdmin && !isComingSoonExemptPath(pathname);
}
