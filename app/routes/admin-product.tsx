import { Pencil, Plus, Save, Trash2, Upload, X } from "lucide-react";
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
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminShell } from "~/components/admin-shell";
import { AdminImageEditorInput } from "~/components/admin-image-editor-input";
import { AdminProductThumbnailForm } from "~/components/admin-product-thumbnail-form";
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
const variantFieldsSchema = {
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
};
const variantSchema = z.object({
  intent: z.literal("create_variant"),
  productId: z.uuid(),
  ...variantFieldsSchema,
});
const updateVariantSchema = z.object({
  intent: z.literal("update_variant"),
  productId: z.uuid(),
  variantId: z.uuid(),
  ...variantFieldsSchema,
});
const deleteVariantSchema = z.object({
  intent: z.literal("delete_variant"),
  productId: z.uuid(),
  variantId: z.uuid(),
});
const deleteMediaSchema = z.object({
  intent: z.literal("delete_media"),
  productId: z.uuid(),
  mediaId: z.uuid(),
});
const editorialBlockFieldsSchema = z.object({
  titleFr: z.string().trim().min(2).max(180),
  titleEn: z.string().trim().min(2).max(180),
  bodyFr: z.string().trim().min(10).max(8_000),
  bodyEn: z.string().trim().min(10).max(8_000),
  altFr: z.string().trim().min(2).max(240),
  altEn: z.string().trim().min(2).max(240),
});
const editorialBlockSchema = editorialBlockFieldsSchema.extend({
  intent: z.literal("save_editorial_block"),
  productId: z.uuid(),
  position: z.coerce.number().int().min(1).max(2),
});

