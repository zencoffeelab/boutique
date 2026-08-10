import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData, useLocation } from "react-router";
import { z } from "zod";
import { AdminShell } from "~/components/admin-shell";
import { AdminImageEditorInput } from "~/components/admin-image-editor-input";
import { RichTextEditor } from "~/components/rich-text-editor";
import { requireAdmin } from "~/lib/auth.server";
import { paragraphsToRichTextDocument, parseRichTextInput, richTextPlainText, storedBlocksToRichTextDocument } from "~/lib/rich-text";
import { createServiceSupabase } from "~/lib/supabase.server";

type Translation = { locale: "fr-FR" | "en-GB"; title: string; excerpt: string; blocks: Array<{ type?: string; content: unknown }>; seo_title: string; seo_description: string };
type Article = { id: string; slug: string; status: "draft" | "published" | "archived"; published_at: string; advice_translations: Translation[] };

function normalizeSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const schema = z.object({
  intent: z.literal("save_advice"),
  id: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  slug: z.preprocess((value) => typeof value === "string" ? normalizeSlug(value) : value, z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  status: z.enum(["draft", "published", "archived"]),
  publishedAt: z.string().min(10),
  titleFr: z.string().trim().min(3), titleEn: z.string().trim().min(3),
  excerptFr: z.string().trim().min(10), excerptEn: z.string().trim().min(10),
  bodyFr: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional()),
  bodyEn: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional()),
  body2Fr: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(20).optional()),
  body2En: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(20).optional()),
  seoTitleFr: z.string().trim().min(3), seoTitleEn: z.string().trim().min(3),
  seoDescriptionFr: z.string().trim().min(10), seoDescriptionEn: z.string().trim().min(10),
  introImageUrlFr: z.string().trim().max(2000).optional(), introImageUrlEn: z.string().trim().max(2000).optional(),
  introImageAltFr: z.string().trim().max(300).optional(), introImageAltEn: z.string().trim().max(300).optional(),
  bodyImageUrlFr: z.string().trim().max(2000).optional(), bodyImageUrlEn: z.string().trim().max(2000).optional(),
  bodyImageAltFr: z.string().trim().max(300).optional(), bodyImageAltEn: z.string().trim().max(300).optional(),
  body2ImageUrlFr: z.string().trim().max(2000).optional(), body2ImageUrlEn: z.string().trim().max(2000).optional(),
  body2ImageAltFr: z.string().trim().max(300).optional(), body2ImageAltEn: z.string().trim().max(300).optional(),
});
const deleteSchema = z.object({ intent: z.literal("delete_advice"), id: z.uuid() });

