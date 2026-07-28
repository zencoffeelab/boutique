import { Plus, Save, Trash2, Upload } from "lucide-react";
import { z } from "zod";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminShell } from "~/components/admin-shell";
import { formatMoney } from "~/domain/money";
import { buildVariantOffers } from "~/domain/professional-quote";
import type { ProductEditorialBlock, ProductVariant } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { getAdminProducts } from "~/lib/catalog.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const productSchema = z.object({
  intent: z.literal("save_product"),
  productId: z.string().min(1),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "published", "archived"]),
  altitudeMeters: z.coerce.number().int().min(0).max(10_000),
  featured: z.string().optional().transform(Boolean),
  professionalEnabled: z.string().optional().transform(Boolean),
  professionalStockKg: z.coerce.number().min(0).max(1_000_000),
  nameFr: z.string().trim().min(2),
  nameEn: z.string().trim().min(2),
  shortFr: z.string().trim().min(10),
  shortEn: z.string().trim().min(10),
  bodyFr: z.string().trim().min(10),
  bodyEn: z.string().trim().min(10),
  producerFr: z.string().trim().min(1),
  producerEn: z.string().trim().min(1),
  regionFr: z.string().trim().min(1),
  regionEn: z.string().trim().min(1),
  varietyFr: z.string().trim().min(1),
  varietyEn: z.string().trim().min(1),
  processFr: z.string().trim().min(1),
  processEn: z.string().trim().min(1),
  notesFr: z.string(),
  notesEn: z.string(),
  seoTitleFr: z.string().trim().min(2),
  seoTitleEn: z.string().trim().min(2),
  seoDescriptionFr: z.string().trim().min(10),
  seoDescriptionEn: z.string().trim().min(10),
});
const variantSchema = z.object({
  intent: z.literal("create_variant"),
  productId: z.uuid(),
  sku: z.string().trim().min(2).max(80),
  label: z.string().trim().min(1).max(80),
  weightGrams: z.coerce.number().int().min(1).max(100_000),
  internalCostCents: z.coerce.number().int().min(0),
  stockOnHand: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0),
  hsCode: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/),
  customsOriginCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  retailPriceCents: z.coerce.number().int().min(0),
  professional: z.string().optional().transform(Boolean),
  proPriceCents: z.coerce.number().int().min(0).optional(),
  proMinimumQuantity: z.coerce.number().int().min(1).optional(),
});
const deleteVariantSchema = z.object({
  intent: z.literal("delete_variant"),
  productId: z.uuid(),
  variantId: z.uuid(),
});
const editorialBlockSchema = z.object({
  intent: z.literal("save_editorial_block"),
  productId: z.uuid(),
  position: z.coerce.number().int().min(1).max(2),
  titleFr: z.string().trim().min(2).max(180),
  titleEn: z.string().trim().min(2).max(180),
  bodyFr: z.string().trim().min(10).max(8_000),
  bodyEn: z.string().trim().min(10).max(8_000),
  altFr: z.string().trim().min(2).max(240),
  altEn: z.string().trim().min(2).max(240),
});

const editorialImageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const emptyTranslation = (locale: "fr-FR" | "en-GB") => ({
  locale,
  name: "",
  shortDescription: "",
  body: "",
  producer: "",
  region: "",
  variety: "",
  process: "",
  tastingNotes: [],
  seoTitle: "",
  seoDescription: "",
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (params.id === "nouveau")
    return {
      demo: admin.demo,
      isNew: true,
      product: {
        id: "nouveau",
        slug: "",
        status: "draft" as const,
        altitudeMeters: 0,
        featured: false,
        professionalEnabled: false,
        professionalStockKg: 0,
        professionalStockReservedKg: 0,
        translations: {
          "fr-FR": emptyTranslation("fr-FR"),
          "en-GB": emptyTranslation("en-GB"),
        },
        media: [],
        editorialBlocks: [],
        variants: [],
      },
    };
  const product = (await getAdminProducts()).find(
    (item) => item.id === params.id,
  );
  if (!product) throw new Response("Produit introuvable.", { status: 404 });
  return { demo: admin.demo, isNew: false, product };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo)
    return {
      ok: false,
      message: "L’éditeur est en lecture seule dans la démonstration locale.",
    };
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base de données indisponible." };
  if (intent === "upload_media") {
    const productId = String(form.get("productId"));
    const file = form.get("file");
    const altFr = String(form.get("altFr") ?? "").trim();
    const altEn = String(form.get("altEn") ?? "").trim();
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 8_000_000 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !altFr ||
      !altEn
    )
      return {
        ok: false,
        message:
          "Image JPEG/PNG/WebP (8 Mo maximum) et textes alternatifs requis.",
      };
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage
      .from("product-media")
      .upload(path, await file.arrayBuffer(), { contentType: file.type });
    if (error) return { ok: false, message: error.message };
    const url = client.storage.from("product-media").getPublicUrl(path)
      .data.publicUrl;
    const { count } = await client
      .from("product_media")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    await client.from("product_media").insert({
      product_id: productId,
      storage_path: path,
      public_url: url,
      alt_fr: altFr,
      alt_en: altEn,
      width: 1600,
      height: 1600,
      position: count ?? 0,
    });
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "product.media_added",
      entity_type: "product",
      entity_id: productId,
      after_data: { path, altFr, altEn },
    });
    return { ok: true, message: "Image ajoutée." };
  }
  if (intent === "save_editorial_block") {
    const parsed = editorialBlockSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return {
        ok: false,
        message:
          "Le titre, le texte et l’alternative de l’image sont requis dans les deux langues.",
        errors: parsed.error.flatten().fieldErrors,
      };

    const { data: existing, error: readError } = await client
      .from("product_editorial_blocks")
      .select("*")
      .eq("product_id", parsed.data.productId)
      .eq("position", parsed.data.position)
      .maybeSingle();
    if (readError) return { ok: false, message: readError.message };

    const file = form.get("file");
    const hasNewImage = file instanceof File && file.size > 0;
    if (!hasNewImage && !existing)
      return { ok: false, message: "Ajoutez une image pour publier ce bloc." };
    if (
      hasNewImage &&
      (file.size > 8_000_000 || !editorialImageExtensions[file.type])
    ) {
      return {
        ok: false,
        message:
          "L’image doit être au format JPEG, PNG ou WebP et peser au maximum 8 Mo.",
      };
    }

    let storagePath = existing?.storage_path as string | undefined;
    let publicUrl = existing?.public_url as string | undefined;
    let uploadedPath: string | null = null;
    if (hasNewImage) {
      uploadedPath = `editorial/${parsed.data.productId}/${parsed.data.position}-${crypto.randomUUID()}.${editorialImageExtensions[file.type]}`;
      const { error: uploadError } = await client.storage
        .from("product-media")
        .upload(uploadedPath, await file.arrayBuffer(), {
          contentType: file.type,
        });
      if (uploadError) return { ok: false, message: uploadError.message };
      storagePath = uploadedPath;
      publicUrl = client.storage
        .from("product-media")
        .getPublicUrl(uploadedPath).data.publicUrl;
    }

    const mutation = {
      product_id: parsed.data.productId,
      position: parsed.data.position,
      storage_path: storagePath,
      public_url: publicUrl,
      alt_fr: parsed.data.altFr,
      alt_en: parsed.data.altEn,
      title_fr: parsed.data.titleFr,
      title_en: parsed.data.titleEn,
      body_fr: parsed.data.bodyFr,
      body_en: parsed.data.bodyEn,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await client
      .from("product_editorial_blocks")
      .upsert(mutation, { onConflict: "product_id,position" });
    if (saveError) {
      if (uploadedPath)
        await client.storage.from("product-media").remove([uploadedPath]);
      return { ok: false, message: saveError.message };
    }
    if (
      uploadedPath &&
      existing?.storage_path &&
      existing.storage_path !== uploadedPath
    ) {
      await client.storage
        .from("product-media")
        .remove([existing.storage_path]);
    }
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "product.editorial_block_updated",
      entity_type: "product",
      entity_id: parsed.data.productId,
      before_data: existing,
      after_data: mutation,
    });
    return {
      ok: true,
      message: `Bloc éditorial ${parsed.data.position} enregistré.`,
    };
  }
  if (intent === "create_variant") {
    const parsed = variantSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return {
        ok: false,
        message: "Données de variante invalides.",
        errors: parsed.error.flatten().fieldErrors,
      };
    const { data: parentProduct, error: parentProductError } = await client
      .from("products")
      .select("professional_enabled")
      .eq("id", parsed.data.productId)
      .single();
    if (parentProductError || !parentProduct)
      return {
        ok: false,
        message: parentProductError?.message ?? "Produit introuvable.",
      };
    const { data: variant, error } = await client
      .from("product_variants")
      .insert({
        product_id: parsed.data.productId,
        sku: parsed.data.sku,
        label: parsed.data.label,
        weight_grams: parsed.data.weightGrams,
        internal_cost_cents: parsed.data.internalCostCents,
        stock_on_hand: parsed.data.stockOnHand,
        low_stock_threshold: parsed.data.lowStockThreshold,
        hs_code: parsed.data.hsCode,
        customs_origin_country: parsed.data.customsOriginCountry,
      })
      .select("id")
      .single();
    if (error || !variant)
      return { ok: false, message: error?.message ?? "Variante non créée." };
    const offers = buildVariantOffers({
      variantId: variant.id,
      retailPriceCents: parsed.data.retailPriceCents,
      productProfessionalEnabled: parentProduct.professional_enabled,
      professionalRequested: parsed.data.professional,
      professionalPriceCents: parsed.data.proPriceCents,
      professionalMinimumQuantity: parsed.data.proMinimumQuantity,
    });
    const { error: offerError } = await client
      .from("variant_offers")
      .insert(offers);
    if (offerError) {
      await client.from("product_variants").delete().eq("id", variant.id);
      return { ok: false, message: offerError.message };
    }
    await client.from("stock_movements").insert({
      variant_id: variant.id,
      quantity_delta: parsed.data.stockOnHand,
      reason: "Initial stock",
      actor_id: admin.id,
    });
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "variant.created",
      entity_type: "product_variant",
      entity_id: variant.id,
      after_data: parsed.data,
    });
    return { ok: true, message: "Variante ajoutée." };
  }
  if (intent === "delete_variant") {
    const parsed = deleteVariantSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: "Variante invalide." };
    const { data: variant, error: variantError } = await client
      .from("product_variants")
      .select("id,product_id,sku,label,stock_reserved")
      .eq("id", parsed.data.variantId)
      .eq("product_id", parsed.data.productId)
      .maybeSingle();
    if (variantError) return { ok: false, message: variantError.message };
    if (!variant)
      return { ok: false, message: "Variante introuvable pour ce produit." };
    if (variant.stock_reserved > 0)
      return {
        ok: false,
        message:
          "Cette variante possède du stock réservé. Attendez la finalisation ou l’expiration des commandes en cours avant de la supprimer.",
      };
    const { data: offers, error: offerReadError } = await client
      .from("variant_offers")
      .select("id,audience,price_cents,minimum_quantity,active")
      .eq("variant_id", variant.id);
    if (offerReadError) return { ok: false, message: offerReadError.message };
    if (!(offers ?? []).some((offer) => offer.active))
      return {
        ok: false,
        message: "Cette variante est déjà supprimée de la vente.",
      };
    const { error: deleteError } = await client
      .from("variant_offers")
      .update({ active: false })
      .eq("variant_id", variant.id)
      .eq("active", true);
    if (deleteError) return { ok: false, message: deleteError.message };
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "variant.archived",
      entity_type: "product_variant",
      entity_id: variant.id,
      before_data: { variant, offers },
      after_data: { active: false },
    });
    return { ok: true, message: "Variante supprimée." };
  }
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      message: "Les deux versions linguistiques doivent être complètes.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const creating = parsed.data.productId === "nouveau";
  const before = creating
    ? { data: null }
    : await client
        .from("products")
        .select("*,product_translations(*)")
        .eq("id", parsed.data.productId)
        .single();
  const productMutation = {
    slug: parsed.data.slug,
    status: creating ? "draft" : parsed.data.status,
    altitude_meters: parsed.data.altitudeMeters,
    featured: parsed.data.featured,
    professional_enabled: parsed.data.professionalEnabled,
    professional_stock_kg: parsed.data.professionalStockKg + Number(before.data?.professional_stock_reserved_kg ?? 0),
    updated_at: new Date().toISOString(),
  };
  const mutation = creating
    ? await client
        .from("products")
        .insert(productMutation)
        .select("id")
        .single()
    : await client
        .from("products")
        .update(productMutation)
        .eq("id", parsed.data.productId)
        .select("id")
        .single();
  if (mutation.error || !mutation.data)
    return {
      ok: false,
      message: mutation.error?.message ?? "Produit non enregistré.",
    };
  const savedProductId = mutation.data.id;
  const translations = [
    {
      locale: "fr-FR",
      name: parsed.data.nameFr,
      short_description: parsed.data.shortFr,
      body: parsed.data.bodyFr,
      producer: parsed.data.producerFr,
      region: parsed.data.regionFr,
      variety: parsed.data.varietyFr,
      process: parsed.data.processFr,
      tasting_notes: parsed.data.notesFr
        .split(",")
        .map((note) => note.trim())
        .filter(Boolean),
      seo_title: parsed.data.seoTitleFr,
      seo_description: parsed.data.seoDescriptionFr,
    },
    {
      locale: "en-GB",
      name: parsed.data.nameEn,
      short_description: parsed.data.shortEn,
      body: parsed.data.bodyEn,
      producer: parsed.data.producerEn,
      region: parsed.data.regionEn,
      variety: parsed.data.varietyEn,
      process: parsed.data.processEn,
      tasting_notes: parsed.data.notesEn
        .split(",")
        .map((note) => note.trim())
        .filter(Boolean),
      seo_title: parsed.data.seoTitleEn,
      seo_description: parsed.data.seoDescriptionEn,
    },
  ].map((translation) => ({ ...translation, product_id: savedProductId }));
  const { error: translationError } = await client
    .from("product_translations")
    .upsert(translations, { onConflict: "product_id,locale" });
  if (translationError) {
    if (creating)
      await client.from("products").delete().eq("id", savedProductId);
    return { ok: false, message: translationError.message };
  }
  await client.from("audit_log").insert({
    actor_id: admin.id,
    action: creating ? "product.created" : "product.updated",
    entity_type: "product",
    entity_id: savedProductId,
    before_data: before.data,
    after_data: parsed.data,
  });
  if (creating)
    return redirect(`/admin/produits/${savedProductId}?confirmation=product-created`);
  return { ok: true, message: "Produit enregistré." };
}

