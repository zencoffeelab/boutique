import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
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

const defaults = ["accueil", "a-propos", "professionnel", "faq", "contact", "cgv", "mentions-legales", "politique-de-confidentialite"];
const placeholderFr = "Contenu à compléter avant publication.";
const placeholderEn = "Content to complete before publication.";

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, pages: [] as ContentPage[] };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data, error } = await client
    .from("content_pages")
    .select("*,content_page_translations(*)")
    .neq("page_key", "bandeau")
    .order("page_key");
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, pages: (data ?? []) as ContentPage[] };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const parsed = pageSchema.safeParse(Object.fromEntries(await request.formData()));
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
  const { demo, pages } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const byKey = new Map(pages.map((page) => [page.page_key, page]));
  const keys = [...new Set([...defaults, ...byKey.keys()])];

  return <AdminShell active="content">
    <header className="admin-heading">
      <div>
        <p className="eyebrow">Mini-CMS</p>
        <h1>Contenus</h1>
      </div>
    </header>
    {demo ? <p className="admin-notice">Connectez Supabase pour éditer les pages avec l’éditeur enrichi.</p> : null}
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}
    <div className="admin-content-list">
      {keys.map((key) => {
        const page = byKey.get(key);
        return <details className="ui-card admin-content-page" key={key}>
          <summary><strong>{key}</strong><span className="ui-badge">{page?.status ?? "draft"}</span></summary>
          <ContentPageForm pageKey={key} page={page} demo={demo} />
        </details>;
      })}
    </div>
  </AdminShell>;
}
