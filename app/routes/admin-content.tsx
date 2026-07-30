import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData, useLocation } from "react-router";
import { AdminNavigationOrganizer } from "~/components/admin-navigation-organizer";
import { AdminShell } from "~/components/admin-shell";
import { RichTextEditor } from "~/components/rich-text-editor";
import { requireAdmin } from "~/lib/auth.server";
import {
  paragraphsToRichTextDocument,
  parseRichTextInput,
  richTextPlainText,
  storedBlocksToRichTextDocument,
} from "~/lib/rich-text";
import { createServiceSupabase } from "~/lib/supabase.server";
import { parseSiteNavigationConfiguration } from "~/lib/site-navigation";
import { getSiteNavigation } from "~/lib/site-navigation.server";

type ContentTranslation = {
  locale: "fr-FR" | "en-GB";
  title: string;
  seo_title: string;
  seo_description: string;
  blocks: Array<{ type?: unknown; content?: unknown }>;
};

type ContentPage = {
  id: string;
  page_key: string;
  status: "draft" | "published" | "archived";
  content_page_translations: ContentTranslation[];
};

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
  contentFr: z.string().trim().min(10),
  contentEn: z.string().trim().min(10),
});
const navigationSchema = z.object({
  intent: z.literal("save_navigation"),
  configuration: z.string().min(2).max(20_000),
});

const defaults = ["accueil", "a-propos", "professionnel", "faq", "contact", "cgv", "mentions-legales", "politique-de-confidentialite"];
const placeholderFr = "Contenu à compléter avant publication.";
const placeholderEn = "Content to complete before publication.";

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, pages: [] as ContentPage[], navigation: await getSiteNavigation() };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const [{ data, error }, navigation] = await Promise.all([
    client
      .from("content_pages")
      .select("*,content_page_translations(*)")
      .neq("page_key", "bandeau")
      .neq("page_key", "navigation")
      .order("page_key"),
    getSiteNavigation(),
  ]);
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, pages: (data ?? []) as ContentPage[], navigation };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const formData = await request.formData();
  const fields = Object.fromEntries(formData);
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

  const contentFr = parseRichTextInput(parsed.data.contentFr, 10);
  const contentEn = parseRichTextInput(parsed.data.contentEn, 10);
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

  const translations = [
    {
      locale: "fr-FR",
      title: parsed.data.titleFr,
      seo_title: parsed.data.seoTitleFr,
      seo_description: parsed.data.seoDescriptionFr,
      blocks: [{ type: "richText", content: contentFr }],
    },
    {
      locale: "en-GB",
      title: parsed.data.titleEn,
      seo_title: parsed.data.seoTitleEn,
      seo_description: parsed.data.seoDescriptionEn,
      blocks: [{ type: "richText", content: contentEn }],
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

function ContentPageForm({ pageKey, page, demo }: { pageKey: string; page?: ContentPage; demo: boolean }) {
  const fr = page?.content_page_translations.find((translation) => translation.locale === "fr-FR");
  const en = page?.content_page_translations.find((translation) => translation.locale === "en-GB");

  return <Form method="post">
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
        <RichTextEditor name="contentFr" label="Paragraphes" initialContent={initialContent(fr, placeholderFr)} disabled={demo} />
      </fieldset>
      <fieldset>
        <legend>English</legend>
        <div className="field"><label>Title<input name="titleEn" defaultValue={en?.title ?? pageKey} required /></label></div>
        <div className="field"><label>SEO title<input name="seoTitleEn" defaultValue={en?.seo_title ?? pageKey} required /></label></div>
        <div className="field"><label>SEO description<textarea name="seoDescriptionEn" defaultValue={en?.seo_description ?? "Description to complete before publication."} required /></label></div>
        <RichTextEditor name="contentEn" label="Paragraphs" initialContent={initialContent(en, placeholderEn)} disabled={demo} />
      </fieldset>
    </div>
    <button className="ui-button ui-button--default" type="submit" disabled={demo}>Enregistrer</button>
  </Form>;
}

export default function AdminContent() {
  const { demo, pages, navigation } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const location = useLocation();
  const arranging = new URLSearchParams(location.search).get("tab") === "rangement";
  const byKey = new Map(pages.map((page) => [page.page_key, page]));
  const keys = [...new Set([...defaults, ...byKey.keys()])];

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
      <Link role="tab" aria-selected={!arranging} className={!arranging ? "is-active" : undefined} to="/admin/contenus">Contenu</Link>
      <Link role="tab" aria-selected={arranging} className={arranging ? "is-active" : undefined} to="/admin/contenus?tab=rangement">Rangement</Link>
    </nav>
    {arranging ? <AdminNavigationOrganizer initialConfiguration={navigation} demo={demo} /> : <div className="admin-content-list">
        {keys.map((key) => {
          const page = byKey.get(key);
          return <details className="ui-card admin-content-page" key={key}>
            <summary><strong>{key}</strong><span className="ui-badge">{page?.status ?? "draft"}</span></summary>
            <ContentPageForm pageKey={key} page={page} demo={demo} />
          </details>;
        })}
      </div>}
  </AdminShell>;
}