export const meta: MetaFunction = () => [
  { title: "Éditer un café | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

function LanguageTabs({
  label,
  french,
  english,
}: {
  label: string;
  french: ReactNode;
  english: ReactNode;
}) {
  const [activeLanguage, setActiveLanguage] = useState<"fr" | "en">("fr");
  const id = useId();
  const tabs = [
    { language: "fr" as const, label: "Français", content: french },
    { language: "en" as const, label: "English", content: english },
  ];
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveLanguage(tabs[nextIndex].language);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons?.[nextIndex]?.focus();
  };

  return <div className="admin-language-tabs">
    <div className="admin-language-tabs__list" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button
        key={tab.language}
        type="button"
        role="tab"
        id={`${id}-${tab.language}-tab`}
        aria-controls={`${id}-${tab.language}-panel`}
        aria-selected={activeLanguage === tab.language}
        tabIndex={activeLanguage === tab.language ? 0 : -1}
        onClick={() => setActiveLanguage(tab.language)}
        onKeyDown={(event) => selectFromKeyboard(event, index)}
      >{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div
      key={tab.language}
      role="tabpanel"
      id={`${id}-${tab.language}-panel`}
      aria-labelledby={`${id}-${tab.language}-tab`}
      hidden={activeLanguage !== tab.language}
      onInvalidCapture={() => setActiveLanguage(tab.language)}
    >{tab.content}</div>)}
  </div>;
}

