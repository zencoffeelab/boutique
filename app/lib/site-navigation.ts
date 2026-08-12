import type { Locale } from "~/domain/types";

export const navigationItemKeys = [
  "home",
  "shop",
  "professional",
  "advice",
  "about",
  "archives",
  "faq",
  "contact",
  "terms",
  "legal",
  "privacy",
  "available-products",
] as const;

export type NavigationItemKey = (typeof navigationItemKeys)[number];

export type SiteNavigationItem = Readonly<{
  key: NavigationItemKey;
  adminLabel: string;
  labels: Readonly<Record<Locale, string>>;
  footerLabels?: Readonly<Record<Locale, string>>;
  paths?: Readonly<Record<Locale, string>>;
  footerOnly?: boolean;
}>;

export type FooterNavigationColumn = {
  id: string;
  titles: Record<Locale, string>;
  items: NavigationItemKey[];
};

export type SiteNavigationConfiguration = {
  menu: NavigationItemKey[];
  footerColumns: FooterNavigationColumn[];
};

export const siteNavigationItems: readonly SiteNavigationItem[] = [
  { key: "home", adminLabel: "Accueil", labels: { "fr-FR": "Accueil", "en-GB": "Home" }, paths: { "fr-FR": "/", "en-GB": "/en" } },
  { key: "shop", adminLabel: "Boutique", labels: { "fr-FR": "Boutique", "en-GB": "Shop" }, footerLabels: { "fr-FR": "Tous les cafés", "en-GB": "All coffees" }, paths: { "fr-FR": "/boutique", "en-GB": "/en/shop" } },
  { key: "professional", adminLabel: "Professionnels", labels: { "fr-FR": "Professionnels", "en-GB": "Professionals" }, paths: { "fr-FR": "/professionnel", "en-GB": "/en/professional" } },
  { key: "advice", adminLabel: "Blog", labels: { "fr-FR": "Blog", "en-GB": "Blog" }, paths: { "fr-FR": "/conseils", "en-GB": "/en/tips" } },
  { key: "about", adminLabel: "À propos", labels: { "fr-FR": "À propos", "en-GB": "About us" }, paths: { "fr-FR": "/a-propos", "en-GB": "/en/about-us" } },
  { key: "archives", adminLabel: "Archives", labels: { "fr-FR": "Archives", "en-GB": "Archives" }, paths: { "fr-FR": "/archives", "en-GB": "/en/archives" } },
  { key: "faq", adminLabel: "FAQ", labels: { "fr-FR": "FAQ", "en-GB": "FAQ" }, paths: { "fr-FR": "/faq", "en-GB": "/en/faq" } },
  { key: "contact", adminLabel: "Contact", labels: { "fr-FR": "Contact", "en-GB": "Contact" }, paths: { "fr-FR": "/contact", "en-GB": "/en/contact" } },
  { key: "terms", adminLabel: "Conditions générales de vente", labels: { "fr-FR": "CGV", "en-GB": "Terms" }, paths: { "fr-FR": "/cgv", "en-GB": "/en/general-terms-and-conditions-of-sale" } },
  { key: "legal", adminLabel: "Mentions légales", labels: { "fr-FR": "Mentions légales", "en-GB": "Legal notice" }, paths: { "fr-FR": "/mentions-legales", "en-GB": "/en/legal-notice" } },
  { key: "privacy", adminLabel: "Politique de confidentialité", labels: { "fr-FR": "Politique de confidentialité", "en-GB": "Privacy policy" }, paths: { "fr-FR": "/politique-de-confidentialite", "en-GB": "/en/privacy-policy" } },
  { key: "available-products", adminLabel: "Cafés en stock (automatique)", labels: { "fr-FR": "Cafés en stock", "en-GB": "Available coffees" }, footerOnly: true },
] as const;

const itemByKey = new Map(siteNavigationItems.map((item) => [item.key, item]));
const validKeys = new Set<string>(navigationItemKeys);

export const defaultSiteNavigation: SiteNavigationConfiguration = {
  menu: ["shop", "professional", "advice", "about"],
  footerColumns: [
    { id: "explore", titles: { "fr-FR": "Explorer", "en-GB": "Explore" }, items: ["shop", "professional", "archives"] },
    { id: "help", titles: { "fr-FR": "Aide", "en-GB": "Help" }, items: ["faq", "contact", "terms", "legal", "privacy"] },
    { id: "shop", titles: { "fr-FR": "Boutique", "en-GB": "Shop" }, items: ["shop", "available-products"] },
  ],
};

export function getSiteNavigationItem(key: NavigationItemKey) {
  return itemByKey.get(key)!;
}

export function siteNavigationLabel(key: NavigationItemKey, locale: Locale, placement: "menu" | "footer" = "menu") {
  const item = getSiteNavigationItem(key);
  return placement === "footer" ? item.footerLabels?.[locale] ?? item.labels[locale] : item.labels[locale];
}

function navigationKey(value: unknown): NavigationItemKey | null {
  return typeof value === "string" && validKeys.has(value) ? value as NavigationItemKey : null;
}

function uniqueKeys(value: unknown, footer: boolean) {
  if (!Array.isArray(value)) return null;
  const seen = new Set<NavigationItemKey>();
  return value.flatMap((candidate) => {
    const key = navigationKey(candidate);
    if (!key || seen.has(key) || (!footer && getSiteNavigationItem(key).footerOnly)) return [];
    seen.add(key);
    return [key];
  });
}

export function cloneSiteNavigation(configuration: SiteNavigationConfiguration): SiteNavigationConfiguration {
  return {
    menu: [...configuration.menu],
    footerColumns: configuration.footerColumns.map((column) => ({
      id: column.id,
      titles: { ...column.titles },
      items: [...column.items],
    })),
  };
}

export function parseSiteNavigationConfiguration(value: unknown): SiteNavigationConfiguration {
  if (!value || typeof value !== "object") return cloneSiteNavigation(defaultSiteNavigation);
  const candidate = value as Partial<SiteNavigationConfiguration>;
  const menu = uniqueKeys(candidate.menu, false) ?? [...defaultSiteNavigation.menu];
  if (!Array.isArray(candidate.footerColumns) || candidate.footerColumns.length !== 3)
    return { menu, footerColumns: cloneSiteNavigation(defaultSiteNavigation).footerColumns };

  const usedIds = new Set<string>();
  const footerColumns = candidate.footerColumns.map((rawColumn, index) => {
    const column = rawColumn && typeof rawColumn === "object" ? rawColumn as Partial<FooterNavigationColumn> : {};
    const fallback = defaultSiteNavigation.footerColumns[index];
    const requestedId = typeof column.id === "string" && /^[a-z0-9-]{1,40}$/.test(column.id) ? column.id : fallback.id;
    const id = usedIds.has(requestedId) ? `${fallback.id}-${index + 1}` : requestedId;
    usedIds.add(id);
    const titles = column.titles && typeof column.titles === "object" ? column.titles as Partial<Record<Locale, string>> : {};
    const items = uniqueKeys(column.items, true) ?? [];
    return {
      id,
      titles: {
        "fr-FR": typeof titles["fr-FR"] === "string" && titles["fr-FR"].trim() ? titles["fr-FR"].trim().slice(0, 60) : fallback.titles["fr-FR"],
        "en-GB": typeof titles["en-GB"] === "string" && titles["en-GB"].trim() ? titles["en-GB"].trim().slice(0, 60) : fallback.titles["en-GB"],
      },
      items,
    };
  });
  return { menu, footerColumns };
}
