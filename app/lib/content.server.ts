import type { Locale } from "~/domain/types";
import { createServiceSupabase } from "~/lib/supabase.server";

export type ContentPage = { title: string; seoTitle: string; seoDescription: string; blocks: Array<{ type: "paragraph"; content: string }> };
export async function getContentPage(pageKey: string, locale: Locale): Promise<ContentPage | null> {
  const client = createServiceSupabase(); if (!client) return null;
  const { data } = await client.from("content_pages").select("status,content_page_translations(title,seo_title,seo_description,blocks,locale)").eq("page_key", pageKey).eq("status", "published").maybeSingle();
  const translation = data?.content_page_translations?.find((item: any) => item.locale === locale); if (!translation) return null;
  return { title: translation.title, seoTitle: translation.seo_title, seoDescription: translation.seo_description, blocks: translation.blocks ?? [] };
}

export async function getFaqItems(locale: Locale) {
  const client = createServiceSupabase(); if (!client) return null;
  const { data } = await client.from("faq_items").select("*").eq("active", true).order("position");
  return (data ?? []).map((item) => locale === "fr-FR" ? [item.question_fr, item.answer_fr] : [item.question_en, item.answer_en]) as Array<[string, string]>;
}