function TranslationFields({
  language,
  translation,
}: {
  language: "Français" | "English";
  translation: any;
}) {
  const suffix = language === "Français" ? "Fr" : "En";
  return (
    <fieldset className="admin-editor__language">
      <legend>{language}</legend>
      <div className="form-grid">
        <div className="field field--wide">
          <label>
            Nom
            <input
              name={`name${suffix}`}
              defaultValue={translation.name}
              required
            />
          </label>
        </div>
        <div className="field field--wide">
          <label>
            Description courte
            <textarea
              name={`short${suffix}`}
              defaultValue={translation.shortDescription}
              required
            />
          </label>
        </div>
        <div className="field field--wide">
          <label>
            Contenu produit
            <textarea
              name={`body${suffix}`}
              defaultValue={translation.body}
              required
            />
          </label>
        </div>
        <div className="field">
          <label>
            Producteur
            <input
              name={`producer${suffix}`}
              defaultValue={translation.producer}
              required
            />
          </label>
        </div>
        <div className="field">
          <label>
            Région
            <input
              name={`region${suffix}`}
              defaultValue={translation.region}
              required
            />
          </label>
        </div>
        <div className="field">
          <label>
            Variété
            <input
              name={`variety${suffix}`}
              defaultValue={translation.variety}
              required
            />
          </label>
        </div>
        <div className="field">
          <label>
            Traitement
            <input
              name={`process${suffix}`}
              defaultValue={translation.process}
              required
            />
          </label>
        </div>
        <div className="field field--wide">
          <label>
            Notes, séparées par des virgules
            <input
              name={`notes${suffix}`}
              defaultValue={translation.tastingNotes.join(", ")}
            />
          </label>
        </div>
        <div className="field field--wide">
          <label>
            Titre SEO
            <input
              name={`seoTitle${suffix}`}
              defaultValue={translation.seoTitle}
              required
            />
          </label>
        </div>
        <div className="field field--wide">
          <label>
            Description SEO
            <textarea
              name={`seoDescription${suffix}`}
              defaultValue={translation.seoDescription}
              required
            />
          </label>
        </div>
      </div>
    </fieldset>
  );
}

