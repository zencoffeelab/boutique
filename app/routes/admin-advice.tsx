import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

type AdviceTranslation = { locale: "fr-FR" | "en-GB"; title: string; excerpt: string; blocks: Array<{ content: string }>; seo_title: string; seo_description: string };
type AdviceArticle = { id: string; slug: string; status: "draft" | "published" | "archived"; published_at: string; advice_translations: AdviceTranslation[] };

const adviceSchema = z.object({
  intent: z.literal("save_advice"),
  id: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "published", "archived"]),
  publishedAt: z.string().min(10),
  titleFr: z.string().trim().min(3), titleEn: z.string().trim().min(3),
  excerptFr: z.string().trim().min(10), excerptEn: z.string().trim().min(10),
  bodyFr: z.string().trim().min(20), bodyEn: z.string().trim().min(20),
  seoTitleFr: z.string().trim().min(3), seoTitleEn: z.string().trim().min(3),
  seoDescriptionFr: z.string().trim().min(10), seoDescriptionEn: z.string().trim().min(10),
});
const deleteAdviceSchema = z.object({ intent: z.literal("delete_advice"), id: z.uuid() });

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, articles: [] as AdviceArticle[] };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data: articles, error } = await client.from("advice_articles").select("*,advice_translations(*)").order("created_at", { ascending: false });
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, articles: (articles ?? []) as AdviceArticle[] };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const form = Object.fromEntries(await request.formData());
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };

  if (form.intent === "delete_advice") {
    const parsed = deleteAdviceSchema.safeParse(form);
    if (!parsed.success) return { ok: false, message: "Conseil invalide." };
    const { data: before, error: readError } = await client.from("advice_articles").select("*,advice_translations(*)").eq("id", parsed.data.id).maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!before) return { ok: false, message: "Conseil introuvable." };
    const { error } = await client.from("advice_articles").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, message: error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "advice.deleted", entity_type: "advice_article", entity_id: parsed.data.id, before_data: before });
    return { ok: true, message: "Conseil supprimé." };
  }

  const parsed = adviceSchema.safeParse(form);
  if (!parsed.success) return { ok: false, message: "Les versions française et anglaise du conseil sont requises." };
  const articleValues = { slug: parsed.data.slug, status: parsed.data.status, published_at: new Date(parsed.data.publishedAt).toISOString() };
  const mutation = parsed.data.id
    ? await client.from("advice_articles").update(articleValues).eq("id", parsed.data.id).select("id").single()
    : await client.from("advice_articles").insert(articleValues).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "Conseil non enregistré." };
  const blocks = (text: string) => text.split(/\n{2,}/).map((content) => content.trim()).filter(Boolean).map((content) => ({ type: "paragraph", content }));
  const translations = [
    { locale: "fr-FR", title: parsed.data.titleFr, excerpt: parsed.data.excerptFr, blocks: blocks(parsed.data.bodyFr), seo_title: parsed.data.seoTitleFr, seo_description: parsed.data.seoDescriptionFr },
    { locale: "en-GB", title: parsed.data.titleEn, excerpt: parsed.data.excerptEn, blocks: blocks(parsed.data.bodyEn), seo_title: parsed.data.seoTitleEn, seo_description: parsed.data.seoDescriptionEn },
  ].map((translation) => ({ ...translation, article_id: mutation.data.id }));
  const { error } = await client.from("advice_translations").upsert(translations, { onConflict: "article_id,locale" });
  if (error) {
    if (!parsed.data.id) await client.from("advice_articles").delete().eq("id", mutation.data.id);
    return { ok: false, message: error.message };
  }
  await client.from("audit_log").insert({ actor_id: admin.id, action: parsed.data.id ? "advice.updated" : "advice.created", entity_type: "advice_article", entity_id: mutation.data.id, after_data: parsed.data });
  return { ok: true, message: "Conseil enregistré." };
}

