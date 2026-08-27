import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData, useLocation } from "react-router";
import { AdminComingSoonEditor } from "~/components/admin-coming-soon-editor";
import { AdminNavigationOrganizer } from "~/components/admin-navigation-organizer";
import { AdminShell } from "~/components/admin-shell";
import { AdminImageEditorInput } from "~/components/admin-image-editor-input";
import { AdminSeoAnalysis } from "~/components/admin-seo-analysis";
import { RichTextEditor } from "~/components/rich-text-editor";
import { requireAdmin } from "~/lib/auth.server";
import { defaultComingSoonSettings } from "~/lib/coming-soon";
import { getComingSoonSettings } from "~/lib/coming-soon.server";
import { PUBLIC_MEDIA_CACHE_SECONDS, PUBLIC_MEDIA_MAX_UPLOAD_BYTES } from "~/lib/public-media";
import {
  paragraphsToRichTextDocument,
  parseRichTextInput,
  richTextPlainText,
  storedBlocksToRichTextDocument,
} from "~/lib/rich-text";
import { createServiceSupabase } from "~/lib/supabase.server";
import { parseSiteNavigationConfiguration } from "~/lib/site-navigation";
import { getSiteNavigation } from "~/lib/site-navigation.server";
import { getProfessionalConnectedPageContent, getProfessionalPageContent, professionalPageDefaults, type ProfessionalPageContent, type ProfessionalConnectedPageContent } from "~/lib/professional-content";

type ContentTranslation = {
  locale: "fr-FR" | "en-GB";
  title: string;
  seo_title: string;
  seo_description: string;
  focus_keyphrase?: string;
  blocks: Array<{ type?: unknown; content?: unknown }>;
};

type ContentPage = {
  id: string;
  page_key: string;
  status: "draft" | "published" | "archived";
  content_page_translations: ContentTranslation[];
};
type AdminAdvice = { id: string; slug: string; status: "draft" | "published" | "archived"; published_at: string; advice_translations: Array<{ locale: "fr-FR" | "en-GB"; title: string }> };

const pageSchema = z.object({
  intent: z.literal("save_page"),
  pageKey: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(["draft", "published", "archived"]),
  titleFr: z.string().trim().min(2),
  titleEn: z.string().trim().min(2),
  seoTitleFr: z.string().trim().min(2),
  seoTitleEn: z.string().trim().min(2),
  seoDescriptionFr: z.string().trim().min(10),
  seoDescriptionEn: z.string().trim().min(10),
  focusKeyphraseFr: z.string().trim().max(160).optional().default(""),
  focusKeyphraseEn: z.string().trim().max(160).optional().default(""),
  contentFr: z.string().trim().optional(),
  contentEn: z.string().trim().optional(),
  homeStatementFr: z.string().trim().max(500).optional(),
  homeStatementEn: z.string().trim().max(500).optional(),
  homeValue1TitleFr: z.string().trim().max(120).optional(), homeValue1TextFr: z.string().trim().max(500).optional(),
  homeValue2TitleFr: z.string().trim().max(120).optional(), homeValue2TextFr: z.string().trim().max(500).optional(),
  homeValue3TitleFr: z.string().trim().max(120).optional(), homeValue3TextFr: z.string().trim().max(500).optional(),
  homeValue1TitleEn: z.string().trim().max(120).optional(), homeValue1TextEn: z.string().trim().max(500).optional(),
  homeValue2TitleEn: z.string().trim().max(120).optional(), homeValue2TextEn: z.string().trim().max(500).optional(),
  homeValue3TitleEn: z.string().trim().max(120).optional(), homeValue3TextEn: z.string().trim().max(500).optional(),
  homeHeroImageUrl: z.string().max(1_000).optional(),
  homeHeroImagePath: z.string().max(500).optional(),
  homeHeroImageAltFr: z.string().trim().max(240).optional(),
  homeHeroImageAltEn: z.string().trim().max(240).optional(),
  aboutLedeFr: z.string().trim().max(600).optional(), aboutLedeEn: z.string().trim().max(600).optional(),
  aboutParagraph1Fr: z.string().trim().min(10).optional(), aboutParagraph1En: z.string().trim().min(10).optional(),
  aboutParagraph2Fr: z.string().trim().min(10).optional(), aboutParagraph2En: z.string().trim().min(10).optional(),
  ...Object.fromEntries([1, 2].flatMap((index) => [
    [`aboutStoryImageUrl${index}`, z.string().url().or(z.literal("")).optional()],
    [`aboutStoryImagePath${index}`, z.string().max(500).optional()],
    [`aboutStoryAlt${index}Fr`, z.string().trim().max(240).optional()],
    [`aboutStoryAlt${index}En`, z.string().trim().max(240).optional()],
  ])),
}).passthrough();
const navigationSchema = z.object({
  intent: z.literal("save_navigation"),
  configuration: z.string().min(2).max(20_000),
});
const comingSoonSchema = z.object({
  intent: z.literal("save_coming_soon"),
  active: z.enum(["true", "false"]),
  titleFr: z.string().trim().min(2).max(140),
  messageFr: z.string().trim().min(2).max(500),
  titleEn: z.string().trim().min(2).max(140),
  messageEn: z.string().trim().min(2).max(500),
});

const defaults = ["accueil", "a-propos", "professionnel", "professionnel-connecte", "conseils", "faq", "contact", "cgv", "mentions-legales", "politique-de-confidentialite"];
const pageLabels: Record<string, string> = {
  accueil: "Accueil",
  "a-propos": "À propos",
  professionnel: "Professionnels",
  "professionnel-connecte": "Professionnels (connecté)",
  conseils: "Blog",
  faq: "FAQ",
  contact: "Contact",
  cgv: "CGV",
  "mentions-legales": "Mentions légales",
  "politique-de-confidentialite": "Confidentialité",
};
const placeholderFr = "Contenu à compléter avant publication.";
const placeholderEn = "Content to complete before publication.";
const aboutImageExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && typeof (value as File).size === "number" && typeof (value as File).type === "string" && typeof (value as File).arrayBuffer === "function");
}