const productImageExtensions: Record<string, string> = {
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

type EditorialBlockFields = z.infer<typeof editorialBlockFieldsSchema>;
type ServiceSupabase = NonNullable<ReturnType<typeof createServiceSupabase>>;

async function saveEditorialBlock({
  client,
  adminId,
  productId,
  position,
  fields,
  file,
}: {
  client: ServiceSupabase;
  adminId: string;
  productId: string;
  position: 1 | 2;
  fields: EditorialBlockFields;
  file: FormDataEntryValue | null;
}) {
  const { data: existing, error: readError } = await client
    .from("product_editorial_blocks")
    .select("*")
    .eq("product_id", productId)
    .eq("position", position)
    .maybeSingle();
  if (readError) return { ok: false as const, message: readError.message };

  const hasNewImage = file instanceof File && file.size > 0;
  if (!hasNewImage && !existing)
    return {
      ok: false as const,
      message: `Ajoutez une image pour publier le bloc éditorial ${position}.`,
    };
  if (
    hasNewImage &&
    (file.size > 8_000_000 || !productImageExtensions[file.type])
  )
    return {
      ok: false as const,
      message: `L’image du bloc ${position} doit être au format JPEG, PNG ou WebP et peser au maximum 8 Mo.`,
    };

  let storagePath = existing?.storage_path as string | undefined;
  let publicUrl = existing?.public_url as string | undefined;
  let uploadedPath: string | null = null;
  if (hasNewImage) {
    uploadedPath = `editorial/${productId}/${position}-${crypto.randomUUID()}.${productImageExtensions[file.type]}`;
    const { error: uploadError } = await client.storage
      .from("product-media")
      .upload(uploadedPath, await file.arrayBuffer(), {
        contentType: file.type,
      });
    if (uploadError) return { ok: false as const, message: uploadError.message };
    storagePath = uploadedPath;
    publicUrl = client.storage
      .from("product-media")
      .getPublicUrl(uploadedPath).data.publicUrl;
  }

  const mutation = {
    product_id: productId,
    position,
    storage_path: storagePath,
    public_url: publicUrl,
    alt_fr: fields.altFr,
    alt_en: fields.altEn,
    title_fr: fields.titleFr,
    title_en: fields.titleEn,
    body_fr: fields.bodyFr,
    body_en: fields.bodyEn,
    updated_at: new Date().toISOString(),
  };
  const { error: saveError } = await client
    .from("product_editorial_blocks")
    .upsert(mutation, { onConflict: "product_id,position" });
  if (saveError) {
    if (uploadedPath)
      await client.storage.from("product-media").remove([uploadedPath]);
    return { ok: false as const, message: saveError.message };
  }
  if (
    uploadedPath &&
    existing?.storage_path &&
    existing.storage_path !== uploadedPath
  )
    await client.storage.from("product-media").remove([existing.storage_path]);
  await client.from("audit_log").insert({
    actor_id: adminId,
    action: "product.editorial_block_updated",
    entity_type: "product",
    entity_id: productId,
    before_data: existing,
    after_data: mutation,
  });
  return { ok: true as const, message: `Bloc éditorial ${position} enregistré.` };
}

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
        thumbnailLabelUrl: null,
        thumbnailBackgroundColor: "#d9ddd3",
        hoverImageUrl: null,
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
  if (intent === "upload_thumbnail_label") {
    const productId = String(form.get("productId"));
    const backgroundColor = String(form.get("thumbnailBackgroundColor") ?? "").trim();
    const file = form.get("file");
    if (!z.string().uuid().safeParse(productId).success || !/^#[0-9a-fA-F]{6}$/.test(backgroundColor))
      return { ok: false, message: "Produit ou couleur de miniature invalide." };
    const { data: existing, error: readError } = await client
      .from("products")
      .select("thumbnail_label_storage_path,thumbnail_label_public_url")
      .eq("id", productId)
      .maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!existing) return { ok: false, message: "Produit introuvable." };

    const hasNewFile = file instanceof File && file.size > 0;
    if (!hasNewFile && !existing.thumbnail_label_public_url)
      return { ok: false, message: "Ajoutez un fichier d’étiquette." };
    if (hasNewFile && (file.size > 8_000_000 || !productImageExtensions[file.type]))
      return { ok: false, message: "L’étiquette doit être au format PNG, WebP ou JPEG et peser au maximum 8 Mo." };

    let storagePath = existing.thumbnail_label_storage_path as string | null;
    let publicUrl = existing.thumbnail_label_public_url as string | null;
    let uploadedPath: string | null = null;
    if (hasNewFile) {
      uploadedPath = `thumbnails/${productId}/label-${crypto.randomUUID()}.${productImageExtensions[file.type]}`;
      const { error: uploadError } = await client.storage
        .from("product-media")
        .upload(uploadedPath, await file.arrayBuffer(), { contentType: file.type });
      if (uploadError) return { ok: false, message: uploadError.message };
      storagePath = uploadedPath;
      publicUrl = client.storage.from("product-media").getPublicUrl(uploadedPath).data.publicUrl;
    }

    const { error: updateError } = await client.from("products").update({
      thumbnail_label_storage_path: storagePath,
      thumbnail_label_public_url: publicUrl,
      thumbnail_background_color: backgroundColor.toLowerCase(),
      updated_at: new Date().toISOString(),
    }).eq("id", productId);
    if (updateError) {
      if (uploadedPath) await client.storage.from("product-media").remove([uploadedPath]);
      return { ok: false, message: updateError.message };
    }
    if (uploadedPath && existing.thumbnail_label_storage_path && existing.thumbnail_label_storage_path !== uploadedPath)
      await client.storage.from("product-media").remove([existing.thumbnail_label_storage_path]);
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "product.thumbnail_updated",
      entity_type: "product",
      entity_id: productId,
      before_data: existing,
      after_data: { storagePath, publicUrl, backgroundColor: backgroundColor.toLowerCase() },
    });
    return { ok: true, message: "Miniature du produit enregistrée." };
  }
  if (intent === "upload_hover_image") {
    const productId = String(form.get("productId"));
    const file = form.get("file");
    if (!z.string().uuid().safeParse(productId).success)
      return { ok: false, message: "Produit invalide." };
    if (!(file instanceof File) || file.size === 0 || file.size > 8_000_000 || !productImageExtensions[file.type])
      return { ok: false, message: "L’image de survol doit être au format JPEG, PNG ou WebP et peser au maximum 8 Mo." };

    const { data: existing, error: readError } = await client
      .from("products")
      .select("hover_image_storage_path,hover_image_public_url")
      .eq("id", productId)
      .maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!existing) return { ok: false, message: "Produit introuvable." };

    const uploadedPath = `hover-images/${productId}/image-${crypto.randomUUID()}.${productImageExtensions[file.type]}`;
    const { error: uploadError } = await client.storage
      .from("product-media")
      .upload(uploadedPath, await file.arrayBuffer(), { contentType: file.type });
    if (uploadError) return { ok: false, message: uploadError.message };
    const publicUrl = client.storage.from("product-media").getPublicUrl(uploadedPath).data.publicUrl;
    const { error: updateError } = await client.from("products").update({
      hover_image_storage_path: uploadedPath,
      hover_image_public_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", productId);
    if (updateError) {
      await client.storage.from("product-media").remove([uploadedPath]);
      return { ok: false, message: updateError.message };
    }
    if (existing.hover_image_storage_path && existing.hover_image_storage_path !== uploadedPath)
      await client.storage.from("product-media").remove([existing.hover_image_storage_path]);
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "product.hover_image_updated",
      entity_type: "product",
      entity_id: productId,
      before_data: existing,
      after_data: { storagePath: uploadedPath, publicUrl },
    });
    return { ok: true, message: "Image de survol enregistrée." };
  }
  if (intent === "delete_hover_image") {
    const productId = String(form.get("productId"));
    if (!z.string().uuid().safeParse(productId).success)
      return { ok: false, message: "Produit invalide." };
    const { data: existing, error: readError } = await client
      .from("products")
      .select("hover_image_storage_path,hover_image_public_url")
      .eq("id", productId)
      .maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!existing) return { ok: false, message: "Produit introuvable." };
    const { error: updateError } = await client.from("products").update({
      hover_image_storage_path: null,
      hover_image_public_url: null,
      updated_at: new Date().toISOString(),
    }).eq("id", productId);
    if (updateError) return { ok: false, message: updateError.message };
    if (existing.hover_image_storage_path)
      await client.storage.from("product-media").remove([existing.hover_image_storage_path]);
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "product.hover_image_deleted",
      entity_type: "product",
      entity_id: productId,
      before_data: existing,
    });
    return { ok: true, message: "Image de survol supprimée." };
  }
  if (intent === "delete_media") {
    const parsed = deleteMediaSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return { ok: false, message: "Image ou produit invalide." };
    const { data: media, error: readError } = await client
      .from("product_media")
      .select("id,product_id,storage_path,public_url,alt_fr,alt_en,position")
      .eq("id", parsed.data.mediaId)
      .eq("product_id", parsed.data.productId)
      .maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!media)
      return { ok: false, message: "Cette image n’existe plus dans la galerie." };

    const [productResult, mediaCountResult] = await Promise.all([
      client
        .from("products")
        .select("status")
        .eq("id", parsed.data.productId)
        .maybeSingle(),
      client
        .from("product_media")
        .select("id", { count: "exact", head: true })
        .eq("product_id", parsed.data.productId),
    ]);
    if (productResult.error) return { ok: false, message: productResult.error.message };
    if (!productResult.data) return { ok: false, message: "Produit introuvable." };
    if (mediaCountResult.error) return { ok: false, message: mediaCountResult.error.message };
    if (
      productResult.data.status === "published" &&
      (mediaCountResult.count ?? 0) <= 1
    )
      return {
        ok: false,
        message: "Un café publié doit conserver au moins une image. Ajoutez son remplacement avant de supprimer celle-ci.",
      };

    const { error: deleteError } = await client
      .from("product_media")
      .delete()
      .eq("id", media.id)
      .eq("product_id", parsed.data.productId);
    if (deleteError) return { ok: false, message: deleteError.message };
    const storageCleanup = media.storage_path
      ? await client.storage.from("product-media").remove([media.storage_path])
      : { error: null };
    await client
      .from("products")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", parsed.data.productId);
    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "product.media_deleted",
      entity_type: "product_media",
      entity_id: media.id,
      before_data: media,
      after_data: storageCleanup.error
        ? { removedFromGallery: true, storageCleanupError: storageCleanup.error.message }
        : { removedFromGallery: true, removedFromStorage: Boolean(media.storage_path) },
    });
    return {
      ok: true,
      message: storageCleanup.error
        ? "Image supprimée de la galerie. Le nettoyage du fichier source devra être relancé."
        : "Image supprimée de la galerie.",
    };
  }
  if (intent === "upload_media") {
    const productId = String(form.get("productId"));
    const file = form.get("file");
    const altFr = String(form.get("altFr") ?? "").trim();
    const altEn = String(form.get("altEn") ?? "").trim();
    const imageWidth = z.coerce.number().int().min(1).max(3200).safeParse(form.get("imageWidth"));
    const imageHeight = z.coerce.number().int().min(1).max(3200).safeParse(form.get("imageHeight"));
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
    const extension = productImageExtensions[file.type];
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
      width: imageWidth.success ? imageWidth.data : 1600,
      height: imageHeight.success ? imageHeight.data : 1600,
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
    return saveEditorialBlock({
      client,
      adminId: admin.id,
      productId: parsed.data.productId,
      position: parsed.data.position as 1 | 2,
      fields: parsed.data,
      file: form.get("file"),
    });
  }
  if (intent === "update_variant") {
    const parsed = updateVariantSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return {
        ok: false,
        message: "Données de variante invalides.",
        errors: parsed.error.flatten().fieldErrors,
      };

    const { data: existing, error: readError } = await client
      .from("product_variants")
      .select("*,variant_offers(*)")
      .eq("id", parsed.data.variantId)
      .eq("product_id", parsed.data.productId)
      .maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!existing)
      return { ok: false, message: "Variante introuvable pour ce produit." };
    const { data: parentProduct, error: parentProductError } = await client
      .from("products")
      .select("professional_enabled")
      .eq("id", parsed.data.productId)
      .maybeSingle();
    if (parentProductError) return { ok: false, message: parentProductError.message };
    if (!parentProduct) return { ok: false, message: "Produit introuvable." };
    if (parsed.data.stockOnHand < Number(existing.stock_reserved ?? 0))
      return {
        ok: false,
        message: `Le stock total ne peut pas être inférieur aux ${existing.stock_reserved} unité(s) actuellement réservée(s).`,
      };

    const previousOffers: Array<{
      id: string;
      audience: "retail" | "professional";
      price_cents: number;
      minimum_quantity: number;
      active: boolean;
    }> = Array.isArray(existing.variant_offers)
      ? existing.variant_offers
      : [];
    const previousVariant = {
      sku: existing.sku,
      label: existing.label,
      weight_grams: existing.weight_grams,
      internal_cost_cents: existing.internal_cost_cents,
      stock_on_hand: existing.stock_on_hand,
      low_stock_threshold: existing.low_stock_threshold,
      hs_code: existing.hs_code,
      customs_origin_country: existing.customs_origin_country,
    };
    const restorePreviousState = async () => {
      await client
        .from("product_variants")
        .update({ ...previousVariant, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (previousOffers.length > 0)
        await client.from("variant_offers").upsert(
          previousOffers.map((offer) => ({
            id: offer.id,
            variant_id: existing.id,
            audience: offer.audience,
            price_cents: offer.price_cents,
            minimum_quantity: offer.minimum_quantity,
            active: offer.active,
          })),
          { onConflict: "variant_id,audience" },
        );
      for (const audience of ["retail", "professional"] as const) {
        if (!previousOffers.some((offer) => offer.audience === audience))
          await client
            .from("variant_offers")
            .delete()
            .eq("variant_id", existing.id)
            .eq("audience", audience);
      }
    };

    const variantMutation = {
      sku: parsed.data.sku,
      label: parsed.data.label,
      weight_grams: parsed.data.weightGrams,
      internal_cost_cents: parsed.data.internalCostCents,
      stock_on_hand: parsed.data.stockOnHand,
      low_stock_threshold: parsed.data.lowStockThreshold,
      hs_code: parsed.data.hsCode,
      customs_origin_country: parsed.data.customsOriginCountry,
      updated_at: new Date().toISOString(),
    };
    const { error: variantError } = await client
      .from("product_variants")
      .update(variantMutation)
      .eq("id", existing.id);
    if (variantError) return { ok: false, message: variantError.message };

    const professionalRequested = Boolean(
      parentProduct.professional_enabled || parsed.data.professional,
    );
    const desiredOffers = buildVariantOffers({
      variantId: existing.id,
      retailPriceCents: parsed.data.retailPriceCents,
      productProfessionalEnabled: false,
      professionalRequested,
      professionalPriceCents: parsed.data.proPriceCents,
      professionalMinimumQuantity: parsed.data.proMinimumQuantity,
    });
    const { error: offerError } = await client
      .from("variant_offers")
      .upsert(desiredOffers, { onConflict: "variant_id,audience" });
    if (offerError) {
      await restorePreviousState();
      return { ok: false, message: offerError.message };
    }
    if (!professionalRequested) {
      const { error: professionalOfferError } = await client
        .from("variant_offers")
        .update({ active: false })
        .eq("variant_id", existing.id)
        .eq("audience", "professional");
      if (professionalOfferError) {
        await restorePreviousState();
        return { ok: false, message: professionalOfferError.message };
      }
    }

    const stockDelta = parsed.data.stockOnHand - Number(existing.stock_on_hand);
    if (stockDelta !== 0) {
      const { error: movementError } = await client
        .from("stock_movements")
        .insert({
          variant_id: existing.id,
          quantity_delta: stockDelta,
          reason: "Ajustement manuel depuis la fiche produit",
          actor_id: admin.id,
        });
      if (movementError) {
        await restorePreviousState();
        return { ok: false, message: movementError.message };
      }
    }

    await client.from("audit_log").insert({
      actor_id: admin.id,
      action: "variant.updated",
      entity_type: "product_variant",
      entity_id: existing.id,
      before_data: { variant: previousVariant, offers: previousOffers },
      after_data: { variant: variantMutation, offers: desiredOffers },
    });
    return { ok: true, message: `Variante « ${parsed.data.label} » enregistrée.` };
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
        .select("*,product_translations(*),product_editorial_blocks(*)")
        .eq("id", parsed.data.productId)
        .single();
  if ("error" in before && before.error)
    return { ok: false, message: before.error.message };
  const editorialBlocksToSave: Array<{
    position: 1 | 2;
    fields: EditorialBlockFields;
    file: FormDataEntryValue | null;
  }> = [];
  if (!creating) {
    const existingEditorialBlocks = Array.isArray(before.data?.product_editorial_blocks)
      ? before.data.product_editorial_blocks
      : [];
    for (const position of [1, 2] as const) {
      const prefix = `editorial${position}`;
      const rawFields = {
        titleFr: String(form.get(`${prefix}TitleFr`) ?? ""),
        titleEn: String(form.get(`${prefix}TitleEn`) ?? ""),
        bodyFr: String(form.get(`${prefix}BodyFr`) ?? ""),
        bodyEn: String(form.get(`${prefix}BodyEn`) ?? ""),
        altFr: String(form.get(`${prefix}AltFr`) ?? ""),
        altEn: String(form.get(`${prefix}AltEn`) ?? ""),
      };
      const file = form.get(`${prefix}File`);
      const hasNewImage = file instanceof File && file.size > 0;
      const hasText = Object.values(rawFields).some((value) => value.trim().length > 0);
      const existingBlock = existingEditorialBlocks.some(
        (block: { position?: number }) => Number(block.position) === position,
      );
      if (!hasText && !hasNewImage && !existingBlock) continue;
      const blockFields = editorialBlockFieldsSchema.safeParse(rawFields);
      if (!blockFields.success)
        return {
          ok: false,
          message: `Complétez le titre, le texte et l’alternative de l’image du bloc éditorial ${position} dans les deux langues.`,
          errors: blockFields.error.flatten().fieldErrors,
        };
      if (!existingBlock && !hasNewImage)
        return {
          ok: false,
          message: `Ajoutez une image au bloc éditorial ${position}.`,
        };
      editorialBlocksToSave.push({ position, fields: blockFields.data, file });
    }
  }
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
  const previousTranslations = Array.isArray(before.data?.product_translations)
    ? (before.data.product_translations as Array<{ locale?: string; body?: string | null }>)
    : [];
  const previousBody = (locale: "fr-FR" | "en-GB") =>
    previousTranslations.find((translation) => translation.locale === locale)?.body ?? "";
  const translations = [
    {
      locale: "fr-FR",
      name: parsed.data.nameFr,
      short_description: parsed.data.shortFr,
      body: previousBody("fr-FR"),
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
      body: previousBody("en-GB"),
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
  for (const block of editorialBlocksToSave) {
    const blockResult = await saveEditorialBlock({
      client,
      adminId: admin.id,
      productId: savedProductId,
      position: block.position,
      fields: block.fields,
      file: block.file,
    });
    if (!blockResult.ok)
      return {
        ok: false,
        message: `Le produit a été enregistré, mais ${blockResult.message.toLocaleLowerCase("fr-FR")}`,
      };
  }
  if (creating)
    return redirect(`/admin/produits/${savedProductId}?confirmation=product-created`);
  return {
    ok: true,
    message: editorialBlocksToSave.length > 0
      ? "Produit et blocs éditoriaux enregistrés."
      : "Produit enregistré.",
  };
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

function EditorialBlockFields({
  position,
  block,
}: {
  position: 1 | 2;
  block?: ProductEditorialBlock;
}) {
  const imageFirst = position === 2;
  const prefix = `editorial${position}`;
  return (
    <div className="admin-editorial-block">
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
          <AdminImageEditorInput
            name={`${prefix}File`}
            label={block ? "Remplacer l’image" : "Image"}
            help="JPEG, PNG ou WebP · recadrage imposé au ratio 75:83"
            currentPreviewUrl={block?.imageUrl}
            defaultAspect="75:83"
            lockAspect
            defaultOutputWidth={1500}
          />
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
                  name={`${prefix}TitleFr`}
                  defaultValue={block?.title["fr-FR"] ?? ""}
                  maxLength={180}
                  required={Boolean(block)}
                />
              </label>
            </div>
            <div className="field">
              <label>
                Texte
                <textarea
                  name={`${prefix}BodyFr`}
                  defaultValue={block?.body["fr-FR"] ?? ""}
                  maxLength={8_000}
                  required={Boolean(block)}
                />
              </label>
            </div>
            <div className="field">
              <label>
                Texte alternatif de l’image
                <input
                  name={`${prefix}AltFr`}
                  defaultValue={block?.imageAlt["fr-FR"] ?? ""}
                  maxLength={240}
                  required={Boolean(block)}
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
                  name={`${prefix}TitleEn`}
                  defaultValue={block?.title["en-GB"] ?? ""}
                  maxLength={180}
                  required={Boolean(block)}
                />
              </label>
            </div>
            <div className="field">
              <label>
                Text
                <textarea
                  name={`${prefix}BodyEn`}
                  defaultValue={block?.body["en-GB"] ?? ""}
                  maxLength={8_000}
                  required={Boolean(block)}
                />
              </label>
            </div>
            <div className="field">
              <label>
                Image alternative text
                <input
                  name={`${prefix}AltEn`}
                  defaultValue={block?.imageAlt["en-GB"] ?? ""}
                  maxLength={240}
                  required={Boolean(block)}
                />
              </label>
            </div>
          </fieldset>}
          />
        </div>
      </div>
    </div>
  );
}

function EditorialBlocksSection({
  blocks,
}: {
  blocks: readonly ProductEditorialBlock[];
}) {
  return <section id="product-editorial-blocks" className="ui-card admin-editor admin-editorial-section admin-product-anchor-target">
    <h2>Blocs éditoriaux</h2>
    <p>
      Ces deux encarts apparaissent sous les informations d’origine sur la fiche
      produit. Le second inverse automatiquement la position de l’image et du texte.
    </p>
    <div className="admin-editorial-blocks">
      <EditorialBlockFields
        position={1}
        block={blocks.find((block) => block.position === 1)}
      />
      <EditorialBlockFields
        position={2}
        block={blocks.find((block) => block.position === 2)}
      />
    </div>
  </section>;
}

function VariantList({
  productId,
  variants,
  productProfessionalEnabled,
  demo,
}: {
  productId: string;
  variants: readonly ProductVariant[];
  productProfessionalEnabled: boolean;
  demo: boolean;
}) {
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
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
            const editorId = `variant-editor-${variant.id}`;
            const editing = editingVariantId === variant.id;
            return (
              <Fragment key={variant.id}>
                <tr>
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
                    <div className="admin-variant-actions">
                      <button
                        className="ui-button ui-button--outline ui-button--sm"
                        type="button"
                        aria-expanded={editing}
                        aria-controls={editorId}
                        aria-label={`Modifier la variante ${variant.label}`}
                        onClick={() => setEditingVariantId(editing ? null : variant.id)}
                      >
                        {editing ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                        {editing ? "Fermer" : "Modifier"}
                      </button>
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
                    </div>
                  </td>
                </tr>
                {editing ? (
                  <tr className="admin-variant-edit-row">
                    <td colSpan={8}>
                      <VariantEditForm
                        id={editorId}
                        productId={productId}
                        variant={variant}
                        professionalRequired={productProfessionalEnabled}
                        demo={demo}
                        onCancel={() => setEditingVariantId(null)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VariantEditForm({
  id,
  productId,
  variant,
  professionalRequired,
  demo,
  onCancel,
}: {
  id: string;
  productId: string;
  variant: ProductVariant;
  professionalRequired: boolean;
  demo: boolean;
  onCancel: () => void;
}) {
  const retailOffer = variant.offers.find((offer) => offer.audience === "retail");
  const professionalOffer = variant.offers.find((offer) => offer.audience === "professional");
  const [professionalEnabled, setProfessionalEnabled] = useState(
    professionalRequired || Boolean(professionalOffer?.active),
  );
  const effectiveProfessionalEnabled = professionalRequired || professionalEnabled;
  const headingId = `${id}-title`;
  return (
    <Form
      id={id}
      method="post"
      className="admin-variant-edit-form"
      aria-labelledby={headingId}
    >
      <input type="hidden" name="intent" value="update_variant" />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variant.id} />
      <div className="admin-variant-edit-form__heading">
        <div>
          <p className="eyebrow">Variante existante</p>
          <h3 id={headingId}>Modifier {variant.label}</h3>
        </div>
        <p>Les commandes passées conservent les valeurs enregistrées lors de l’achat.</p>
      </div>
      <div className="form-grid admin-variant-edit-form__grid">
        <div className="field">
          <label>
            SKU
            <input name="sku" defaultValue={variant.sku} required />
          </label>
        </div>
        <div className="field">
          <label>
            Libellé
            <input name="label" defaultValue={variant.label} required />
          </label>
        </div>
        <div className="field">
          <label>
            Poids (g)
            <input name="weightGrams" type="number" min="1" defaultValue={variant.weightGrams} required />
          </label>
        </div>
        <div className="field">
          <label>
            Stock total
            <input
              name="stockOnHand"
              type="number"
              min={variant.stockReserved}
              defaultValue={variant.stockOnHand}
              required
            />
          </label>
          <small>{variant.stockReserved} réservé · {variant.stockOnHand - variant.stockReserved} disponible actuellement</small>
        </div>
        <div className="field">
          <label>
            Seuil bas
            <input name="lowStockThreshold" type="number" min="0" defaultValue={variant.lowStockThreshold} required />
          </label>
        </div>
        <div className="field">
          <label>
            Coût interne (¢)
            <input name="internalCostCents" type="number" min="0" defaultValue={variant.internalCostCents} required />
          </label>
        </div>
        <div className="field">
          <label>
            Prix public (¢)
            <input name="retailPriceCents" type="number" min="0" defaultValue={retailOffer?.price.amount ?? 0} required />
          </label>
        </div>
        <div className="field">
          <label>
            Code douanier
            <input name="hsCode" defaultValue={variant.hsCode} pattern="[0-9]{6,10}" required />
          </label>
        </div>
        <div className="field">
          <label>
            Origine douanière
            <input name="customsOriginCountry" defaultValue={variant.customsOriginCountry} maxLength={2} required />
          </label>
        </div>
        <label className="admin-variant-professional-toggle">
          {professionalRequired ? <input type="hidden" name="professional" value="on" /> : null}
          <input
            name="professional"
            type="checkbox"
            checked={effectiveProfessionalEnabled}
            disabled={professionalRequired}
            onChange={(event) => setProfessionalEnabled(event.currentTarget.checked)}
          />
          <span>
            Offre professionnelle active
            {professionalRequired ? <small>Requise tant que le café est activé dans la boutique pro.</small> : null}
          </span>
        </label>
        <div className="field">
          <label>
            Prix pro (¢)
            <input
              name="proPriceCents"
              type="number"
              min="0"
              defaultValue={professionalOffer?.price.amount ?? retailOffer?.price.amount ?? 0}
              disabled={!effectiveProfessionalEnabled}
              required={effectiveProfessionalEnabled}
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
              defaultValue={professionalOffer?.minimumQuantity ?? 1}
              disabled={!effectiveProfessionalEnabled}
              required={effectiveProfessionalEnabled}
            />
          </label>
        </div>
      </div>
      <div className="admin-variant-edit-form__actions">
        <button className="ui-button ui-button--default" type="submit" disabled={demo}>
          <Save aria-hidden="true" /> Enregistrer la variante
        </button>
        <button className="ui-button ui-button--outline" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </Form>
  );
}

export function adminProductProgressMessage(intent: string) {
  const messages: Readonly<Record<string, string>> = {
    save_product: "Enregistrement du produit…",
    save_editorial_block: "Enregistrement du bloc éditorial…",
    create_variant: "Ajout de la variante…",
    update_variant: "Enregistrement de la variante…",
    delete_variant: "Suppression de la variante…",
    upload_media: "Import de l’image…",
    delete_media: "Suppression de l’image…",
    upload_thumbnail_label: "Création de la miniature…",
    upload_hover_image: "Import de l’image de survol…",
    delete_hover_image: "Suppression de l’image de survol…",
  };
  return messages[intent] ?? "Modification en cours…";
}

const adminProductImageUploadIntents = new Set([
  "upload_media",
  "upload_thumbnail_label",
  "upload_hover_image",
]);

export function isAdminProductImageUpload(intent: string) {
  return adminProductImageUploadIntents.has(intent);
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

function UploadLockedProductSave() {
  const [saveAttempted, setSaveAttempted] = useState(false);

  return <div
    className="admin-product-save-control is-uploading"
    role="group"
    aria-label="Enregistrement du produit"
  >
    <p
      id="admin-product-upload-notice"
      className={`admin-product-upload-notice${saveAttempted ? " is-blocked" : ""}`}
      role={saveAttempted ? "alert" : "status"}
      aria-live={saveAttempted ? "assertive" : "polite"}
    >
      {saveAttempted
        ? "Impossible d’enregistrer maintenant : une photo est en cours d’import. Attendez la fin du transfert."
        : "Import de la photo en cours… L’enregistrement sera disponible à la fin du transfert."}
    </p>
    <div className="admin-product-save-lock">
      <button
        className="ui-button ui-button--default admin-product-save-fab"
        type="submit"
        form="product-editor-form"
        disabled
        aria-describedby="admin-product-upload-notice"
        aria-busy="true"
      >
        <Save aria-hidden="true" /> Enregistrer
      </button>
      <button
        className="admin-product-save-blocker"
        type="button"
        aria-label="Pourquoi l’enregistrement est indisponible"
        aria-describedby="admin-product-upload-notice"
        onClick={() => setSaveAttempted(true)}
      />
    </div>
  </div>;
}

export function AdminProductSaveControl({
  demo,
  modifying,
  pendingIntent,
}: {
  demo: boolean;
  modifying: boolean;
  pendingIntent: string;
}) {
  if (modifying && isAdminProductImageUpload(pendingIntent))
    return <UploadLockedProductSave />;

  const savingProduct = modifying && pendingIntent === "save_product";
  return <div className="admin-product-save-control">
    <button
      className="ui-button ui-button--default admin-product-save-fab"
      type="submit"
      form="product-editor-form"
      disabled={demo || modifying}
      aria-busy={savingProduct}
    >
      <Save aria-hidden="true" /> {savingProduct ? "Enregistrement…" : "Enregistrer"}
    </button>
  </div>;
}

const adminProductSections = [
  { id: "product-editor-form", label: "Contenu" },
  { id: "product-editorial-blocks", label: "Blocs éditoriaux" },
  { id: "product-variants", label: "Variantes" },
  { id: "product-new-variant", label: "Nouvelle variante" },
  { id: "product-thumbnail", label: "Miniature" },
  { id: "product-hover-image", label: "Survol" },
  { id: "product-gallery", label: "Galerie" },
] as const;

function AdminProductAnchorNavigation({ isNew }: { isNew: boolean }) {
  const navigationRef = useRef<HTMLElement>(null);
  const sections = isNew ? adminProductSections.slice(0, 1) : adminProductSections;
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const firstTarget = document.getElementById(sections[0].id);
      const targetScrollMargin = firstTarget
        ? Number.parseFloat(window.getComputedStyle(firstTarget).scrollMarginTop) || 0
        : 0;
      const activationLine = Math.max(
        (navigationRef.current?.getBoundingClientRect().bottom ?? 0) + 16,
        targetScrollMargin + 1,
      );
      let nextActiveSection = sections[0].id;
      for (const section of sections) {
        const target = document.getElementById(section.id);
        if (!target || target.getBoundingClientRect().top > activationLine) break;
        nextActiveSection = section.id;
      }
      setActiveSection(nextActiveSection);
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    document.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, { capture: true });
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isNew]);

  return <nav ref={navigationRef} className="admin-product-anchor-nav" aria-label="Sections de la fiche produit">
    {sections.map((section) => <a
      className={activeSection === section.id ? "is-active" : undefined}
      href={`#${section.id}`}
      aria-current={activeSection === section.id ? "location" : undefined}
      onClick={() => setActiveSection(section.id)}
      key={section.id}
    >{section.label}</a>)}
  </nav>;
}

export default function AdminProduct() {
  const { demo, isNew, product } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const pendingIntent = String(navigation.formData?.get("intent") ?? "");
  const modifying = navigation.state !== "idle" && Boolean(navigation.formData);
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
              to={product.status === "draft" ? `/boutique/${product.slug}?preview=${product.id}` : `/boutique/${product.slug}`}
            >
              {product.status === "draft" ? "Aperçu du brouillon" : "Voir la fiche"}
            </Link>
          ) : null}
          <AdminProductSaveControl
            demo={demo}
            modifying={modifying}
            pendingIntent={pendingIntent}
          />
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
      <AdminProductAnchorNavigation isNew={isNew} />
      <Form
        id="product-editor-form"
        method="post"
        encType="multipart/form-data"
        className="admin-product-global-form admin-product-anchor-target"
      >
        <input type="hidden" name="intent" value="save_product" />
        <input type="hidden" name="productId" value={product.id} />
        <section className="ui-card admin-editor">
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
        </section>
        {!isNew ? (
          <EditorialBlocksSection blocks={product.editorialBlocks} />
        ) : null}
      </Form>
      {!isNew ? (
        <>
          <section id="product-variants" className="ui-card admin-editor admin-product-anchor-target">
            <h2>Variantes existantes</h2>
            <p>
              La suppression retire la variante de la vente tout en conservant
              son historique de stock et de commandes.
            </p>
            <VariantList
              productId={product.id}
              variants={product.variants}
              productProfessionalEnabled={product.professionalEnabled}
              demo={demo}
            />
          </section>
          <section id="product-new-variant" className="ui-card admin-editor admin-product-anchor-target">
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
          <div id="product-thumbnail" className="admin-product-anchor-target">
            <AdminProductThumbnailForm
              productId={product.id}
              currentLabelUrl={product.thumbnailLabelUrl}
              currentBackgroundColor={product.thumbnailBackgroundColor}
              demo={demo}
            />
          </div>
          <section id="product-hover-image" className="ui-card admin-editor admin-thumbnail-editor admin-product-anchor-target">
            <div className="admin-thumbnail-editor__heading">
              <div>
                <p className="eyebrow">Carte produit</p>
                <h2>Image de survol</h2>
              </div>
              <p>Cette image remplace la miniature principale lorsque le visiteur survole la carte ou y accède au clavier.</p>
            </div>
            <div className="admin-thumbnail-editor__layout">
              <div className={`admin-hover-image-preview${product.hoverImageUrl ? "" : " is-empty"}`}>
                {product.hoverImageUrl ? (
                  <img src={product.hoverImageUrl} alt="Aperçu de l’image de survol" />
                ) : (
                  <p>Aucune image de survol</p>
                )}
              </div>
              <div className="admin-hover-image-actions">
                <Form method="post" encType="multipart/form-data" className="admin-thumbnail-form">
                  <input type="hidden" name="intent" value="upload_hover_image" />
                  <input type="hidden" name="productId" value={product.id} />
                  <AdminImageEditorInput
                    label="Fichier de l’image de survol"
                    help="JPEG, PNG ou WebP · format carré recommandé pour les cartes"
                    required
                    currentPreviewUrl={product.hoverImageUrl}
                    defaultAspect="1:1"
                    defaultOutputWidth={1200}
                  />
                  <button className="ui-button ui-button--outline" type="submit" disabled={demo}>
                    <Upload aria-hidden="true" /> {product.hoverImageUrl ? "Remplacer l’image de survol" : "Ajouter l’image de survol"}
                  </button>
                </Form>
                {product.hoverImageUrl ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete_hover_image" />
                    <input type="hidden" name="productId" value={product.id} />
                    <button className="ui-button ui-button--danger" type="submit" disabled={demo}>
                      <Trash2 aria-hidden="true" /> Supprimer l’image de survol
                    </button>
                  </Form>
                ) : null}
              </div>
            </div>
          </section>
          <section id="product-gallery" className="ui-card admin-editor admin-product-anchor-target">
            <h2>Galerie</h2>
            <p>Supprimez les visuels devenus inutiles. Pour un café publié, importez toujours une nouvelle image avant de retirer la dernière.</p>
            <div className="admin-media-grid">
              {product.media.map((media, index) => {
                const protectedLastImage = product.status === "published" && product.media.length === 1;
                return (
                  <figure className="admin-media-item" key={media.id}>
                    <img src={media.url} alt={media.alt["fr-FR"]} />
                    <figcaption>
                      <span>Image {index + 1}</span>
                      <Form
                        method="post"
                        onSubmit={(event) => {
                          if (!window.confirm(`Supprimer l’image ${index + 1} de la galerie ? Cette action est définitive.`))
                            event.preventDefault();
                        }}
                      >
                        <input type="hidden" name="intent" value="delete_media" />
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="mediaId" value={media.id} />
                        <button
                          className="ui-button ui-button--danger ui-button--sm"
                          type="submit"
                          disabled={demo || protectedLastImage}
                          aria-label={`Supprimer l’image ${index + 1} de la galerie`}
                          title={protectedLastImage ? "Ajoutez une nouvelle image avant de supprimer la dernière d’un café publié" : undefined}
                        >
                          <Trash2 aria-hidden="true" /> Supprimer
                        </button>
                      </Form>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <Form
              method="post"
              encType="multipart/form-data"
              className="form-grid"
            >
              <input type="hidden" name="intent" value="upload_media" />
              <input type="hidden" name="productId" value={product.id} />
              <div className="field field--wide">
                <AdminImageEditorInput
                  label="Fichier"
                  help="JPEG, PNG ou WebP · recadrez puis choisissez la définition finale"
                  required
                  defaultAspect="1:1"
                  defaultOutputWidth={1600}
                  dimensionFieldNames={{ width: "imageWidth", height: "imageHeight" }}
                />
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
