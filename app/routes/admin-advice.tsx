import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
type AdviceElement = "introText" | "introImage" | "bodyText" | "bodyImage" | "body2Text" | "body2Image";
type AdviceCompartment = "title" | "text" | "image" | "textImage" | "imageText";
type AdviceLayoutItem = { id: string; compartment: AdviceCompartment; element?: AdviceElement; customId?: string; label?: string };
type AdviceCustomItem = { id: string; type: "text" | "image"; textFr?: string; textEn?: string; imageUrl?: string; imageAltFr?: string; imageAltEn?: string; confirmed?: boolean };
type AdviceLayout = { items: AdviceLayoutItem[]; elements: AdviceElement[]; slots: Array<{ text: "intro" | "body" | "body2"; image: "intro" | "body" | "body2" }>; customItems: AdviceCustomItem[]; shortIntroFr?: string; shortIntroEn?: string };

const defaultAdviceLayout: AdviceLayout = { items: [{ id: "title", compartment: "title", label: "Titre" }, { id: "intro-text", compartment: "text", element: "introText", label: "Introduction" }, { id: "intro-image", compartment: "image", element: "introImage", label: "Image sous le titre" }, { id: "body-pair", compartment: "textImage", element: "bodyText", label: "Bloc texte + image" }, { id: "body2-pair", compartment: "imageText", element: "body2Text", label: "Bloc image + texte" }], elements: ["introText", "introImage", "bodyText", "bodyImage", "body2Text", "body2Image"], slots: [{ text: "intro", image: "intro" }, { text: "body", image: "body" }, { text: "body2", image: "body2" }], customItems: [] };
const adviceLayoutSchema = z.object({
  items: z.array(z.object({ id: z.string(), compartment: z.enum(["title", "text", "image", "textImage", "imageText"]), element: z.enum(["introText", "introImage", "bodyText", "bodyImage", "body2Text", "body2Image"]).optional(), customId: z.string().optional(), label: z.string().max(120).optional() })).optional(),
  elements: z.array(z.enum(["introText", "introImage", "bodyText", "bodyImage", "body2Text", "body2Image"])).optional(),
  slots: z.array(z.object({ text: z.enum(["intro", "body", "body2"]), image: z.enum(["intro", "body", "body2"]) })).min(2).max(3).optional(),
});

function parseAdviceLayout(value: unknown): AdviceLayout {
  const parsed = adviceLayoutSchema.safeParse(value);
  if (!parsed.success) return defaultAdviceLayout;
  const slots = parsed.data.slots ? (parsed.data.slots.length === 2 ? [{ text: "intro" as const, image: "intro" as const }, ...parsed.data.slots] : parsed.data.slots) : defaultAdviceLayout.slots;
  const legacyElements = slots.flatMap((slot) => [`${slot.text}Text`, `${slot.image}Image`] as AdviceElement[]);
  const elements = parsed.data.elements?.length ? [...new Set([...parsed.data.elements, ...defaultAdviceLayout.elements])] : [...new Set(legacyElements)];
  const items = parsed.data.items?.length ? parsed.data.items.map((item) => ({ ...item, label: item.label || defaultAdviceLayout.items.find((defaultItem) => defaultItem.id === item.id)?.label })) : defaultAdviceLayout.items;
  return { items, elements, slots, customItems: [], shortIntroFr: typeof (value as { shortIntroFr?: unknown }).shortIntroFr === "string" ? (value as { shortIntroFr: string }).shortIntroFr : "", shortIntroEn: typeof (value as { shortIntroEn?: unknown }).shortIntroEn === "string" ? (value as { shortIntroEn: string }).shortIntroEn : "" };
}

