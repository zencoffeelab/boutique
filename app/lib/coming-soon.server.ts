import { comingSoonCopy, defaultComingSoonSettings, parseComingSoonSettings } from "~/lib/coming-soon";
import type { Locale } from "~/domain/types";
import { createServiceSupabase } from "~/lib/supabase.server";

type StoredTranslation = {
  locale?: unknown;
  title?: unknown;
  seo_description?: unknown;
  blocks?: unknown;
};

function storedMessage(translation: StoredTranslation | undefined) {
  if (Array.isArray(translation?.blocks)) {
    const block = translation.blocks.find((candidate) =>
      candidate && typeof candidate === "object" && (candidate as { type?: unknown }).type === "comingSoon"
    ) as { content?: unknown } | undefined;
    const content = block?.content;
    if (content && typeof content === "object" && typeof (content as { message?: unknown }).message === "string")
      return (content as { message: string }).message;
  }
  return typeof translation?.seo_description === "string" ? translation.seo_description : undefined;
}

export async function getComingSoonSettings() {
  const client = createServiceSupabase();
  if (!client) return parseComingSoonSettings(defaultComingSoonSettings);
  const { data, error } = await client
    .from("content_pages")
    .select("status,content_page_translations(locale,title,seo_description,blocks)")
    .eq("page_key", "coming-soon")
    .maybeSingle();
  if (error || !data) return parseComingSoonSettings(defaultComingSoonSettings);
  const storedTranslations = Array.isArray(data.content_page_translations)
    ? data.content_page_translations as StoredTranslation[]
    : [];
  const translation = (locale: Locale) => storedTranslations.find((candidate) => candidate.locale === locale);
  const french = translation("fr-FR");
  const english = translation("en-GB");
  return parseComingSoonSettings({
    active: data.status === "published",
    translations: {
      "fr-FR": { title: french?.title, message: storedMessage(french) },
      "en-GB": { title: english?.title, message: storedMessage(english) },
    },
  });
}

export async function getComingSoon(locale: Locale) {
  return comingSoonCopy(await getComingSoonSettings(), locale);
}