export const meta: MetaFunction = () => [{ title: "Conseils | Administration Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function AdviceForm({ article, demo }: { article?: AdviceArticle; demo: boolean }) {
  const fr = article?.advice_translations.find((item) => item.locale === "fr-FR");
  const en = article?.advice_translations.find((item) => item.locale === "en-GB");
  const body = (translation?: AdviceTranslation) => (translation?.blocks ?? []).map((block) => block.content).join("\n\n");
  return <Form method="post">
    <input type="hidden" name="intent" value="save_advice" /><input type="hidden" name="id" value={article?.id ?? ""} />
    <div className="form-grid"><div className="field"><label>Slug<input name="slug" defaultValue={article?.slug ?? ""} required /></label></div><div className="field"><label>Statut<select name="status" defaultValue={article?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label></div><div className="field"><label>Date de publication<input name="publishedAt" type="datetime-local" defaultValue={(article?.published_at ?? new Date().toISOString()).slice(0, 16)} required /></label></div></div>
    <div className="admin-content-columns"><fieldset><legend>Français</legend><div className="field"><label>Titre<input name="titleFr" defaultValue={fr?.title ?? ""} required /></label></div><div className="field"><label>Extrait<textarea name="excerptFr" defaultValue={fr?.excerpt ?? ""} required /></label></div><div className="field"><label>Paragraphes<textarea name="bodyFr" defaultValue={body(fr)} required /></label></div><div className="field"><label>Titre SEO<input name="seoTitleFr" defaultValue={fr?.seo_title ?? ""} required /></label></div><div className="field"><label>Description SEO<textarea name="seoDescriptionFr" defaultValue={fr?.seo_description ?? ""} required /></label></div></fieldset><fieldset><legend>English</legend><div className="field"><label>Title<input name="titleEn" defaultValue={en?.title ?? ""} required /></label></div><div className="field"><label>Excerpt<textarea name="excerptEn" defaultValue={en?.excerpt ?? ""} required /></label></div><div className="field"><label>Paragraphs<textarea name="bodyEn" defaultValue={body(en)} required /></label></div><div className="field"><label>SEO title<input name="seoTitleEn" defaultValue={en?.seo_title ?? ""} required /></label></div><div className="field"><label>SEO description<textarea name="seoDescriptionEn" defaultValue={en?.seo_description ?? ""} required /></label></div></fieldset></div>
    <button className="ui-button ui-button--default" type="submit" disabled={demo}>{article ? "Enregistrer" : <><Plus aria-hidden="true" /> Ajouter</>}</button>
  </Form>;
}

export default function AdminAdvice() {
  const { demo, articles } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <AdminShell active="advice">
    <header className="admin-heading"><div><p className="eyebrow">Mini-CMS</p><h1>Conseils</h1><p className="admin-heading__description">Créez et publiez les recettes et guides pratiques du site.</p></div></header>
    {demo ? <p className="admin-notice">Connectez Supabase pour modifier les conseils.</p> : null}
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    <div className="admin-content-list">
      {articles.map((article) => {
        const title = article.advice_translations.find((translation) => translation.locale === "fr-FR")?.title ?? article.slug;
        return <details className="ui-card admin-content-page" key={article.id}>
          <summary><span><strong>{title}</strong><small className="admin-muted">{article.slug}</small></span><span className="ui-badge">{article.status}</span></summary>
          <AdviceForm article={article} demo={demo} />
          <Form method="post" className="admin-delete-form" onSubmit={(event) => { if (!window.confirm(`Supprimer définitivement le conseil « ${title} » ?`)) event.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete_advice" /><input type="hidden" name="id" value={article.id} />
            <button className="ui-button ui-button--danger ui-button--sm" type="submit" disabled={demo}><Trash2 aria-hidden="true" /> Supprimer le conseil</button>
          </Form>
        </details>;
      })}
      {articles.length === 0 ? <p className="ui-card admin-empty-state">Aucun conseil enregistré.</p> : null}
    </div>
    <section className="ui-card admin-editor" aria-labelledby="new-advice-title"><h2 id="new-advice-title">Nouveau conseil</h2><AdviceForm demo={demo} /></section>
  </AdminShell>;
}
