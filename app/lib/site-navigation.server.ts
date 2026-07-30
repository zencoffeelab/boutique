import { createServiceSupabase } from "~/lib/supabase.server";
import { defaultSiteNavigation, parseSiteNavigationConfiguration } from "~/lib/site-navigation";

export async function getSiteNavigation() {
  const client = createServiceSupabase();
  if (!client) return parseSiteNavigationConfiguration(defaultSiteNavigation);
  const { data, error } = await client
    .from("content_pages")
    .select("content_page_translations(blocks)")
    .eq("page_key", "navigation")
    .eq("status", "published")
    .maybeSingle();
  if (error) return parseSiteNavigationConfiguration(defaultSiteNavigation);
  const translations = data?.content_page_translations as Array<{ blocks?: unknown }> | undefined;
  const block = Array.isArray(translations?.[0]?.blocks)
    ? translations[0].blocks.find((candidate: unknown) => candidate && typeof candidate === "object" && (candidate as { type?: unknown }).type === "siteNavigation")
    : null;
  return parseSiteNavigationConfiguration(block && typeof block === "object" ? (block as { content?: unknown }).content : null);
}