async function uploadAboutImage(client: any, file: FormDataEntryValue | null, locale: string, slot: string, previousPath = "") {
  if (!isUploadFile(file) || file.size === 0) return { path: previousPath, url: "" };
  if (file.size > PUBLIC_MEDIA_MAX_UPLOAD_BYTES || !aboutImageExtensions[file.type]) throw new Error("Les images doivent être optimisées en JPEG, PNG ou WebP et peser au maximum 1,5 Mo.");
  const path = `pages/a-propos/${locale}/${slot}-${crypto.randomUUID()}.${aboutImageExtensions[file.type]}`;
  const { error } = await client.storage.from("product-media").upload(path, await file.arrayBuffer(), { contentType: file.type, cacheControl: String(PUBLIC_MEDIA_CACHE_SECONDS) });
  if (error) throw new Error(error.message);
  if (previousPath) await client.storage.from("product-media").remove([previousPath]);
  return { path, url: client.storage.from("product-media").getPublicUrl(path).data.publicUrl };
}

async function uploadHomeHeroImage(client: any, file: FormDataEntryValue | null, previousPath = "") {
  if (!isUploadFile(file) || file.size === 0) return { path: previousPath, url: "" };
  if (file.size > PUBLIC_MEDIA_MAX_UPLOAD_BYTES || !aboutImageExtensions[file.type]) throw new Error("Les images doivent être optimisées en JPEG, PNG ou WebP et peser au maximum 1,5 Mo.");
  const path = `pages/accueil/hero-${crypto.randomUUID()}.${aboutImageExtensions[file.type]}`;
  const { error } = await client.storage.from("product-media").upload(path, await file.arrayBuffer(), { contentType: file.type, cacheControl: String(PUBLIC_MEDIA_CACHE_SECONDS) });
  if (error) throw new Error(error.message);
  if (previousPath) await client.storage.from("product-media").remove([previousPath]);
  return { path, url: client.storage.from("product-media").getPublicUrl(path).data.publicUrl };
}

function uploadedFile(form: FormData, name: string) {
  const processed = form.get(`${name}Processed`);
  return isUploadFile(processed) && processed.size > 0 ? processed : form.get(`${name}Source`) ?? form.get(name);
}

