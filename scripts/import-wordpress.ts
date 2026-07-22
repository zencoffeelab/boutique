import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (existsSync(".env")) process.loadEnvFile(".env");

type Locale = "fr-FR" | "en-GB";
type WpProduct = {
  id: number; slug: string; name: string; description?: string; short_description?: string;
  status?: string; images?: Array<{ id?: number; src: string; alt?: string }>;
  prices?: { price?: string; regular_price?: string; currency_minor_unit?: number; price_range?: { min_amount?: string; max_amount?: string } | null };
  price?: string; attributes?: Array<{ name: string; options?: string[] }>;
  variations?: number[] | Array<{ id: number; attributes?: Array<{ name: string; value: string }> }>;
  meta_data?: Array<{ key: string; value: unknown }>;
  categories?: Array<{ id?: number; name: string; slug: string }>;
};
type WpVariation = { id: number; sku?: string; price?: string; regular_price?: string; stock_quantity?: number | null; manage_stock?: boolean; attributes?: Array<{ name: string; option: string }> };
type WpPage = { id: number; slug: string; date?: string; title: { rendered: string }; content: { rendered: string }; excerpt?: { rendered: string }; yoast_head_json?: { title?: string; description?: string } };
type Report = { source: string; startedAt: string; mode: "dry-run" | "commit"; products: number; pages: number; advice: number; faq: number; archived: number; media: number; warnings: string[]; errors: string[]; imported: string[] };

const args = new Set(process.argv.slice(2));
const sourceArg = process.argv.find((value) => value.startsWith("--source="));
const reportArg = process.argv.find((value) => value.startsWith("--report="));
const source = (sourceArg?.split("=")[1] ?? "https://www.zencoffeelab.com").replace(/\/$/, "");
const commit = args.has("--commit");
const reportPath = reportArg?.split("=")[1] ?? "migration-report.json";
const report: Report = { source, startedAt: new Date().toISOString(), mode: commit ? "commit" : "dry-run", products: 0, pages: 0, advice: 0, faq: 0, archived: 0, media: 0, warnings: [], errors: [], imported: [] };