function EditorialBlockForm({
  productId,
  position,
  block,
  demo,
}: {
  productId: string;
  position: 1 | 2;
  block?: ProductEditorialBlock;
  demo: boolean;
}) {
  const imageFirst = position === 2;
  return (
    <Form
      method="post"
      encType="multipart/form-data"
      className="admin-editorial-block"
    >
      <input type="hidden" name="intent" value="save_editorial_block" />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="position" value={position} />
      <header className="admin-editorial-block__heading">
        <div>
          <p className="eyebrow">Bloc {position}</p>
          <h3>
            {imageFirst
              ? "Image à gauche · texte à droite"
              : "Texte à gauche · image à droite"}
          </h3>
        </div>
        {block ? (
          <span className="ui-badge">Configuré</span>
        ) : (
          <span className="ui-badge admin-editorial-block__pending">
            À compléter
          </span>
        )}
      </header>
      <div className="admin-editorial-block__layout">
        <div className="admin-editorial-block__image">
          {block ? (
            <img src={block.imageUrl} alt={block.imageAlt["fr-FR"]} />
          ) : (
            <div className="admin-editorial-block__placeholder">
              Aucune image
            </div>
          )}
          <div className="field">
            <label>
              {block ? "Remplacer l’image" : "Image"}
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={!block}
              />
            </label>
            <small>JPEG, PNG ou WebP · 8 Mo maximum</small>
          </div>
        </div>
        <div className="admin-editorial-block__content">
          <LanguageTabs
            label={`Langue du bloc éditorial ${position}`}
            french={<fieldset className="admin-editorial-block__language">
            <legend>Français</legend>
            <div className="field">
              <label>
                Titre
                <input
                  name="titleFr"
                  defaultValue={block?.title["fr-FR"] ?? ""}
                  maxLength={180}
                  required
                />
              </label>
            </div>
            <div className="field">
              <label>
                Texte
                <textarea
                  name="bodyFr"
                  defaultValue={block?.body["fr-FR"] ?? ""}
                  maxLength={8_000}
                  required
                />
              </label>
            </div>
            <div className="field">
              <label>
                Texte alternatif de l’image
                <input
                  name="altFr"
                  defaultValue={block?.imageAlt["fr-FR"] ?? ""}
                  maxLength={240}
                  required
                />
              </label>
            </div>
          </fieldset>}
            english={<fieldset className="admin-editorial-block__language">
            <legend>English</legend>
            <div className="field">
              <label>
                Title
                <input
                  name="titleEn"
                  defaultValue={block?.title["en-GB"] ?? ""}
                  maxLength={180}
                  required
                />
              </label>
            </div>
            <div className="field">
              <label>
                Text
                <textarea
                  name="bodyEn"
                  defaultValue={block?.body["en-GB"] ?? ""}
                  maxLength={8_000}
                  required
                />
              </label>
            </div>
            <div className="field">
              <label>
                Image alternative text
                <input
                  name="altEn"
                  defaultValue={block?.imageAlt["en-GB"] ?? ""}
                  maxLength={240}
                  required
                />
              </label>
            </div>
          </fieldset>}
          />
        </div>
      </div>
      <button
        className="ui-button ui-button--outline"
        type="submit"
        disabled={demo}
      >
        <Save aria-hidden="true" /> Enregistrer le bloc {position}
      </button>
    </Form>
  );
}