function parseAdviceLayoutWithCustomItems(value: unknown): AdviceLayout {
  const base = parseAdviceLayout(value);
  if (!value || typeof value !== "object") return base;
  const rawItems = (value as { customItems?: unknown }).customItems;
  const rawCustomText = value && typeof value === "object" && typeof (value as { customText?: unknown }).customText === "object" ? (value as { customText: Record<string, string> }).customText : {};
  const customItems = Array.isArray(rawItems) ? rawItems.filter((item): item is AdviceCustomItem => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && ((item as { type?: unknown }).type === "text" || (item as { type?: unknown }).type === "image"))).map((item) => ({ id: item.id, type: item.type, textFr: typeof item.textFr === "string" && item.textFr ? item.textFr : String(rawCustomText[`${item.id}:Fr`] ?? ""), textEn: typeof item.textEn === "string" && item.textEn ? item.textEn : String(rawCustomText[`${item.id}:En`] ?? ""), imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "", imageAltFr: typeof item.imageAltFr === "string" ? item.imageAltFr : "", imageAltEn: typeof item.imageAltEn === "string" ? item.imageAltEn : "" })) : [];
  return { ...base, customItems: customItems.map((item) => ({ ...item, confirmed: true })), shortIntroFr: typeof (value as { shortIntroFr?: unknown }).shortIntroFr === "string" ? (value as { shortIntroFr: string }).shortIntroFr : "", shortIntroEn: typeof (value as { shortIntroEn?: unknown }).shortIntroEn === "string" ? (value as { shortIntroEn: string }).shortIntroEn : "" };
}

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
  layoutConfig: z.string().optional(),
  shortIntroFr: z.string().trim().max(280).optional(), shortIntroEn: z.string().trim().max(280).optional(),
});
const deleteSchema = z.object({ intent: z.literal("delete_advice"), id: z.uuid() });

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && typeof (value as File).size === "number" && typeof (value as File).type === "string" && typeof (value as File).arrayBuffer === "function");
}

function uploadedFile(form: FormData, name: string) {
  const processed = form.get(`${name}Processed`);
  return isUploadFile(processed) && processed.size > 0 ? processed : form.get(`${name}Source`) ?? form.get(name);
}

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
      if (field === "layoutConfig") return JSON.stringify(parseAdviceLayoutWithCustomItems(storedLayout(translation).layoutConfig));
      return undefined;
    };
    if ((!(("slug" in validationForm) && typeof validationForm.slug === "string" && validationForm.slug.trim())) && typeof existing?.slug === "string") validationForm.slug = existing.slug;
    if (!("status" in validationForm) && typeof existing?.status === "string") validationForm.status = existing.status;
    if (!("publishedAt" in validationForm) && typeof existing?.published_at === "string") validationForm.publishedAt = existing.published_at.slice(0, 16);
    for (const suffix of ["Fr", "En"] as const) {
      for (const field of ["title", "excerpt", "body", "seoTitle", "seoDescription", "body2", "introImageUrl", "introImageAlt", "layoutConfig"]) {
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
  let layoutConfig = defaultAdviceLayout;
  if (typeof parsed.data.layoutConfig === "string" && parsed.data.layoutConfig.trim()) {
    try { layoutConfig = parseAdviceLayoutWithCustomItems(JSON.parse(parsed.data.layoutConfig)); } catch { layoutConfig = defaultAdviceLayout; }
  }
  const values = { slug: parsed.data.slug, status: parsed.data.status, published_at: new Date(parsed.data.publishedAt).toISOString() };
  const mutation = parsed.data.id
    ? await client.from("advice_articles").update(values).eq("id", parsed.data.id).select("id").single()
    : await client.from("advice_articles").insert(values).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "Article non enregistré." };
  const uploadImage = async (name: string, position: number, locale: "fr" | "en" | "shared") => {
    const fileValue = uploadedFile(formData, name);
    if (!isUploadFile(fileValue)) return null;
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
  const customItems = layoutConfig.customItems.map((item) => ({ ...item }));
  const customItemById = new Map(customItems.map((item) => [item.id, item]));
  for (const key of formData.keys()) {
    const match = key.match(/^custom(?:TextFr|TextEn|Image)-(.+?)(?:Source|Processed)?$/);
    if (!match || customItemById.has(match[1])) continue;
    const type = key.startsWith("customImage-") ? "image" : "text";
    const item = { id: match[1], type, confirmed: true } as AdviceCustomItem;
    customItems.push(item);
    customItemById.set(item.id, item);
  }
  for (const item of customItems) {
    if (item.type !== "image") continue;
    const uploadedUrl = await uploadImage(`customImage-${item.id}`, 3, "shared");
    if (uploadedUrl) item.imageUrl = uploadedUrl;
    item.imageAltFr = String(formData.get(`customImageAltFr-${item.id}`) ?? item.imageAltFr ?? "");
    item.imageAltEn = String(formData.get(`customImageAltEn-${item.id}`) ?? item.imageAltEn ?? "");
  }
  const customText = (suffix: "Fr" | "En") => Object.fromEntries(customItems.filter((item) => item.type === "text").map((item) => [item.id, String(formData.get(`customText${suffix}-${item.id}`) ?? (suffix === "Fr" ? item.textFr : item.textEn) ?? "")]));
  const customItemsForSave = customItems.map((item) => {
    const { confirmed: _confirmed, ...persistedItem } = item;
    return item.type === "text" ? { ...persistedItem, textFr: String(formData.get(`customTextFr-${item.id}`) ?? item.textFr ?? ""), textEn: String(formData.get(`customTextEn-${item.id}`) ?? item.textEn ?? "") } : persistedItem;
  });
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
        layoutConfig: { ...layoutConfig, shortIntroFr: parsed.data.shortIntroFr ?? layoutConfig.shortIntroFr ?? "", shortIntroEn: parsed.data.shortIntroEn ?? layoutConfig.shortIntroEn ?? "", customItems: customItemsForSave, customText: customText(suffix) },
      } },
    ],
  });
  const { error } = await client.from("advice_translations").upsert([
    translation("fr-FR", "Fr", resolvedBodyFr, resolvedBody2Fr),
    translation("en-GB", "En", resolvedBodyEn, resolvedBody2En),
  ], { onConflict: "article_id,locale" });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Conseil enregistré." };
}