function aboutBlock(translation: ContentTranslation | undefined, type: string) {
  return translation?.blocks.find((block) => block.type === type)?.content as Record<string, unknown> | undefined;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, pages: [] as ContentPage[], adviceArticles: [] as AdminAdvice[], navigation: await getSiteNavigation(), comingSoon: defaultComingSoonSettings };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const [{ data, error }, { data: adviceArticles, error: adviceError }, navigation, comingSoon] = await Promise.all([
    client
      .from("content_pages")
      .select("*,content_page_translations(*)")
      .neq("page_key", "bandeau")
      .neq("page_key", "navigation")
      .neq("page_key", "coming-soon")
      .order("page_key"),
    client
      .from("advice_articles")
      .select("id,slug,status,published_at,advice_translations(locale,title)")
      .order("created_at", { ascending: false }),
    getSiteNavigation(),
    getComingSoonSettings(),
  ]);
  if (error) throw new Response(error.message, { status: 500 });
  if (adviceError) throw new Response(adviceError.message, { status: 500 });
  return { demo: false, pages: (data ?? []) as ContentPage[], adviceArticles: (adviceArticles ?? []) as AdminAdvice[], navigation, comingSoon };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const formData = await request.formData();
  const fields = Object.fromEntries(formData);
  if (fields.intent === "save_coming_soon") {
    const parsedComingSoon = comingSoonSchema.safeParse(fields);
    if (!parsedComingSoon.success) return { ok: false, message: "Les textes français et anglais sont requis." };
    const active = parsedComingSoon.data.active === "true";
    const client = createServiceSupabase();
    if (!client) return { ok: false, message: "Base indisponible." };
    const { data: page, error } = await client
      .from("content_pages")
      .upsert({ page_key: "coming-soon", status: active ? "published" : "draft", updated_at: new Date().toISOString() }, { onConflict: "page_key" })
      .select("id")
      .single();
    if (error || !page) return { ok: false, message: error?.message ?? "Mode construction non enregistré." };
    const translations = [
      { locale: "fr-FR", title: parsedComingSoon.data.titleFr, message: parsedComingSoon.data.messageFr },
      { locale: "en-GB", title: parsedComingSoon.data.titleEn, message: parsedComingSoon.data.messageEn },
    ].map((translation) => ({
      page_id: page.id,
      locale: translation.locale,
      title: translation.title,
      seo_title: translation.title,
      seo_description: translation.message,
      blocks: [{ type: "comingSoon", content: { message: translation.message } }],
    }));
    const { error: translationError } = await client
      .from("content_page_translations")
      .upsert(translations, { onConflict: "page_id,locale" });
    if (translationError) return { ok: false, message: translationError.message };
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "coming_soon.updated",
      entity_type: "content_page",
      entity_id: page.id,
      after_data: { active, translations },
    });
    return { ok: true, message: active ? "Mode Site en construction activé." : "Mode Site en construction désactivé." };
  }
  if (fields.intent === "save_navigation") {
    const parsedNavigation = navigationSchema.safeParse(fields);
    if (!parsedNavigation.success) return { ok: false, message: "Le rangement envoyé est invalide." };
    let rawConfiguration: unknown;
    try {
      rawConfiguration = JSON.parse(parsedNavigation.data.configuration);
    } catch {
      return { ok: false, message: "Le rangement envoyé est illisible." };
    }
    const configuration = parseSiteNavigationConfiguration(rawConfiguration);
    const client = createServiceSupabase();
    if (!client) return { ok: false, message: "Base indisponible." };
    const { data: page, error } = await client
      .from("content_pages")
      .upsert({ page_key: "navigation", status: "published", updated_at: new Date().toISOString() }, { onConflict: "page_key" })
      .select("id")
      .single();
    if (error || !page) return { ok: false, message: error?.message ?? "Rangement non enregistré." };
    const blocks = [{ type: "siteNavigation", content: configuration }];
    const { error: translationError } = await client.from("content_page_translations").upsert([
      { page_id: page.id, locale: "fr-FR", title: "Navigation du site", seo_title: "Navigation du site", seo_description: "Organisation du menu et du pied de page Zen Coffee Lab.", blocks },
      { page_id: page.id, locale: "en-GB", title: "Site navigation", seo_title: "Site navigation", seo_description: "Zen Coffee Lab header and footer organisation.", blocks },
    ], { onConflict: "page_id,locale" });
    if (translationError) return { ok: false, message: translationError.message };
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "site_navigation.updated",
      entity_type: "content_page",
      entity_id: page.id,
      after_data: configuration,
    });
    return { ok: true, message: "Rangement du menu et du footer enregistré." };
  }

  const parsed = pageSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: "Les contenus français et anglais sont requis." };

  const homeFields = parsed.data as unknown as Record<string, string | undefined>;
  const homeContent = parsed.data.pageKey === "accueil"
    ? (["Fr", "En"] as const).map((suffix) => ({
        statement: homeFields[`homeStatement${suffix}`]?.trim() ?? "",
        cards: [1, 2, 3].map((index) => ({
          title: homeFields[`homeValue${index}Title${suffix}`]?.trim() ?? "",
          text: homeFields[`homeValue${index}Text${suffix}`]?.trim() ?? "",
        })),
      }))
    : null;
  if (homeContent && homeContent.some((content) => !content.statement || content.cards.some((card) => !card.title || !card.text)))
    return { ok: false, message: "Complétez la phrase et les trois engagements de l’accueil dans les deux langues." };

  const rawContentFr = parsed.data.pageKey === "a-propos" ? (fields.aboutParagraph1Fr ?? parsed.data.contentFr) : parsed.data.contentFr;
  const rawContentEn = parsed.data.pageKey === "a-propos" ? (fields.aboutParagraph1En ?? parsed.data.contentEn) : parsed.data.contentEn;
  const contentFr = parseRichTextInput(String(rawContentFr ?? ""), 10)
    ?? (homeContent ? paragraphsToRichTextDocument([homeContent[0].statement]) : null);
  const contentEn = parseRichTextInput(String(rawContentEn ?? ""), 10)
    ?? (homeContent ? paragraphsToRichTextDocument([homeContent[1].statement]) : null);
  if (!contentFr || !contentEn)
    return { ok: false, message: "Le contenu de chaque langue doit comporter au moins 10 caractères." };

  const plainContent = `${richTextPlainText(contentFr)} ${richTextPlainText(contentEn)}`;
  if (
    parsed.data.status === "published"
    && /(?:à compléter|to complete)/i.test(`${parsed.data.seoDescriptionFr} ${parsed.data.seoDescriptionEn} ${plainContent}`)
  ) return { ok: false, message: "Remplacez tous les textes provisoires avant publication." };

  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };
  const { data: page, error } = await client
    .from("content_pages")
    .upsert({ page_key: parsed.data.pageKey, status: parsed.data.status, updated_at: new Date().toISOString() }, { onConflict: "page_key" })
    .select("id")
    .single();
  if (error || !page) return { ok: false, message: error?.message ?? "Page non créée." };

  let homeHeroImage: { path: string; url: string } | null = null;
  if (parsed.data.pageKey === "accueil") {
    try {
      homeHeroImage = await uploadHomeHeroImage(client, uploadedFile(formData, "homeHeroImage"), String(fields.homeHeroImagePath ?? ""));
    } catch (error) {
      return { ok: false, message: error instanceof Error ? `L’image du hero n’a pas pu être enregistrée : ${error.message}` : "L’image du hero n’a pas pu être enregistrée." };
    }
  }

  const aboutConfigured = parsed.data.pageKey === "a-propos" && Object.keys(fields).some((key) => key.startsWith("about"));
  const sharedStoryImages = aboutConfigured
    ? await Promise.all([1, 2].map(async (index) => {
        const previousUrl = String(fields[`aboutStoryImageUrl${index}`] ?? "");
        const previousPath = String(fields[`aboutStoryImagePath${index}`] ?? "");
        return uploadAboutImage(client, uploadedFile(formData, `aboutStoryImage${index}`), "shared", `story-${index}`, previousPath).then((uploaded) => ({ url: uploaded.url || previousUrl, path: uploaded.path, previousUrl }));
      }))
    : null;
  const aboutTranslations = aboutConfigured
    ? await Promise.all(([ ["fr-FR", "Fr"], ["en-GB", "En"] ] as const).map(async ([locale, suffix]) => {
        return {
          locale,
          storyImages: sharedStoryImages?.map((image, index) => ({ ...image, alt: String(fields[`aboutStoryAlt${index + 1}${suffix}`] ?? "") })),
          lede: String(fields[`aboutLede${suffix}`] ?? ""),
          paragraph2: parseRichTextInput(String(fields[`aboutParagraph2${suffix}`] ?? ""), 10),
        };
      }))
    : null;
  const professionalConfigured = parsed.data.pageKey === "professionnel";
  const professionalFr = professionalConfigured ? professionalContentFromFields(fields, "Fr", professionalBlock(undefined)) : null;
  const professionalEn = professionalConfigured ? professionalContentFromFields(fields, "En", professionalPageDefaults["en-GB"]) : null;
  const connectedConfigured = parsed.data.pageKey === "professionnel-connecte";
  const connectedFr = connectedConfigured ? professionalConnectedContentFromFields(fields, "Fr", getProfessionalConnectedPageContent("fr-FR")) : null;
  const connectedEn = connectedConfigured ? professionalConnectedContentFromFields(fields, "En", getProfessionalConnectedPageContent("en-GB")) : null;

  const translations = [
    {
      locale: "fr-FR",
      title: parsed.data.titleFr,
      seo_title: parsed.data.seoTitleFr,
      seo_description: parsed.data.seoDescriptionFr,
      focus_keyphrase: parsed.data.focusKeyphraseFr,
      blocks: [
        { type: "richText", content: contentFr },
        ...(aboutTranslations ? [{ type: "aboutHero", content: { lede: aboutTranslations[0].lede } }, { type: "aboutStoryImages", content: { images: aboutTranslations[0].storyImages } }, { type: "aboutParagraph2", content: aboutTranslations[0].paragraph2 }] : []),
        ...(homeContent ? [{ type: "homeStatement", content: { text: homeContent[0].statement } }, { type: "homeValues", content: { cards: homeContent[0].cards } }] : []),
        ...(homeContent ? [{ type: "homeHeroImage", content: { url: homeHeroImage?.url || String(fields.homeHeroImageUrl ?? ""), path: homeHeroImage?.path ?? String(fields.homeHeroImagePath ?? ""), alt: String(fields.homeHeroImageAltFr ?? "") } }] : []),
        ...(professionalFr ? [{ type: "professionalPage", content: professionalFr }] : []),
        ...(connectedFr ? [{ type: "professionalConnectedPage", content: connectedFr }] : []),
      ],
    },
    {
      locale: "en-GB",
      title: parsed.data.titleEn,
      seo_title: parsed.data.seoTitleEn,
      seo_description: parsed.data.seoDescriptionEn,
      focus_keyphrase: parsed.data.focusKeyphraseEn,
      blocks: [
        { type: "richText", content: contentEn },
        ...(aboutTranslations ? [{ type: "aboutHero", content: { lede: aboutTranslations[1].lede } }, { type: "aboutStoryImages", content: { images: aboutTranslations[1].storyImages } }, { type: "aboutParagraph2", content: aboutTranslations[1].paragraph2 }] : []),
        ...(homeContent ? [{ type: "homeStatement", content: { text: homeContent[1].statement } }, { type: "homeValues", content: { cards: homeContent[1].cards } }] : []),
        ...(homeContent ? [{ type: "homeHeroImage", content: { url: homeHeroImage?.url || String(fields.homeHeroImageUrl ?? ""), path: homeHeroImage?.path ?? String(fields.homeHeroImagePath ?? ""), alt: String(fields.homeHeroImageAltEn ?? "") } }] : []),
        ...(professionalEn ? [{ type: "professionalPage", content: professionalEn }] : []),
        ...(connectedEn ? [{ type: "professionalConnectedPage", content: connectedEn }] : []),
      ],
    },
  ].map((translation) => ({ ...translation, page_id: page.id }));
  const { error: translationError } = await client
    .from("content_page_translations")
    .upsert(translations, { onConflict: "page_id,locale" });
  if (translationError) return { ok: false, message: translationError.message };

  await client.from("audit_log").insert({
    actor_id: admin.id,
    action: "content_page.updated",
    entity_type: "content_page",
    entity_id: page.id,
    after_data: parsed.data,
  });
  return { ok: true, message: "Page enregistrée." };
}