function EditorialBlocksSection({
  productId,
  blocks,
  demo,
}: {
  productId: string;
  blocks: readonly ProductEditorialBlock[];
  demo: boolean;
}) {
  return <section className="ui-card admin-editor admin-editorial-section">
    <h2>Blocs éditoriaux</h2>
    <p>
      Ces deux encarts apparaissent sous les informations d’origine sur la fiche
      produit. Le second inverse automatiquement la position de l’image et du texte.
    </p>
    <div className="admin-editorial-blocks">
      <EditorialBlockForm
        productId={productId}
        position={1}
        block={blocks.find((block) => block.position === 1)}
        demo={demo}
      />
      <EditorialBlockForm
        productId={productId}
        position={2}
        block={blocks.find((block) => block.position === 2)}
        demo={demo}
      />
    </div>
  </section>;
}

function VariantList({
  productId,
  variants,
  demo,
}: {
  productId: string;
  variants: readonly ProductVariant[];
  demo: boolean;
}) {
  if (variants.length === 0)
    return (
      <p className="admin-notice">Aucune variante active pour ce produit.</p>
    );
  return (
    <div
      className="ui-table-wrap"
      role="region"
      aria-label="Variantes du produit"
      tabIndex={0}
    >
      <table className="ui-table">
        <thead>
          <tr>
            <th>Variante</th>
            <th>SKU</th>
            <th>Poids</th>
            <th>Stock</th>
            <th>Prix public</th>
            <th>Prix pro</th>
            <th>Coût interne</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const retailOffer = variant.offers.find(
              (offer) => offer.audience === "retail" && offer.active,
            );
            const professionalOffer = variant.offers.find(
              (offer) => offer.audience === "professional" && offer.active,
            );
            return (
              <tr key={variant.id}>
                <td>
                  <strong>{variant.label}</strong>
                </td>
                <td>{variant.sku}</td>
                <td>{variant.weightGrams} g</td>
                <td>
                  {variant.stockOnHand - variant.stockReserved} disponible
                  {variant.stockReserved > 0
                    ? ` · ${variant.stockReserved} réservé`
                    : ""}
                </td>
                <td>
                  {retailOffer
                    ? formatMoney(retailOffer.price.amount, "fr-FR")
                    : "—"}
                </td>
                <td>
                  {professionalOffer
                    ? `${formatMoney(professionalOffer.price.amount, "fr-FR")} · min. ${professionalOffer.minimumQuantity}`
                    : "—"}
                </td>
                <td>{formatMoney(variant.internalCostCents, "fr-FR")}</td>
                <td>
                  <Form
                    method="post"
                    onSubmit={(event) => {
                      if (
                        !window.confirm(
                          `Supprimer la variante « ${variant.label} » de la vente ? L’historique sera conservé.`,
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="delete_variant" />
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="variantId" value={variant.id} />
                    <button
                      className="ui-button ui-button--danger ui-button--sm"
                      type="submit"
                      disabled={demo || variant.stockReserved > 0}
                      aria-label={`Supprimer la variante ${variant.label}`}
                      title={
                        variant.stockReserved > 0
                          ? "Suppression impossible tant que du stock est réservé"
                          : undefined
                      }
                    >
                      <Trash2 aria-hidden="true" /> Supprimer
                    </button>
                  </Form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function adminProductProgressMessage(intent: string) {
  const messages: Readonly<Record<string, string>> = {
    save_product: "Enregistrement du produit…",
    save_editorial_block: "Enregistrement du bloc éditorial…",
    create_variant: "Ajout de la variante…",
    delete_variant: "Suppression de la variante…",
    upload_media: "Import de l’image…",
  };
  return messages[intent] ?? "Modification en cours…";
}

function AdminProductProgress({ message }: { message: string }) {
  return <div className="admin-product-progress" role="status" aria-live="polite">
    <span>{message}</span>
    <div
      className="admin-product-progress__track"
      role="progressbar"
      aria-label={message}
      aria-valuetext="En cours"
    ><span /></div>
  </div>;
}

export default function AdminProduct() {
  const { demo, isNew, product } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const pendingIntent = String(navigation.formData?.get("intent") ?? "");
  const modifying = navigation.state !== "idle" && Boolean(navigation.formData);
  const savingProduct = modifying && pendingIntent === "save_product";
  return (
    <AdminShell active="products">
      {modifying ? <AdminProductProgress message={adminProductProgressMessage(pendingIntent)} /> : null}
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>{isNew ? "Nouveau café" : product.translations["fr-FR"].name}</h1>
        </div>
        <div className="admin-heading__actions">
          {!isNew ? (
            <Link
              className="ui-button ui-button--outline"
              to={`/boutique/${product.slug}`}
            >
              Voir la fiche
            </Link>
          ) : null}
          <button
            className="ui-button ui-button--default admin-product-save-fab"
            type="submit"
            form="product-editor-form"
            disabled={demo || modifying}
            aria-busy={savingProduct}
          >
            <Save aria-hidden="true" /> {savingProduct ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>
      {demo ? (
        <p className="admin-notice">Lecture seule en démonstration.</p>
      ) : null}
      {result?.message ? (
        <p className={result.ok ? "form-message" : "form-message form-error"}>
          {result.message}
        </p>
      ) : null}
      <Form
        id="product-editor-form"
        method="post"
        className="ui-card admin-editor"
      >
        <input type="hidden" name="intent" value="save_product" />
        <input type="hidden" name="productId" value={product.id} />
        <h2 className="admin-editor__title">Contenu</h2>
        <div className="form-grid">
          <div className="field">
            <label>
              Slug
              <input name="slug" defaultValue={product.slug} required />
            </label>
          </div>
          <div className="field">
            <label>
              Statut
              <select
                name="status"
                defaultValue={product.status}
                disabled={isNew}
              >
                <option value="draft">Brouillon</option>
                <option value="published">Publié</option>
                <option value="archived">Archivé</option>
              </select>
              {isNew ? (
                <input type="hidden" name="status" value="draft" />
              ) : null}
            </label>
          </div>
          <div className="field">
            <label>
              Altitude (m)
              <input
                name="altitudeMeters"
                type="number"
                min="0"
                defaultValue={product.altitudeMeters}
              />
            </label>
          </div>
          <label>
            <input
              name="featured"
              type="checkbox"
              defaultChecked={product.featured}
            />{" "}
            Mis en avant
          </label>
          <label>
            <input
              name="professionalEnabled"
              type="checkbox"
              defaultChecked={product.professionalEnabled}
            />{" "}
            Activer sur la boutique professionnelle
          </label>
          <div className="field">
            <label>
              Stock professionnel disponible (kg)
              <input
                name="professionalStockKg"
                type="number"
                min="0"
                step="0.01"
                defaultValue={Math.max(0, product.professionalStockKg - product.professionalStockReservedKg)}
              />
            </label>
            {product.professionalStockReservedKg > 0 ? (
              <small>{product.professionalStockReservedKg} kg supplémentaires sont actuellement réservés par des devis.</small>
            ) : null}
          </div>
        </div>
        <LanguageTabs
          label="Langue du contenu produit"
          french={<TranslationFields language="Français" translation={product.translations["fr-FR"]} />}
          english={<TranslationFields language="English" translation={product.translations["en-GB"]} />}
        />
      </Form>
      {!isNew ? (
        <>
          <EditorialBlocksSection
            productId={product.id}
            blocks={product.editorialBlocks}
            demo={demo}
          />
          <section className="ui-card admin-editor">
            <h2>Variantes existantes</h2>
            <p>
              La suppression retire la variante de la vente tout en conservant
              son historique de stock et de commandes.
            </p>
            <VariantList
              productId={product.id}
              variants={product.variants}
              demo={demo}
            />
          </section>
          <section className="ui-card admin-editor">
            <h2>Ajouter une variante</h2>
            <Form method="post" className="form-grid">
              <input type="hidden" name="intent" value="create_variant" />
              <input type="hidden" name="productId" value={product.id} />
              <div className="field">
                <label>
                  SKU
                  <input name="sku" required />
                </label>
              </div>
              <div className="field">
                <label>
                  Libellé
                  <input name="label" placeholder="200 g" required />
                </label>
              </div>
              <div className="field">
                <label>
                  Poids (g)
                  <input name="weightGrams" type="number" min="1" required />
                </label>
              </div>
              <div className="field">
                <label>
                  Stock initial
                  <input
                    name="stockOnHand"
                    type="number"
                    min="0"
                    defaultValue="0"
                    required
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Seuil bas
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    defaultValue="5"
                    required
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Coût interne (¢)
                  <input
                    name="internalCostCents"
                    type="number"
                    min="0"
                    required
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Prix public (¢)
                  <input
                    name="retailPriceCents"
                    type="number"
                    min="0"
                    required
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Code douanier
                  <input name="hsCode" defaultValue="090121" required />
                </label>
              </div>
              <div className="field">
                <label>
                  Origine douanière
                  <input
                    name="customsOriginCountry"
                    defaultValue="FR"
                    maxLength={2}
                    required
                  />
                </label>
              </div>
              <label>
                <input name="professional" type="checkbox" /> Offre
                professionnelle
              </label>
              <div className="field">
                <label>
                  Prix pro (¢)
                  <input
                    name="proPriceCents"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Minimum pro
                  <input
                    name="proMinimumQuantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                  />
                </label>
              </div>
              <button
                className="ui-button ui-button--outline"
                type="submit"
                disabled={demo}
              >
                <Plus aria-hidden="true" /> Ajouter la variante
              </button>
            </Form>
          </section>
          <section className="ui-card admin-editor">
            <h2>Galerie</h2>
            <div className="admin-media-grid">
              {product.media.map((media) => (
                <img key={media.id} src={media.url} alt={media.alt["fr-FR"]} />
              ))}
            </div>
            <Form
              method="post"
              encType="multipart/form-data"
              className="form-grid"
            >
              <input type="hidden" name="intent" value="upload_media" />
              <input type="hidden" name="productId" value={product.id} />
              <div className="field field--wide">
                <label>
                  Fichier
                  <input
                    name="file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Texte alternatif FR
                  <input name="altFr" required />
                </label>
              </div>
              <div className="field">
                <label>
                  Alternative text EN
                  <input name="altEn" required />
                </label>
              </div>
              <button
                className="ui-button ui-button--outline"
                type="submit"
                disabled={demo}
              >
                <Upload aria-hidden="true" /> Ajouter l’image
              </button>
            </Form>
          </section>
        </>
      ) : (
        <p className="admin-notice">
          Enregistrez d’abord le café en brouillon, puis ajoutez ses variantes
          et ses images avant publication.
        </p>
      )}
    </AdminShell>
  );
}