export const meta: MetaFunction = () => [{ title: "Blog | Administration Zen Coffee Lab" }];

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

function AdviceLayoutOrganizer({ initialLayout }: { initialLayout: AdviceLayout }) {
  const [layoutState, setLayoutState] = useState<AdviceLayout>(() => parseAdviceLayout(initialLayout));
  const [customItems, setCustomItems] = useState<AdviceCustomItem[]>(() => parseAdviceLayoutWithCustomItems(initialLayout).customItems);
  useEffect(() => {
    setLayoutState((current) => {
      const missing = customItems.filter((item) => item.confirmed !== false && !current.items.some((layoutItem) => layoutItem.customId === item.id)).map((item) => ({ id: `layout-${item.id}`, compartment: item.type === "text" ? "text" as const : "image" as const, customId: item.id, label: item.type === "text" ? "Espace texte" : "Espace image" }));
      return missing.length ? { ...current, items: [...current.items, ...missing] } : current;
    });
  }, [customItems]);
  const [dragged, setDragged] = useState<number | null>(null);
  const removalDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ kind: "layout"; item: AdviceLayoutItem; label: string } | { kind: "custom"; id: string; label: string } | null>(null);
  useEffect(() => {
    if (pendingRemoval && !removalDialogRef.current?.open) removalDialogRef.current?.showModal();
  }, [pendingRemoval]);
  const moveElement = (targetIndex: number) => {
    if (dragged === null || dragged === targetIndex) return;
    setLayoutState((current) => {
      const items = [...current.items];
      const [moved] = items.splice(dragged, 1);
      items.splice(targetIndex, 0, moved);
      return { ...current, items };
    });
    setDragged(null);
  };
  const removeLayoutItem = (item: AdviceLayoutItem) => {
    setLayoutState((current) => ({ ...current, items: current.items.filter((currentItem) => currentItem.id !== item.id && currentItem.customId !== item.customId) }));
    if (item.customId) setCustomItems((items) => items.filter((customItem) => customItem.id !== item.customId));
  };
  const requestLayoutRemoval = (item: AdviceLayoutItem) => setPendingRemoval({ kind: "layout", item, label: item.label ?? labels[item.compartment] });
  const labels: Record<AdviceCompartment, string> = { title: "Titre", text: "Espace texte", image: "Espace image", textImage: "Bloc texte + image", imageText: "Bloc image + texte" };
  const card = (item: AdviceLayoutItem, index: number) => <div
    className="admin-advice-layout__item"
    draggable
    onDragStart={() => setDragged(index)}
    onDragEnd={() => setDragged(null)}
    onDragOver={(event) => event.preventDefault()}
    onDrop={() => moveElement(index)}
  >
    <span className="admin-advice-layout__handle" aria-hidden="true">⋮⋮</span>
    <input className="admin-advice-layout__label" aria-label={`Nom de ${labels[item.compartment]}`} value={item.label ?? labels[item.compartment]} onChange={(event) => setLayoutState((current) => ({ ...current, items: current.items.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, label: event.currentTarget.value } : currentItem) }))} onClick={(event) => event.stopPropagation()} />
    <button type="button" className="ui-button ui-button--ghost admin-advice-layout__remove" onClick={(event) => { event.stopPropagation(); requestLayoutRemoval(item); }}>Supprimer</button>
  </div>;
  const addCustomItem = (type: "text" | "image") => {
    const item = { id: `custom-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, confirmed: false } as AdviceCustomItem;
    setCustomItems((items) => [...items, item]);
  };
  const confirmCustomItem = (id: string, type: "text" | "image") => {
    setCustomItems((items) => items.map((item) => item.id === id ? { ...item, confirmed: true } : item));
    setLayoutState((current) => current.items.some((item) => item.customId === id) ? current : { ...current, items: [...current.items, { id: `layout-${id}`, compartment: type, customId: id, label: type === "text" ? "Espace texte" : "Espace image" }] });
  };
  const removeCustomItem = (id: string) => {
    const item = customItems.find((customItem) => customItem.id === id);
    if (!item) return;
    setCustomItems((items) => items.filter((customItem) => customItem.id !== id));
    setLayoutState((current) => ({ ...current, items: current.items.filter((layoutItem) => layoutItem.customId !== id) }));
  };
  const requestCustomRemoval = (id: string) => {
    const item = customItems.find((customItem) => customItem.id === id);
    if (item) setPendingRemoval({ kind: "custom", id, label: item.type === "text" ? "Espace texte" : "Espace image" });
  };
  const confirmPendingRemoval = () => {
    if (!pendingRemoval) return;
    if (pendingRemoval.kind === "layout") removeLayoutItem(pendingRemoval.item);
    else removeCustomItem(pendingRemoval.id);
    removalDialogRef.current?.close();
  };
  const fullLayout = { ...layoutState, customItems: customItems.filter((item) => item.confirmed !== false) };
  return <section className="admin-advice-layout-organizer" aria-labelledby="advice-layout-title">
    <div><p className="eyebrow">Mise en page</p><h2 id="advice-layout-title">Éléments déplaçables</h2><p className="admin-advice-editor__hint">Faites glisser un bloc texte ou une image vers un autre emplacement. L’ordre est commun aux deux langues.</p></div>
    <div className="admin-advice-layout__short-intro"><strong>Courte introduction sous le titre</strong><div className="form-grid"><label>Français<textarea name="shortIntroFr" defaultValue={initialLayout.shortIntroFr ?? ""} maxLength={280} rows={3} placeholder="Une courte introduction visible sous le titre" /></label><label>English<textarea name="shortIntroEn" defaultValue={initialLayout.shortIntroEn ?? ""} maxLength={280} rows={3} placeholder="A short introduction shown below the title" /></label></div></div>
    <input type="hidden" name="layoutConfig" value={JSON.stringify(fullLayout)} />
    <div className="admin-advice-layout__slots">
      <strong>Ordre de publication</strong>
      <div className="admin-advice-layout__dropzone" onDragOver={(event) => event.preventDefault()}>
        {layoutState.items.map((item, index) => card(item, index))}
      </div>
      {/* Legacy paired slots are kept in the saved layout for older readers. */}
      {/*
      {layoutState.slots.map((slot, index) => <div className="admin-advice-layout__slot" key={index}>
        <strong>Emplacement {index + 1} · {index === 0 ? "texte à gauche · image à droite" : "image à gauche · texte à droite"}</strong>
        <div className="admin-advice-layout__dropzone" onDragOver={(event) => event.preventDefault()}>
          {card(index, "text", slot.text)}
          {card(index, "image", slot.image)}
        </div>
      </div>)}
      */}
    </div>
    <div className="admin-advice-layout__custom">
      <div className="admin-advice-layout__custom-heading"><strong>Emplacements supplémentaires</strong><span>Ajoutez des éléments indépendants à la suite des deux blocs.</span><div><button type="button" className="ui-button ui-button--outline" onClick={() => addCustomItem("text")}>+ Ajouter un emplacement texte</button><button type="button" className="ui-button ui-button--outline" onClick={() => addCustomItem("image")}>+ Ajouter une image avec importation</button></div></div>
      {customItems.map((item, index) => <div className={`admin-advice-layout__custom-item${item.confirmed === false ? " is-pending" : ""}`} key={item.id}>
        <div className="admin-advice-layout__custom-title"><strong>{index + 1}. {item.type === "text" ? "Emplacement texte" : "Emplacement image"}</strong><div className="admin-advice-layout__custom-actions">{item.confirmed === false ? <button type="button" className="ui-button ui-button--default admin-advice-layout__add" onClick={() => confirmCustomItem(item.id, item.type)}>Ajouter</button> : <span className="admin-advice-layout__confirmed">Emplacement ajouté</span>}<button type="button" className="ui-button ui-button--ghost" onClick={() => requestCustomRemoval(item.id)}>Supprimer</button></div></div>
        {item.type === "text" ? <div className="form-grid"><label>Texte français<textarea name={`customTextFr-${item.id}`} defaultValue={item.textFr ?? ""} /></label><label>Texte anglais<textarea name={`customTextEn-${item.id}`} defaultValue={item.textEn ?? ""} /></label></div> : <div className="form-grid"><AdminImageEditorInput name={`customImage-${item.id}`} label={item.imageUrl ? "Remplacer l’image" : "Importer l’image"} currentPreviewUrl={item.imageUrl} defaultAspect="75:83" lockAspect defaultOutputWidth={1500} /><label>Alt. FR<input name={`customImageAltFr-${item.id}`} defaultValue={item.imageAltFr ?? ""} /></label><label>Alt. EN<input name={`customImageAltEn-${item.id}`} defaultValue={item.imageAltEn ?? ""} /></label></div>}
      </div>)}
    </div>
    <dialog ref={removalDialogRef} className="admin-feedback-modal admin-advice-delete-modal" aria-labelledby="advice-delete-title" onClose={() => setPendingRemoval(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="admin-feedback-modal__panel">
        <span className="admin-feedback-modal__icon"><Trash2 aria-hidden="true" /></span>
        <div><p className="eyebrow">Validation</p><h2 id="advice-delete-title">Confirmer la suppression</h2><p>Supprimer « {pendingRemoval?.label ?? "cet élément"} » de la mise en page ?</p></div>
        <div className="admin-advice-delete-modal__actions"><button type="button" className="ui-button ui-button--danger" onClick={confirmPendingRemoval}>Supprimer</button><button type="button" className="ui-button ui-button--ghost" onClick={() => removalDialogRef.current?.close()}>Annuler</button></div>
        <form className="admin-feedback-modal__close" method="dialog"><button type="submit" aria-label="Fermer la confirmation"><X aria-hidden="true" /></button></form>
      </div>
    </dialog>
  </section>;
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
  const layoutOrganizer = <AdviceLayoutOrganizer initialLayout={parseAdviceLayoutWithCustomItems(frLayout?.layoutConfig)} />;
  return <Form method="post" encType="multipart/form-data" className="admin-advice-editor"><input type="hidden" name="intent" value="save_advice" /><input type="hidden" name="id" value={article?.id ?? ""} /><section className="admin-advice-editor__top"><div className="admin-advice-editor__settings"><p className="eyebrow">Publication</p><div className="form-grid"><label>Slug<input name="slug" defaultValue={article?.slug ?? ""} required /></label><label>Statut<select name="status" defaultValue={article?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label><label>Date de publication<input name="publishedAt" type="datetime-local" defaultValue={(article?.published_at ?? new Date().toISOString()).slice(0, 16)} required /></label></div></div><section className="admin-advice-editor__introduction"><h2>Titre et introduction</h2><LanguageTabs label="Langue du titre et de l’introduction" french={intro("Fr", fr)} english={intro("En", en)} /></section></section>{layoutOrganizer}{editorial(1, false)}{editorial(2, true)}<section className="admin-advice-editor__seo"><h3>Référencement</h3><LanguageTabs label="Langue du référencement" french={<fieldset className="admin-editorial-block__language"><legend>Français</legend><div className="field"><label>Titre SEO<input name="seoTitleFr" defaultValue={fr?.seo_title ?? ""} required /></label></div><div className="field"><label>Description SEO<textarea name="seoDescriptionFr" defaultValue={fr?.seo_description ?? ""} required /></label></div></fieldset>} english={<fieldset className="admin-editorial-block__language"><legend>English</legend><div className="field"><label>SEO title<input name="seoTitleEn" defaultValue={en?.seo_title ?? ""} required /></label></div><div className="field"><label>SEO description<textarea name="seoDescriptionEn" defaultValue={en?.seo_description ?? ""} required /></label></div></fieldset>} /></section><div className="admin-editor__actions"><button className="ui-button ui-button--default" disabled={demo}>{actionLabel ?? <><Plus /> Nouveau blog</>}</button>{article ? <Link className="ui-button ui-button--ghost" to={`/conseils/${article.slug}`}>Lire l’article</Link> : null}</div></Form>;
}

export default function AdminAdvice() {
  const { demo, articles } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const query = new URLSearchParams(useLocation().search);
  const creating = query.get("new") === "1";
  const selected = query.get("article");
  return <AdminShell active="advice"><header className="admin-heading"><div><p className="eyebrow">Mini-CMS</p><h1>Blog</h1><p className="admin-heading__description">Composez chaque publication selon sa mise en page : introduction puis sections alternées texte et image.</p></div>{creating ? null : <Link className="ui-button ui-button--default" to="/admin/conseils?new=1"><Plus /> Nouveau blog</Link>}</header>{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}<div className="admin-content-list">{articles.map((article) => { const title = article.advice_translations.find((item) => item.locale === "fr-FR")?.title ?? article.slug; return <details className="ui-card admin-content-page" key={article.id} open={selected === article.id}><summary><strong>{title}</strong><span className="ui-badge">{article.status}</span></summary><ArticleForm article={article} demo={demo} /><Form method="post" className="admin-delete-form"><input type="hidden" name="intent" value="delete_advice" /><input type="hidden" name="id" value={article.id} /><button className="ui-button ui-button--danger ui-button--sm" disabled={demo}><Trash2 /> Supprimer</button></Form></details>; })}</div>{creating ? <section className="ui-card admin-editor"><ArticleForm demo={demo} /></section> : null}</AdminShell>;
}