function decodeHtml(value = "") {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--([\s\S]*?)-->/g, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#039;|&apos;/g, "'").replace(/&eacute;/g, "é").replace(/&agrave;/g, "à").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

function structuredBlocks(html = "") {
  const text = decodeHtml(html);
  return text.split(/\n{2,}/).map((content) => content.trim()).filter(Boolean).map((content) => ({ type: "paragraph", content }));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "user-agent": "ZenCoffeeLab-Migration/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<T>;
}

function wooAuth() {
  const key = process.env.WC_CONSUMER_KEY; const secret = process.env.WC_CONSUMER_SECRET;
  return key && secret ? `consumer_key=${encodeURIComponent(key)}&consumer_secret=${encodeURIComponent(secret)}` : "";
}

async function fetchProducts(locale: Locale) {
  const lang = locale === "en-GB" ? "en" : "fr"; const auth = wooAuth();
  if (auth) return getJson<WpProduct[]>(`${source}/wp-json/wc/v3/products?per_page=100&status=any&lang=${lang}&${auth}`);
  const prefix = locale === "en-GB" ? "/en" : "";
  return getJson<WpProduct[]>(`${source}${prefix}/wp-json/wc/store/v1/products?per_page=100`);
}

async function fetchVariations(product: WpProduct) {
  const auth = wooAuth(); if (!auth) return [];
  return getJson<WpVariation[]>(`${source}/wp-json/wc/v3/products/${product.id}/variations?per_page=100&${auth}`).catch((error) => { report.warnings.push(`Variantes ${product.slug}: ${String(error)}`); return []; });
}

async function fetchPages(locale: Locale) {
  const lang = locale === "en-GB" ? "en" : "fr";
  return getJson<WpPage[]>(`${source}/wp-json/wp/v2/pages?per_page=100&lang=${lang}&_fields=id,slug,title,content,excerpt,yoast_head_json`).catch((error) => { report.warnings.push(`Pages ${locale}: ${String(error)}`); return []; });
}

async function fetchAdvice(locale: Locale) {
  const lang = locale === "en-GB" ? "en" : "fr";
  return getJson<WpPage[]>(`${source}/wp-json/wp/v2/posts?per_page=100&lang=${lang}&_fields=id,slug,date,title,content,excerpt,yoast_head_json`).catch((error) => { report.warnings.push(`Conseils ${locale}: ${String(error)}`); return []; });
}

const canonicalPageKey = (slug: string) => ({ home: "accueil", "about-us": "a-propos", professional: "professionnel", "general-terms-and-conditions-of-sale": "cgv", "legal-notice": "mentions-legales", "privacy-policy": "politique-de-confidentialite" } as Record<string, string>)[slug] ?? slug;

function extractFaq(html = "") {
  const questions = [...html.matchAll(/class=["'][^"']*elementor-tab-title[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)].map((match) => decodeHtml(match[1]));
  const answers = [...html.matchAll(/class=["'][^"']*elementor-tab-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].map((match) => decodeHtml(match[1]));
  return questions.map((question, index) => ({ question, answer: answers[index] ?? "" })).filter((item) => item.question && item.answer);
}

function supabase(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; return createClient(url, key, { auth: { persistSession: false } });
}

async function copyMedia(client: SupabaseClient, productSlug: string, image: NonNullable<WpProduct["images"]>[number], locale: Locale) {
  const response = await fetch(image.src); if (!response.ok) throw new Error(`Media ${response.status}: ${image.src}`);
  const rawName = basename(new URL(image.src).pathname); const extension = extname(rawName) || ".jpg"; const path = `${productSlug}/${image.id ?? crypto.randomUUID()}${extension.toLowerCase()}`;
  const bytes = await response.arrayBuffer(); const { error } = await client.storage.from("product-media").upload(path, bytes, { contentType: response.headers.get("content-type") ?? "image/jpeg", upsert: true }); if (error) throw error;
  const { data } = client.storage.from("product-media").getPublicUrl(path); report.media += 1; return { path, url: data.publicUrl, alt: image.alt || `${productSlug} coffee`, locale };
}

function priceCents(product: WpProduct) {
  if (product.prices?.price) return Number(product.prices.price);
  if (product.price) return Math.round(Number(product.price) * 100);
  return 0;
}

async function importProduct(client: SupabaseClient | null, fr: WpProduct, en: WpProduct | undefined) {
  const variations = await fetchVariations(fr); const english = en ?? fr; const productWarnings: string[] = []; const archived = fr.categories?.some((category) => /archive/i.test(`${category.slug} ${category.name}`)) ?? false; if (archived) report.archived += 1;
  if (!en) productWarnings.push("traduction anglaise absente");
  if (variations.length === 0) productWarnings.push("variantes 200 g / 1 kg à vérifier (API WooCommerce authentifiée non fournie)");
  if (!fr.images?.length) productWarnings.push("image absente");
  if (productWarnings.length) report.warnings.push(`${fr.slug}: ${productWarnings.join("; ")}`);
  if (!commit || !client) { report.imported.push(`[simulation] ${fr.slug}`); return; }
  const { data: product, error } = await client.from("products").upsert({ slug: fr.slug, status: archived ? "archived" : "draft", altitude_meters: 0 }, { onConflict: "slug" }).select("id").single(); if (error) throw error;
  for (const [locale, item] of [["fr-FR", fr], ["en-GB", english]] as const) {
    const body = decodeHtml(item.description); const short = decodeHtml(item.short_description) || body.slice(0, 300);
    await client.from("product_translations").upsert({ product_id: product.id, locale, name: decodeHtml(item.name), short_description: short, body, producer: "À compléter", region: "À compléter", variety: "À compléter", process: "À compléter", tasting_notes: [], seo_title: decodeHtml(item.name), seo_description: short.slice(0, 160) }, { onConflict: "product_id,locale" });
  }
  for (const [index, image] of (fr.images ?? []).entries()) { const uploaded = await copyMedia(client, fr.slug, image, "fr-FR"); await client.from("product_media").upsert({ product_id: product.id, storage_path: uploaded.path, public_url: uploaded.url, alt_fr: image.alt || `Paquet ${fr.name}`, alt_en: en?.images?.[index]?.alt || `${english.name} coffee bag`, width: 1600, height: 1600, position: index }); }
  const variantSource = variations.length ? variations : [{ id: fr.id, sku: `${fr.slug}-200`, price: String(priceCents(fr) / 100), stock_quantity: 0, attributes: [{ name: "Poids", option: "200 g" }] }];
  for (const variation of variantSource) {
    const label = variation.attributes?.find((attribute) => /poids|weight/i.test(attribute.name))?.option ?? "À vérifier"; const grams = label.match(/1\s*kg/i) ? 1000 : Number(label.match(/\d+/)?.[0] ?? 200);
    const { data: variant, error: variantError } = await client.from("product_variants").upsert({ product_id: product.id, sku: variation.sku || `${fr.slug}-${variation.id}`, label, weight_grams: grams, internal_cost_cents: 0, stock_on_hand: variation.stock_quantity ?? 0, low_stock_threshold: 5, hs_code: "090121", customs_origin_country: "FR" }, { onConflict: "sku" }).select("id").single(); if (variantError) throw variantError;
    await client.from("variant_offers").upsert({ variant_id: variant.id, audience: "retail", price_cents: Math.round(Number(variation.price || variation.regular_price || 0) * 100), minimum_quantity: 1, active: true }, { onConflict: "variant_id,audience" });
  }
  report.imported.push(fr.slug);
}

async function run() {
  const client = supabase(); if (commit && !client) throw new Error("--commit requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const [frProducts, enProducts, frPages, enPages, frAdvice, enAdvice] = await Promise.all([fetchProducts("fr-FR"), fetchProducts("en-GB").catch(() => []), fetchPages("fr-FR"), fetchPages("en-GB"), fetchAdvice("fr-FR"), fetchAdvice("en-GB")]);
  report.products = frProducts.length; report.pages = frPages.length; report.advice = frAdvice.length;
  const mediaOwners = new Map<string, string[]>();
  for (const product of frProducts) for (const image of product.images ?? []) mediaOwners.set(image.src, [...(mediaOwners.get(image.src) ?? []), product.slug]);
  for (const [url, owners] of mediaOwners) if (owners.length > 1) report.warnings.push(`Média partagé par plusieurs cafés (${owners.join(", ")}): ${url}`);
  const enBySlug = new Map(enProducts.map((product) => [product.slug, product]));
  const findEnglishProduct = (product: WpProduct) => {
    const exact = enBySlug.get(product.slug); if (exact) return exact;
    const imageNames = new Set((product.images ?? []).map((image) => basename(new URL(image.src).pathname))); const tokens = new Set(decodeHtml(product.name).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9]+/).filter((token) => token.length > 3));
    const ranked = enProducts.map((candidate) => { const sharedImages = (candidate.images ?? []).filter((image) => imageNames.has(basename(new URL(image.src).pathname))).length; const candidateTokens = decodeHtml(candidate.name).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9]+/); const sharedTokens = candidateTokens.filter((token) => tokens.has(token)).length; const sameCountry = product.slug.split("-")[0] === candidate.slug.split("-")[0]; return { candidate, score: (sameCountry ? 20 : 0) + sharedImages * 10 + sharedTokens * 3 }; }).toSorted((a, b) => b.score - a.score);
    return ranked[0]?.score > 0 && ranked[0]?.score !== ranked[1]?.score ? ranked[0].candidate : undefined;
  };
  for (const product of frProducts) { try { await importProduct(client, product, findEnglishProduct(product)); } catch (error) { report.errors.push(`${product.slug}: ${String(error)}`); } }
  const pageKeys = new Set(["accueil", "a-propos", "professionnel", "faq", "contact", "cgv", "mentions-legales", "politique-de-confidentialite"]);
  for (const page of frPages.filter((item) => pageKeys.has(canonicalPageKey(item.slug)))) {
    const pageKey = canonicalPageKey(page.slug); const english = enPages.find((item) => canonicalPageKey(item.slug) === pageKey); if (!english) report.warnings.push(`Page ${page.slug}: traduction anglaise à rapprocher manuellement.`);
    if (commit && client) {
      const { data: stored, error } = await client.from("content_pages").upsert({ page_key: pageKey, status: "draft" }, { onConflict: "page_key" }).select("id").single();
      if (error || !stored) throw error ?? new Error(`Page ${page.slug} could not be created.`);
      for (const [locale, item] of [["fr-FR", page], ["en-GB", english ?? page]] as const) {
        await client.from("content_page_translations").upsert({ page_id: stored.id, locale, title: decodeHtml(item.title.rendered), seo_title: item.yoast_head_json?.title ?? decodeHtml(item.title.rendered), seo_description: item.yoast_head_json?.description ?? decodeHtml(item.excerpt?.rendered).slice(0, 160), blocks: structuredBlocks(item.content.rendered) }, { onConflict: "page_id,locale" });
      }
    }
  }
  const faqFr = extractFaq(frPages.find((page) => canonicalPageKey(page.slug) === "faq")?.content.rendered); const faqEn = extractFaq(enPages.find((page) => canonicalPageKey(page.slug) === "faq")?.content.rendered); report.faq = faqFr.length;
  if (faqFr.length === 0) report.warnings.push("FAQ: aucune paire question/réponse Elementor détectée; import manuel requis.");
  if (commit && client) for (const [position, item] of faqFr.entries()) await client.from("faq_items").insert({ position, active: false, question_fr: item.question, answer_fr: item.answer, question_en: faqEn[position]?.question ?? item.question, answer_en: faqEn[position]?.answer ?? item.answer });
  const enAdviceBySlug = new Map(enAdvice.map((article) => [article.slug, article]));
  for (const article of frAdvice) {
    const english = enAdviceBySlug.get(article.slug); if (!english) report.warnings.push(`Conseil ${article.slug}: traduction anglaise à rapprocher manuellement.`); if (!commit || !client) continue;
    const { data: stored, error } = await client.from("advice_articles").upsert({ slug: article.slug, status: "draft", published_at: article.date ?? new Date().toISOString() }, { onConflict: "slug" }).select("id").single(); if (error || !stored) { report.errors.push(`Conseil ${article.slug}: ${error?.message ?? "création impossible"}`); continue; }
    for (const [locale, item] of [["fr-FR", article], ["en-GB", english ?? article]] as const) await client.from("advice_translations").upsert({ article_id: stored.id, locale, title: decodeHtml(item.title.rendered), excerpt: decodeHtml(item.excerpt?.rendered), blocks: structuredBlocks(item.content.rendered), seo_title: item.yoast_head_json?.title ?? decodeHtml(item.title.rendered), seo_description: item.yoast_head_json?.description ?? decodeHtml(item.excerpt?.rendered).slice(0, 160) }, { onConflict: "article_id,locale" });
  }
  if (frProducts.length !== 7) report.warnings.push(`Le plan attend 7 cafés, l’API en retourne ${frProducts.length}.`);
}

run().catch((error) => { report.errors.push(String(error)); process.exitCode = 1; }).finally(async () => { await writeFile(reportPath, `${JSON.stringify({ ...report, finishedAt: new Date().toISOString() }, null, 2)}\n`, "utf8"); process.stdout.write(`Rapport: ${reportPath} · ${report.imported.length}/${report.products} produits · ${report.warnings.length} avertissements · ${report.errors.length} erreurs\n`); });