function parseIntroduction(value: string) {
  return parseRichTextInput(value, 10) ?? paragraphsToRichTextDocument([value]);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, articles: [] as Article[] };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data, error } = await client.from("advice_articles").select("*,advice_translations(*)").order("created_at", { ascending: false });
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, articles: (data ?? []) as Article[] };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const formData = await request.formData();
  const form = Object.fromEntries(formData);
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };
  if (form.intent === "delete_advice") {
    const parsed = deleteSchema.safeParse(form);
    if (!parsed.success) return { ok: false, message: "Article invalide." };
    const { data: before, error: readError } = await client.from("advice_articles").select("*,advice_translations(*)").eq("id", parsed.data.id).maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!before) return { ok: false, message: "Article introuvable." };
    const { error } = await client.from("advice_articles").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, message: error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "advice.deleted", entity_type: "advice_article", entity_id: parsed.data.id, before_data: before });
    return { ok: true, message: "Conseil supprimé." };
  }
  const validationForm = { ...form };
  const requiredFields = ["slug", "status", "publishedAt", "titleFr", "titleEn", "excerptFr", "excerptEn", "bodyFr", "bodyEn", "seoTitleFr", "seoTitleEn", "seoDescriptionFr", "seoDescriptionEn"];
  const missingFields = requiredFields.filter((field) => !(field in validationForm));
  if (typeof form.id === "string" && form.id && missingFields.length > 0) {
    const { data: existing, error: existingError } = await client.from("advice_articles").select("*,advice_translations(*)").eq("id", form.id).maybeSingle();
    if (existingError) return { ok: false, message: existingError.message };
    const storedTranslation = (existing?.advice_translations ?? []) as Translation[];
    const storedLayout = (translation?: Translation) => layout(translation) ?? {};
    const storedValue = (field: string, suffix: "Fr" | "En") => {
      const translation = storedTranslation.find((item) => item.locale === (suffix === "Fr" ? "fr-FR" : "en-GB"));
      if (!translation) return undefined;
      if (field === "title") return translation.title;
      if (field === "excerpt") return translation.excerpt;
      if (field === "body") return JSON.stringify(storedBlocksToRichTextDocument(translation.blocks));
      if (field === "seoTitle") return translation.seo_title;
      if (field === "seoDescription") return translation.seo_description;
      if (field === "body2") {
        const value = storedLayout(translation).body2;
        return value ? JSON.stringify(storedBlocksToRichTextDocument([{ type: "richText", content: value }])) : undefined;
      }
      if (field === "introImageUrl" || field === "introImageAlt") return storedLayout(translation)[field];
      return undefined;
    };
    if ((!(("slug" in validationForm) && typeof validationForm.slug === "string" && validationForm.slug.trim())) && typeof existing?.slug === "string") validationForm.slug = existing.slug;
    if (!("status" in validationForm) && typeof existing?.status === "string") validationForm.status = existing.status;
    if (!("publishedAt" in validationForm) && typeof existing?.published_at === "string") validationForm.publishedAt = existing.published_at.slice(0, 16);
    for (const suffix of ["Fr", "En"] as const) {
      for (const field of ["title", "excerpt", "body", "seoTitle", "seoDescription", "body2", "introImageUrl", "introImageAlt"]) {
        const name = `${field}${suffix}`;
        if (!(name in validationForm)) {
          const value = storedValue(field, suffix);
          if (typeof value === "string") validationForm[name] = value;
        }
      }
    }
  }
  const parsed = schema.safeParse(validationForm);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
    return { ok: false, message: fields.length ? `Champs invalides ou manquants : ${fields.join(", ")}.` : "Complétez les deux langues et les sections de l’article." };
  }
  const bodyFr = parsed.data.bodyFr ? parseRichTextInput(parsed.data.bodyFr, 1) : null;
  const bodyEn = parsed.data.bodyEn ? parseRichTextInput(parsed.data.bodyEn, 1) : null;
  const excerptFr = parseIntroduction(parsed.data.excerptFr);
  const excerptEn = parseIntroduction(parsed.data.excerptEn);
  const resolvedBodyFr = bodyFr ?? paragraphsToRichTextDocument([richTextPlainText(excerptFr)]);
  const resolvedBodyEn = bodyEn ?? paragraphsToRichTextDocument([richTextPlainText(excerptEn)]);
  const body2Fr = parsed.data.body2Fr ? parseRichTextInput(parsed.data.body2Fr, 1) : null;
  const body2En = parsed.data.body2En ? parseRichTextInput(parsed.data.body2En, 1) : null;
  const resolvedBody2Fr = body2Fr && body2En ? body2Fr : null;
  const resolvedBody2En = body2Fr && body2En ? body2En : null;
  const values = { slug: parsed.data.slug, status: parsed.data.status, published_at: new Date(parsed.data.publishedAt).toISOString() };
  const mutation = parsed.data.id
    ? await client.from("advice_articles").update(values).eq("id", parsed.data.id).select("id").single()
    : await client.from("advice_articles").insert(values).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "Article non enregistré." };
  const uploadImage = async (name: string, position: 0 | 1 | 2, locale: "fr" | "en" | "shared") => {
    const fileValue = formData.get(name);
    if (!fileValue || typeof fileValue !== "object" || typeof (fileValue as File).arrayBuffer !== "function") return null;
    const file = fileValue as File;
    if (file.size === 0) return null;
    if (file.size > 8_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Les images doivent être au format JPEG, PNG ou WebP et peser moins de 8 Mo.");
    const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const path = `${mutation.data.id}/${position === 0 ? "intro" : `block-${position}`}-${locale}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from("advice-media").upload(path, await file.arrayBuffer(), { contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);
    return client.storage.from("advice-media").getPublicUrl(path).data.publicUrl;
  };
  let uploaded: Record<string, string | null>;
  try {
    uploaded = {
      introImageShared: await uploadImage("introImageFileShared", 0, "shared"),
      bodyImageFr: await uploadImage("bodyImageFileFr", 1, "fr"), bodyImageEn: await uploadImage("bodyImageFileEn", 1, "en"),
      body2ImageFr: await uploadImage("body2ImageFileFr", 2, "fr"), body2ImageEn: await uploadImage("body2ImageFileEn", 2, "en"),
    };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Image non importée." }; }
  const translation = (locale: "fr-FR" | "en-GB", suffix: "Fr" | "En", body: typeof bodyFr, body2: typeof body2Fr) => ({
    article_id: mutation.data.id,
    locale,
    title: parsed.data[`title${suffix}`],
    excerpt: JSON.stringify(suffix === "Fr" ? excerptFr : excerptEn),
    seo_title: parsed.data[`seoTitle${suffix}`],
    seo_description: parsed.data[`seoDescription${suffix}`],
    blocks: [
      { type: "richText", content: body },
      { type: "storyLayout", content: {
        introImageUrl: uploaded.introImageShared ?? parsed.data[`introImageUrl${suffix}`] ?? "",
        introImageAlt: parsed.data[`introImageAlt${suffix}`] ?? "",
        introImageFirst: false,
        bodyImageUrl: uploaded[`bodyImage${suffix}`] ?? parsed.data[`bodyImageUrl${suffix}`] ?? "",
        bodyImageAlt: parsed.data[`bodyImageAlt${suffix}`] ?? "",
        bodyImageFirst: false,
        ...(body2 ? { body2 } : {}),
        body2ImageUrl: uploaded[`body2Image${suffix}`] ?? parsed.data[`body2ImageUrl${suffix}`] ?? "",
        body2ImageAlt: parsed.data[`body2ImageAlt${suffix}`] ?? "",
      } },
    ],
  });
  const { error } = await client.from("advice_translations").upsert([
    translation("fr-FR", "Fr", resolvedBodyFr, resolvedBody2Fr),
    translation("en-GB", "En", resolvedBodyEn, resolvedBody2En),
  ], { onConflict: "article_id,locale" });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Conseil enregistré." };
}

export const meta: MetaFunction = () => [{ title: "Conseils | Administration Zen Coffee Lab" }];

function layout(translation?: Translation) {
  return translation?.blocks.find((block) => block.type === "storyLayout")?.content as Record<string, unknown> | undefined;
}

function LanguageTabs({ label, french, english }: { label: string; french: ReactNode; english: ReactNode }) {
  const [activeLanguage, setActiveLanguage] = useState<"fr" | "en">("fr");
  const id = useId();
  const tabs = [{ language: "fr" as const, label: "Français", content: french }, { language: "en" as const, label: "English", content: english }];
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveLanguage(tabs[nextIndex].language);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextIndex]?.focus();
  };
  return <div className="admin-language-tabs">
    <div className="admin-language-tabs__list" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.language} type="button" role="tab" id={`${id}-${tab.language}-tab`} aria-controls={`${id}-${tab.language}-panel`} aria-selected={activeLanguage === tab.language} tabIndex={activeLanguage === tab.language ? 0 : -1} onClick={() => setActiveLanguage(tab.language)} onKeyDown={(event) => selectFromKeyboard(event, index)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.language} role="tabpanel" id={`${id}-${tab.language}-panel`} aria-labelledby={`${id}-${tab.language}-tab`} hidden={activeLanguage !== tab.language} onInvalidCapture={() => setActiveLanguage(tab.language)}>{tab.content}</div>)}
  </div>;
}

function StoryImage({ url, alt }: { url: string; alt: string }) {
  return url ? <img src={url} alt={alt} /> : <div className="admin-editorial-block__placeholder">Aucune image</div>;
}

function LegacyArticleForm({ article, demo }: { article?: Article; demo: boolean }) {
  const fr = article?.advice_translations.find((item) => item.locale === "fr-FR");
  const en = article?.advice_translations.find((item) => item.locale === "en-GB");
  const frLayout = layout(fr);
  const enLayout = layout(en);
  const introductionFields = (locale: "Fr" | "En", translation: Translation | undefined, data: Record<string, unknown> | undefined) => {
    const english = locale === "En";
    return <fieldset className="admin-editorial-block__language"><legend>{english ? "English" : "Français"}</legend>
      <div className="field"><label>{english ? "Title" : "Titre"}<input name={`title${locale}`} defaultValue={translation?.title ?? ""} required /></label></div>
      <div className="field"><label>{english ? "Introduction" : "Introduction"}<textarea name={`excerpt${locale}`} defaultValue={translation?.excerpt ?? ""} required /></label></div>
      <div className="field"><label>{english ? "Image URL" : "URL de l’image"}<input name={`introImageUrl${locale}`} type="url" defaultValue={String(data?.introImageUrl ?? "")} /></label></div>
      <div className="field"><label>{english ? "Image alternative text" : "Texte alternatif de l’image"}<input name={`introImageAlt${locale}`} defaultValue={String(data?.introImageAlt ?? "")} /></label></div>
    </fieldset>;
  };
  const bodyFields = (locale: "Fr" | "En", translation: Translation | undefined, data: Record<string, unknown> | undefined) => {
    const english = locale === "En";
    return <fieldset className="admin-editorial-block__language"><legend>{english ? "English" : "Français"}</legend>
      <RichTextEditor name={`body${locale}`} label={english ? "Article content" : "Contenu de l’article"} initialContent={storedBlocksToRichTextDocument(translation?.blocks)} disabled={demo} />
      <h3>{english ? "Block 2 · Image left / text right" : "Bloc 2 · Image à gauche / texte à droite"}</h3>
      <RichTextEditor name={`body2${locale}`} label={english ? "Second block text" : "Texte du second bloc"} initialContent={storedBlocksToRichTextDocument([{ type: "richText", content: data?.body2 }])} disabled={demo} />
      <p className="admin-advice-editor__hint">{english ? "Add headings to split the story into alternating text and image sections." : "Ajoutez des titres pour créer des sections alternant automatiquement texte et image."}</p>
      <div className="field"><label>{english ? "Image URL" : "URL de l’image"}<input name={`bodyImageUrl${locale}`} type="url" defaultValue={String(data?.bodyImageUrl ?? "")} /></label></div>
      <div className="field"><label>{english ? "Image alternative text" : "Texte alternatif de l’image"}<input name={`bodyImageAlt${locale}`} defaultValue={String(data?.bodyImageAlt ?? "")} /></label></div>
    </fieldset>;
  };
  return <Form method="post" encType="multipart/form-data" className="admin-advice-editor">
    <input type="hidden" name="intent" value="save_advice" /><input type="hidden" name="id" value={article?.id ?? ""} />
    <section className="admin-advice-editor__settings"><div><p className="eyebrow">Publication</p><h2>{article ? "Éditer l’article" : "Nouvel article"}</h2></div><div className="form-grid"><label>Slug<input name="slug" defaultValue={article?.slug ?? ""} required /></label><label>Statut<select name="status" defaultValue={article?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label><label>Date de publication<input name="publishedAt" type="datetime-local" defaultValue={(article?.published_at ?? new Date().toISOString()).slice(0, 16)} required /></label></div></section>
    <section className="admin-editorial-block admin-advice-editor__block admin-advice-editor__block--copy-first"><header className="admin-editorial-block__heading"><div><p className="eyebrow">En-tête et introduction</p><h3>Texte à gauche · image à droite</h3></div></header><div className="admin-editorial-block__layout"><div className="admin-editorial-block__image"><StoryImage url={String(frLayout?.introImageUrl ?? "")} alt={String(frLayout?.introImageAlt ?? "")} /></div><div className="admin-editorial-block__content"><LanguageTabs label="Langue de l’en-tête et de l’introduction" french={introductionFields("Fr", fr, frLayout)} english={introductionFields("En", en, enLayout)} /></div></div></section>
    <section className="admin-editorial-block admin-advice-editor__block"><header className="admin-editorial-block__heading"><div><p className="eyebrow">Corps de l’article</p><h3>Image à gauche · texte à droite</h3></div></header><div className="admin-editorial-block__layout"><div className="admin-editorial-block__image"><StoryImage url={String(frLayout?.bodyImageUrl ?? "")} alt={String(frLayout?.bodyImageAlt ?? "")} /></div><div className="admin-editorial-block__content"><LanguageTabs label="Langue du corps de l’article" french={bodyFields("Fr", fr, frLayout)} english={bodyFields("En", en, enLayout)} /></div></div></section>
    <section className="admin-advice-editor__seo"><h3>Référencement</h3><LanguageTabs label="Langue du référencement" french={<fieldset className="admin-editorial-block__language"><legend>Français</legend><div className="field"><label>Titre SEO<input name="seoTitleFr" defaultValue={fr?.seo_title ?? ""} required /></label></div><div className="field"><label>Description SEO<textarea name="seoDescriptionFr" defaultValue={fr?.seo_description ?? ""} required /></label></div></fieldset>} english={<fieldset className="admin-editorial-block__language"><legend>English</legend><div className="field"><label>SEO title<input name="seoTitleEn" defaultValue={en?.seo_title ?? ""} required /></label></div><div className="field"><label>SEO description<textarea name="seoDescriptionEn" defaultValue={en?.seo_description ?? ""} required /></label></div></fieldset>} /></section>
    <div className="admin-editor__actions"><button className="ui-button ui-button--default" disabled={demo}>{article ? "Enregistrer" : <><Plus /> Nouveau blog</>}</button>{article ? <Link className="ui-button ui-button--ghost" to={`/conseils/${article.slug}`}>Lire l’article</Link> : null}</div>
  </Form>;
}

function ArticleForm({ article, demo }: { article?: Article; demo: boolean }) {
  const fr = article?.advice_translations.find((item) => item.locale === "fr-FR");
  const en = article?.advice_translations.find((item) => item.locale === "en-GB");
  const frLayout = layout(fr);
  const enLayout = layout(en);
  const intro = (locale: "Fr" | "En", translation?: Translation) => <fieldset className="admin-editorial-block__language"><legend>{locale === "Fr" ? "Français" : "English"}</legend>{locale === "Fr" ? <AdminImageEditorInput name="introImageFileShared" label="Image commune sous le titre" help="Cette image sera utilisée dans les deux langues · JPEG, PNG ou WebP · recadrage libre" currentPreviewUrl={String(layout(translation)?.introImageUrl ?? "")} defaultAspect="original" defaultOutputWidth={1500} /> : null}<div className="field"><label>{locale === "Fr" ? "Titre" : "Title"}<input name={`title${locale}`} defaultValue={translation?.title ?? ""} required /></label></div><div className="field"><label>{locale === "Fr" ? "Texte alternatif de l’image" : "Image alternative text"}<input name={`introImageAlt${locale}`} defaultValue={String(layout(translation)?.introImageAlt ?? "")} /></label></div><RichTextEditor name={`excerpt${locale}`} label="Introduction" initialContent={parseIntroduction(translation?.excerpt ?? "")} disabled={demo} /></fieldset>;
  const block = (position: 1 | 2, locale: "Fr" | "En", translation: Translation | undefined, data: Record<string, unknown> | undefined) => <fieldset className="admin-editorial-block__language"><legend>{locale === "Fr" ? "Français" : "English"}</legend><RichTextEditor name={position === 1 ? `body${locale}` : `body2${locale}`} label={locale === "Fr" ? "Texte" : "Text"} initialContent={position === 1 ? storedBlocksToRichTextDocument(translation?.blocks) : storedBlocksToRichTextDocument([{ type: "richText", content: data?.body2 }])} disabled={demo} /><input type="hidden" name={position === 1 ? `bodyImageUrl${locale}` : `body2ImageUrl${locale}`} value={String(position === 1 ? data?.bodyImageUrl ?? "" : data?.body2ImageUrl ?? "")} /><AdminImageEditorInput name={position === 1 ? `bodyImageFile${locale}` : `body2ImageFile${locale}`} label={locale === "Fr" ? "Image du bloc" : "Block image"} help="JPEG, PNG ou WebP · recadrage au ratio 75:83" currentPreviewUrl={String(position === 1 ? data?.bodyImageUrl ?? "" : data?.body2ImageUrl ?? "")} defaultAspect="75:83" lockAspect defaultOutputWidth={1500} /><div className="field"><label>{locale === "Fr" ? "Texte alternatif" : "Alternative text"}<input name={position === 1 ? `bodyImageAlt${locale}` : `body2ImageAlt${locale}`} defaultValue={String(position === 1 ? data?.bodyImageAlt ?? "" : data?.body2ImageAlt ?? "")} /></label></div></fieldset>;
  const editorial = (position: 1 | 2, imageFirst: boolean) => <section className={`admin-editorial-block admin-advice-editor__block${imageFirst ? "" : " admin-advice-editor__block--copy-first"}`}><header className="admin-editorial-block__heading"><div><p className="eyebrow">Bloc {position}</p><h3>{imageFirst ? "Image à gauche · texte à droite" : "Texte à gauche · image à droite"}</h3></div></header><div className="admin-editorial-block__layout"><div className="admin-editorial-block__image"><StoryImage url={String(position === 1 ? frLayout?.bodyImageUrl ?? "" : frLayout?.body2ImageUrl ?? "")} alt={String(position === 1 ? frLayout?.bodyImageAlt ?? "" : frLayout?.body2ImageAlt ?? "")} /></div><div className="admin-editorial-block__content"><LanguageTabs label={`Langue du bloc ${position}`} french={block(position, "Fr", fr, frLayout)} english={block(position, "En", en, enLayout)} /></div></div></section>;
  const actionLabel = article ? "Modifier" : null;
  return <Form method="post" encType="multipart/form-data" className="admin-advice-editor"><input type="hidden" name="intent" value="save_advice" /><input type="hidden" name="id" value={article?.id ?? ""} /><section className="admin-advice-editor__top"><div className="admin-advice-editor__settings"><p className="eyebrow">Publication</p><div className="form-grid"><label>Slug<input name="slug" defaultValue={article?.slug ?? ""} required /></label><label>Statut<select name="status" defaultValue={article?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label><label>Date de publication<input name="publishedAt" type="datetime-local" defaultValue={(article?.published_at ?? new Date().toISOString()).slice(0, 16)} required /></label></div></div><section className="admin-advice-editor__introduction"><h2>Titre et introduction</h2><LanguageTabs label="Langue du titre et de l’introduction" french={intro("Fr", fr)} english={intro("En", en)} /></section></section>{editorial(1, false)}{editorial(2, true)}<section className="admin-advice-editor__seo"><h3>Référencement</h3><LanguageTabs label="Langue du référencement" french={<fieldset className="admin-editorial-block__language"><legend>Français</legend><div className="field"><label>Titre SEO<input name="seoTitleFr" defaultValue={fr?.seo_title ?? ""} required /></label></div><div className="field"><label>Description SEO<textarea name="seoDescriptionFr" defaultValue={fr?.seo_description ?? ""} required /></label></div></fieldset>} english={<fieldset className="admin-editorial-block__language"><legend>English</legend><div className="field"><label>SEO title<input name="seoTitleEn" defaultValue={en?.seo_title ?? ""} required /></label></div><div className="field"><label>SEO description<textarea name="seoDescriptionEn" defaultValue={en?.seo_description ?? ""} required /></label></div></fieldset>} /></section><div className="admin-editor__actions"><button className="ui-button ui-button--default" disabled={demo}>{actionLabel ?? <><Plus /> Nouveau blog</>}</button>{article ? <Link className="ui-button ui-button--ghost" to={`/conseils/${article.slug}`}>Lire l’article</Link> : null}</div></Form>;
}

export default function AdminAdvice() {
  const { demo, articles } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const query = new URLSearchParams(useLocation().search);
  const creating = query.get("new") === "1";
  const selected = query.get("article");
  return <AdminShell active="advice"><header className="admin-heading"><div><p className="eyebrow">Mini-CMS</p><h1>Conseils</h1><p className="admin-heading__description">Composez chaque publication selon sa mise en page Journal : introduction puis sections alternées texte et image.</p></div>{creating ? null : <Link className="ui-button ui-button--default" to="/admin/conseils?new=1"><Plus /> Nouveau blog</Link>}</header>{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}<div className="admin-content-list">{articles.map((article) => { const title = article.advice_translations.find((item) => item.locale === "fr-FR")?.title ?? article.slug; return <details className="ui-card admin-content-page" key={article.id} open={selected === article.id}><summary><strong>{title}</strong><span className="ui-badge">{article.status}</span></summary><ArticleForm article={article} demo={demo} /><Form method="post" className="admin-delete-form"><input type="hidden" name="intent" value="delete_advice" /><input type="hidden" name="id" value={article.id} /><button className="ui-button ui-button--danger ui-button--sm" disabled={demo}><Trash2 /> Supprimer</button></Form></details>; })}</div>{creating ? <section className="ui-card admin-editor"><ArticleForm demo={demo} /></section> : null}</AdminShell>;
}