export const meta: MetaFunction = () => [
  { title: "Contenus | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

function initialContent(translation: ContentTranslation | undefined, placeholder: string) {
  const document = storedBlocksToRichTextDocument(translation?.blocks);
  return document.content.length ? document : paragraphsToRichTextDocument([placeholder]);
}

const aboutDefaults = {
  "fr-FR": { lede: "Zen Coffee Lab est une micro-torréfaction indépendante à Tours, née de l’envie de rendre les cafés d’exception aussi précis qu’accessibles.", eyebrow: "Petits lots", title: "La précision à chaque cuisson", body: "Chaque profil est développé pour préserver l’identité du terroir : sucrosité, acidité vivante et finale longue et nette.", cta: "Goûter la sélection", alt: "Torréfacteur Zen Coffee Lab" },
  "en-GB": { lede: "Zen Coffee Lab is a small independent roastery in Tours, born from a desire to make exceptional coffee both precise and approachable.", eyebrow: "Small batches", title: "Precision in every roast", body: "Each profile is developed to preserve the identity of the terroir: sweetness, lively acidity and a long, clean finish.", cta: "Taste the selection", alt: "Zen Coffee Lab roaster" },
} as const;

function AboutPageFields({ translation, language, shared }: { translation: ContentTranslation | undefined; language: "fr-FR" | "en-GB"; shared: boolean }) {
  const suffix = language === "fr-FR" ? "Fr" : "En";
  const defaults = aboutDefaults[language];
  const hero = aboutBlock(translation, "aboutHero");
  const images = ((aboutBlock(translation, "aboutStoryImages")?.images ?? []) as Array<{ url?: string; path?: string; alt?: string }>);
  const paragraph2 = aboutBlock(translation, "aboutParagraph2");
  return <fieldset className="admin-about-fields">
    <legend>{language === "fr-FR" ? "Structure de la page À propos" : "About page structure"}</legend>
    <div className="field"><label>{language === "fr-FR" ? "Texte d’introduction sous le titre" : "Introductory text below the title"}<textarea name={`aboutLede${suffix}`} defaultValue={String(hero?.lede ?? defaults.lede)} maxLength={600} required /></label></div>
    <p className="admin-muted">Les blocs éditoriaux ci-dessous conservent l’alternance exacte texte-image de la page publique.</p>
    {shared ? <>
      {[1, 2].map((index) => {
        const image = images[index - 1] ?? {};
        return <div className="admin-about-image-row" key={index}>
          <div><strong>Image du bloc éditorial {index}</strong><AdminImageEditorInput name={`aboutStoryImage${index}`} label={image.url ? "Remplacer l’image" : "Importer l’image"} help="JPEG, PNG ou WebP · recadrage au ratio 75:83" currentPreviewUrl={image.url} defaultAspect="75:83" lockAspect defaultOutputWidth={1500} /><input type="hidden" name={`aboutStoryImageUrl${index}`} value={String(image.url ?? "")} /><input type="hidden" name={`aboutStoryImagePath${index}`} value={String(image.path ?? "")} /></div>
          <div className="field"><label>Texte alternatif<input name={`aboutStoryAlt${index}${suffix}`} defaultValue={String(image.alt ?? "")} maxLength={240} /></label></div>
        </div>;
      })}
    </> : null}
    <RichTextEditor name={`aboutParagraph1${suffix}`} label="Bloc texte 1 · image à droite" initialContent={initialContent(translation, defaults.body)} disabled={false} />
    <RichTextEditor name={`aboutParagraph2${suffix}`} label="Bloc texte 2 · image à gauche" initialContent={paragraph2 && typeof paragraph2 === "object" ? paragraph2 as never : paragraphsToRichTextDocument([defaults.body])} disabled={false} />
  </fieldset>;
}

const homeDefaults = {
  "fr-FR": {
    statement: "Le café est un voyage. Notre torréfaction en est le plus fidèle guide.\nChaque tasse est une invitation au départ, une origine à découvrir, une histoire à *partager*.",
    values: [
      ["Sourcé avec soin", "Des lots traçables choisis pour leur singularité et la qualité du travail à l’origine."],
      ["Torréfié avec légèreté", "Une torréfaction précise qui préserve douceur, acidité et clarté aromatique."],
      ["Partagé simplement", "Des conseils clairs pour révéler chaque café, à la maison comme derrière le bar."],
    ],
  },
  "en-GB": {
    statement: "Coffee is a journey. Our roast is its most faithful guide.\nEvery cup is an invitation to set off, an origin to discover,\na story to *share*.",
    values: [
      ["Sourced with care", "Traceable lots chosen for their singularity and the quality of the work at origin."],
      ["Roasted lightly", "A precise roasting profile that preserves sweetness, acidity and aromatic clarity."],
      ["Shared simply", "Clear brewing advice to help each coffee shine, at home or behind the bar."],
    ],
  },
} as const;

function homeSettings(translation: ContentTranslation | undefined, locale: "fr-FR" | "en-GB"): { statement: string; values: Array<readonly [string, string]> } {
  const blocks = translation?.blocks ?? [];
  const statementBlock = blocks.find((block) => block.type === "homeStatement")?.content;
  const valuesBlock = blocks.find((block) => block.type === "homeValues")?.content;
  const statement = statementBlock && typeof statementBlock === "object" && typeof (statementBlock as { text?: unknown }).text === "string"
    ? (statementBlock as { text: string }).text : homeDefaults[locale].statement;
  const storedValues = valuesBlock && typeof valuesBlock === "object" && Array.isArray((valuesBlock as { cards?: unknown }).cards)
    ? (valuesBlock as { cards: unknown[] }).cards : [];
  const values: Array<readonly [string, string]> = homeDefaults[locale].values.map((fallback, index) => {
    const card = storedValues[index];
    return card && typeof card === "object"
      ? [typeof (card as { title?: unknown }).title === "string" ? (card as { title: string }).title : fallback[0], typeof (card as { text?: unknown }).text === "string" ? (card as { text: string }).text : fallback[1]] as const
      : [fallback[0], fallback[1]] as const;
  });
  return { statement, values };
}

function professionalBlock(translation: ContentTranslation | undefined) {
  return getProfessionalPageContent(translation?.locale ?? "fr-FR", translation?.blocks);
}

function professionalContentFromFields(fields: Record<string, FormDataEntryValue>, suffix: "Fr" | "En", fallback: ProfessionalPageContent) {
  const text = (name: string, defaultValue: string) => String(fields[`professional${name}${suffix}`] ?? defaultValue);
  return {
    eyebrow: text("Eyebrow", fallback.eyebrow), lede: text("Lede", fallback.lede), loginLabel: text("LoginLabel", fallback.loginLabel),
    steps: [1, 2, 3].map((index) => ({ title: text(`Step${index}Title`, fallback.steps[index - 1].title), text: text(`Step${index}Text`, fallback.steps[index - 1].text) })),
    applicationTitle: text("ApplicationTitle", fallback.applicationTitle), applicationIntro: text("ApplicationIntro", fallback.applicationIntro), submitLabel: text("SubmitLabel", fallback.submitLabel), sendingLabel: text("SendingLabel", fallback.sendingLabel),
    fieldLabels: { company: text("CompanyLabel", fallback.fieldLabels.company), country: text("CountryLabel", fallback.fieldLabels.country), lastName: text("LastNameLabel", fallback.fieldLabels.lastName), firstName: text("FirstNameLabel", fallback.fieldLabels.firstName), email: text("EmailLabel", fallback.fieldLabels.email), phone: text("PhoneLabel", fallback.fieldLabels.phone), business: text("BusinessLabel", fallback.fieldLabels.business), volume: text("VolumeLabel", fallback.fieldLabels.volume), choose: text("ChooseLabel", fallback.fieldLabels.choose), privacy: text("PrivacyLabel", fallback.fieldLabels.privacy) },
    banner: { eyebrow: text("BannerEyebrow", fallback.banner.eyebrow), title: text("BannerTitle", fallback.banner.title), text: text("BannerText", fallback.banner.text) },
    success: { eyebrow: text("SuccessEyebrow", fallback.success.eyebrow), title: text("SuccessTitle", fallback.success.title), text: text("SuccessText", fallback.success.text), accountLabel: text("SuccessAccountLabel", fallback.success.accountLabel), shopLabel: text("SuccessShopLabel", fallback.success.shopLabel) },
    catalog: { eyebrow: text("CatalogEyebrow", fallback.catalog.eyebrow), title: text("CatalogTitle", fallback.catalog.title), lede: text("CatalogLede", fallback.catalog.lede), empty: text("CatalogEmpty", fallback.catalog.empty) },
  } satisfies ProfessionalPageContent;
}

function professionalConnectedContentFromFields(fields: Record<string, FormDataEntryValue>, suffix: "Fr" | "En", fallback: ProfessionalConnectedPageContent) {
  const text = (name: string, defaultValue: string) => String(fields[`professionalConnected${name}${suffix}`] ?? defaultValue);
  return { eyebrow: text("Eyebrow", fallback.eyebrow), title: text("Title", fallback.title), lede: text("Lede", fallback.lede), steps: [1, 2, 3].map((index) => ({ title: text(`Step${index}Title`, fallback.steps[index - 1].title), text: text(`Step${index}Text`, fallback.steps[index - 1].text) })), shopText: text("ShopText", fallback.shopText), shopButton: text("ShopButton", fallback.shopButton), contactText: text("ContactText", fallback.contactText), contactButton: text("ContactButton", fallback.contactButton), sampleText: text("SampleText", fallback.sampleText), sampleButton: text("SampleButton", fallback.sampleButton), bannerEyebrow: text("BannerEyebrow", fallback.bannerEyebrow), bannerTitle: text("BannerTitle", fallback.bannerTitle), bannerText: text("BannerText", fallback.bannerText) } satisfies ProfessionalConnectedPageContent;
}

function homeHeroImage(translation: ContentTranslation | undefined) {
  const content = translation?.blocks.find((block) => block.type === "homeHeroImage")?.content;
  return content && typeof content === "object" ? content as { url?: string; path?: string; alt?: string } : {};
}

function ProfessionalPageFields({ translation, language }: { translation: ContentTranslation | undefined; language: "fr-FR" | "en-GB" }) {
  const suffix = language === "fr-FR" ? "Fr" : "En";
  const content = professionalBlock(translation);
  const input = (name: string, value: string, label: string, multiline = false) => <div className="field"><label>{label}{multiline ? <textarea name={`professional${name}${suffix}`} defaultValue={value} required /> : <input name={`professional${name}${suffix}`} defaultValue={value} required />}</label></div>;
  return <fieldset className="admin-professional-fields">
    <legend>{language === "fr-FR" ? "Tous les contenus de la page Professionnels" : "All Professional page content"}</legend>
    <p className="admin-muted">{language === "fr-FR" ? "Chaque texte visible de la page publique est modifiable ici." : "Every visible text on the public page can be edited here."}</p>
    {input("Eyebrow", content.eyebrow, "Sur-titre")}{input("Lede", content.lede, "Introduction", true)}{input("LoginLabel", content.loginLabel, "Bouton de connexion")}
    <p>{language === "fr-FR" ? "Étapes" : "Steps"}</p>{content.steps.map((step, index) => <div className="form-grid" key={index}>{input(`Step${index + 1}Title`, step.title, `${index + 1}. Titre`)}{input(`Step${index + 1}Text`, step.text, `${index + 1}. Texte`, true)}</div>)}
    {input("ApplicationTitle", content.applicationTitle, "Titre du formulaire")}{input("ApplicationIntro", content.applicationIntro, "Introduction du formulaire")}{input("SubmitLabel", content.submitLabel, "Bouton d’envoi")}{input("SendingLabel", content.sendingLabel, "État d’envoi")}
    <p>{language === "fr-FR" ? "Libellés des champs" : "Field labels"}</p><div className="form-grid">{input("CompanyLabel", content.fieldLabels.company, "Raison sociale")}{input("CountryLabel", content.fieldLabels.country, "Pays")}{input("LastNameLabel", content.fieldLabels.lastName, "Nom")}{input("FirstNameLabel", content.fieldLabels.firstName, "Prénom")}{input("EmailLabel", content.fieldLabels.email, "E-mail")}{input("PhoneLabel", content.fieldLabels.phone, "Téléphone")}{input("BusinessLabel", content.fieldLabels.business, "Activité")}{input("VolumeLabel", content.fieldLabels.volume, "Volume")}{input("ChooseLabel", content.fieldLabels.choose, "Choix par défaut")}{input("PrivacyLabel", content.fieldLabels.privacy, "Consentement", true)}</div>
    <p>{language === "fr-FR" ? "Bandeau final" : "Closing banner"}</p>{input("BannerEyebrow", content.banner.eyebrow, "Sur-titre")}{input("BannerTitle", content.banner.title, "Titre")}{input("BannerText", content.banner.text, "Texte", true)}
    <p>{language === "fr-FR" ? "Confirmation après envoi" : "Post-submission confirmation"}</p>{input("SuccessEyebrow", content.success.eyebrow, "Sur-titre")}{input("SuccessTitle", content.success.title, "Titre", true)}{input("SuccessText", content.success.text, "Texte", true)}{input("SuccessAccountLabel", content.success.accountLabel, "Bouton compte")}{input("SuccessShopLabel", content.success.shopLabel, "Bouton boutique")}
    <p>{language === "fr-FR" ? "Boutique professionnelle" : "Professional shop"}</p>{input("CatalogEyebrow", content.catalog.eyebrow, "Sur-titre")}{input("CatalogTitle", content.catalog.title, "Titre")}{input("CatalogLede", content.catalog.lede, "Introduction", true)}{input("CatalogEmpty", content.catalog.empty, "Message sans produit", true)}
  </fieldset>;
}

function ProfessionalConnectedPageFields({ translation, language }: { translation: ContentTranslation | undefined; language: "fr-FR" | "en-GB" }) {
  const suffix = language === "fr-FR" ? "Fr" : "En";
  const content = getProfessionalConnectedPageContent(language, translation?.blocks);
  const input = (name: string, value: string, label: string, multiline = false) => <div className="field"><label>{label}{multiline ? <textarea name={`professionalConnected${name}${suffix}`} defaultValue={value} required /> : <input name={`professionalConnected${name}${suffix}`} defaultValue={value} required />}</label></div>;
  return <fieldset className="admin-professional-fields"><legend>{language === "fr-FR" ? "Contenu de la page Professionnel (connecté)" : "Connected Professional page content"}</legend><p className="admin-muted">{language === "fr-FR" ? "Chaque élément visible de cette page est modifiable ici." : "Every visible element on this page can be edited here."}</p>{input("Eyebrow", content.eyebrow, "Sur-titre")}{input("Title", content.title, "Titre")}{input("Lede", content.lede, "Introduction", true)}<p>{language === "fr-FR" ? "Étapes 01/02/03" : "Steps 01/02/03"}</p>{content.steps.map((step, index) => <div className="form-grid" key={index}>{input(`Step${index + 1}Title`, step.title, `${index + 1}. Titre`)}{input(`Step${index + 1}Text`, step.text, `${index + 1}. Texte`, true)}</div>)}<p>{language === "fr-FR" ? "Orientation boutique" : "Shop direction"}</p>{input("ShopText", content.shopText, "Texte", true)}{input("ShopButton", content.shopButton, "Libellé du bouton")}<p>{language === "fr-FR" ? "Orientation contact" : "Contact direction"}</p>{input("ContactText", content.contactText, "Texte", true)}{input("ContactButton", content.contactButton, "Libellé du bouton")}<p>{language === "fr-FR" ? "Orientation échantillons / devis" : "Samples / quote direction"}</p>{input("SampleText", content.sampleText, "Texte", true)}{input("SampleButton", content.sampleButton, "Libellé du bouton")}<p>{language === "fr-FR" ? "Bandeau vert foncé" : "Dark green banner"}</p>{input("BannerEyebrow", content.bannerEyebrow, "Sur-titre")}{input("BannerTitle", content.bannerTitle, "Titre")}{input("BannerText", content.bannerText, "Texte", true)}</fieldset>;
}

function ContentPageForm({ pageKey, page, demo }: { pageKey: string; page?: ContentPage; demo: boolean }) {
  const fr = page?.content_page_translations.find((translation) => translation.locale === "fr-FR");
  const en = page?.content_page_translations.find((translation) => translation.locale === "en-GB");
  const homeFr = homeSettings(fr, "fr-FR");
  const homeEn = homeSettings(en, "en-GB");
  const heroImage = homeHeroImage(fr);
  const heroImageEn = homeHeroImage(en);
  const formId = `content-page-form-${pageKey}`;
  const seoContentFields = (suffix: "Fr" | "En") => [
    `content${suffix}`,
    `aboutLede${suffix}`,
    `aboutParagraph1${suffix}`,
    `aboutParagraph2${suffix}`,
    `homeStatement${suffix}`,
    ...[1, 2, 3].flatMap((index) => [`homeValue${index}Title${suffix}`, `homeValue${index}Text${suffix}`]),
  ];

  return <Form id={formId} method="post" encType="multipart/form-data">
    <input type="hidden" name="intent" value="save_page" />
    <input type="hidden" name="pageKey" value={pageKey} />
    <div className="field">
      <label>Statut
        <select name="status" defaultValue={page?.status ?? "draft"}>
          <option value="draft">Brouillon</option>
          <option value="published">Publié</option>
          <option value="archived">Archivé</option>
        </select>
      </label>
    </div>
    <div className="admin-content-columns">
      <fieldset>
        <legend>Français</legend>
        <div className="field"><label>Titre<input name="titleFr" defaultValue={fr?.title ?? pageKey} required /></label></div>
        <div className="field"><label>Titre SEO<input name="seoTitleFr" defaultValue={fr?.seo_title ?? pageKey} required /></label></div>
        <div className="field"><label>Description SEO<textarea name="seoDescriptionFr" defaultValue={fr?.seo_description ?? "Description à compléter avant publication."} required /></label></div>
        <AdminSeoAnalysis formId={formId} locale="fr-FR" focusKeyphraseName="focusKeyphraseFr" defaultFocusKeyphrase={fr?.focus_keyphrase ?? ""} titleFieldName="titleFr" seoTitleFieldName="seoTitleFr" seoDescriptionFieldName="seoDescriptionFr" slugValue={pageKey} contentFieldNames={seoContentFields("Fr")} imageAltFieldNames={["aboutStoryAlt1Fr", "aboutStoryAlt2Fr"]} disabled={demo} />
        {pageKey === "a-propos" ? null : <RichTextEditor name="contentFr" label="Paragraphes" initialContent={initialContent(fr, placeholderFr)} disabled={demo} />}
        {pageKey === "a-propos" ? <AboutPageFields translation={fr} language="fr-FR" shared /> : null}
        {pageKey === "accueil" ? <HomeFields language="Français" statement={homeFr.statement} values={homeFr.values} heroImage={heroImage} /> : null}
        {pageKey === "professionnel" ? <ProfessionalPageFields translation={fr} language="fr-FR" /> : null}
        {pageKey === "professionnel-connecte" ? <ProfessionalConnectedPageFields translation={fr} language="fr-FR" /> : null}
      </fieldset>
      <fieldset>
        <legend>English</legend>
        <div className="field"><label>Title<input name="titleEn" defaultValue={en?.title ?? pageKey} required /></label></div>
        <div className="field"><label>SEO title<input name="seoTitleEn" defaultValue={en?.seo_title ?? pageKey} required /></label></div>
        <div className="field"><label>SEO description<textarea name="seoDescriptionEn" defaultValue={en?.seo_description ?? "Description to complete before publication."} required /></label></div>
        <AdminSeoAnalysis formId={formId} locale="en-GB" focusKeyphraseName="focusKeyphraseEn" defaultFocusKeyphrase={en?.focus_keyphrase ?? ""} titleFieldName="titleEn" seoTitleFieldName="seoTitleEn" seoDescriptionFieldName="seoDescriptionEn" slugValue={pageKey} contentFieldNames={seoContentFields("En")} imageAltFieldNames={["aboutStoryAlt1En", "aboutStoryAlt2En"]} disabled={demo} />
        {pageKey === "a-propos" ? null : <RichTextEditor name="contentEn" label="Paragraphs" initialContent={initialContent(en, placeholderEn)} disabled={demo} />}
        {pageKey === "a-propos" ? <AboutPageFields translation={en} language="en-GB" shared={false} /> : null}
        {pageKey === "accueil" ? <HomeFields language="English" statement={homeEn.statement} values={homeEn.values} heroImage={heroImageEn.url ? heroImageEn : heroImage} /> : null}
        {pageKey === "professionnel" ? <ProfessionalPageFields translation={en} language="en-GB" /> : null}
        {pageKey === "professionnel-connecte" ? <ProfessionalConnectedPageFields translation={en} language="en-GB" /> : null}
      </fieldset>
    </div>
    <button className="ui-button ui-button--default" type="submit" formNoValidate disabled={demo}>Enregistrer</button>
  </Form>;
}

function HomeFields({ language, statement, values, heroImage }: { language: "Français" | "English"; statement: string; values: readonly (readonly [string, string])[]; heroImage: { url?: string; path?: string; alt?: string } }) {
  const suffix = language === "Français" ? "Fr" : "En";
  return <fieldset className="admin-home-fields">
    <legend>{language === "Français" ? "Blocs spécifiques à l’accueil" : "Home-specific blocks"}</legend>
    {language === "Français" ? <div className="field"><AdminImageEditorInput name="homeHeroImage" label={heroImage.url ? "Remplacer l’image du hero" : "Importer l’image du hero"} help="Image affichée derrière « Une torréfaction pensée pour l’origine. » · JPEG, PNG ou WebP · recadrage libre" currentPreviewUrl={heroImage.url || "/media/home-hero-coffee-cherries.webp"} defaultAspect="16:9" defaultOutputWidth={1672} /><input type="hidden" name="homeHeroImageUrl" value={String(heroImage.url ?? "")} /><input type="hidden" name="homeHeroImagePath" value={String(heroImage.path ?? "")} /><label>Texte alternatif de l’image<input name="homeHeroImageAltFr" defaultValue={String(heroImage.alt ?? "Cerises de café mûrissant sur un caféier")} maxLength={240} /></label></div> : <div className="field"><label>Texte alternatif de l’image<input name="homeHeroImageAltEn" defaultValue={String(heroImage.alt ?? "Coffee cherries ripening on a coffee plant")} maxLength={240} /></label></div>}
    <div className="field"><label>{language === "Français" ? "Phrase sur fond vert" : "Green-background statement"}<textarea name={`homeStatement${suffix}`} defaultValue={statement} required /><small>Utilisez des astérisques pour mettre un passage en italique, par exemple *intention.*</small></label></div>
    <p>{language === "Français" ? "Tableau des engagements" : "Commitments grid"}</p>
    {values.map(([title, text], index) => <div className="form-grid" key={index}>
      <div className="field"><label>{language === "Français" ? `Engagement ${index + 1} — titre` : `Commitment ${index + 1} — title`}<input name={`homeValue${index + 1}Title${suffix}`} defaultValue={title} required /></label></div>
      <div className="field"><label>{language === "Français" ? `Engagement ${index + 1} — texte` : `Commitment ${index + 1} — text`}<textarea name={`homeValue${index + 1}Text${suffix}`} defaultValue={text} required /></label></div>
    </div>)}
  </fieldset>;
}

export default function AdminContent() {
  const { demo, pages, adviceArticles, navigation, comingSoon } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const location = useLocation();
  const activeTab = new URLSearchParams(location.search).get("tab");
  const arranging = activeTab === "rangement";
  const construction = activeTab === "construction";
  const byKey = new Map(pages.map((page) => [page.page_key, page]));
  const keys = [...new Set([...defaults, ...byKey.keys()])].sort((left, right) => (pageLabels[left] ?? left).localeCompare(pageLabels[right] ?? right, "fr-FR"));

  return <AdminShell active="content">
    <header className="admin-heading">
      <div>
        <p className="eyebrow">Mini-CMS</p>
        <h1>Pages</h1>
      </div>
    </header>
    {demo ? <p className="admin-notice">Connectez Supabase pour éditer les pages avec l’éditeur enrichi.</p> : null}
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}
    <nav className="admin-content-tabs" aria-label="Gestion des pages" role="tablist">
      <Link role="tab" aria-selected={!arranging && !construction} className={!arranging && !construction ? "is-active" : undefined} to="/admin/contenus">Contenu</Link>
      <Link role="tab" aria-selected={arranging} className={arranging ? "is-active" : undefined} to="/admin/contenus?tab=rangement">Rangement</Link>
      <Link role="tab" aria-selected={construction} className={construction ? "is-active" : undefined} to="/admin/contenus?tab=construction">Site en construction</Link>
      <Link role="tab" aria-selected={false} to="/admin/bandeau">Bandeau</Link>
    </nav>
    {arranging
      ? <AdminNavigationOrganizer initialConfiguration={navigation} demo={demo} />
      : construction
        ? <AdminComingSoonEditor initialSettings={comingSoon} demo={demo} />
        : <div className="admin-content-list">
        {keys.map((key) => {
          const page = byKey.get(key);
          if (key === "conseils") return <details className="ui-card admin-content-page" key={key}>
            <summary><strong>Blog</strong><span className="ui-badge">Blog</span></summary>
            <div className="admin-content-page__journal">
              <p>Gérez la page Blog et les articles déjà publiés.</p>
              <div className="admin-content-page__actions"><Link className="ui-button ui-button--ghost" to="/admin/conseils">Gérer le blog</Link><Link className="ui-button ui-button--default" to="/admin/conseils?new=1">Nouveau blog</Link></div>
              {adviceArticles.length ? <ul>{adviceArticles.map((article) => <li key={article.id}><Link to={`/admin/conseils?article=${article.id}`}>{article.advice_translations.find((translation) => translation.locale === "fr-FR")?.title ?? article.slug}</Link><span>{article.status} · {new Date(article.published_at).toLocaleDateString("fr-FR")}</span></li>)}</ul> : <p className="admin-muted">Aucun article n’est encore enregistré.</p>}
            </div>
          </details>;
          return <details className="ui-card admin-content-page" key={key}>
            <summary><strong>{pageLabels[key] ?? key}</strong><span className="ui-badge">{page?.status ?? "draft"}</span></summary>
            <ContentPageForm pageKey={key} page={page} demo={demo} />
          </details>;
        })}
      </div>}
  </AdminShell>;
}
