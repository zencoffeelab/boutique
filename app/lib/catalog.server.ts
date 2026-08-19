import {
  demoArticles,
  demoPackagingPresets,
  demoProducts,
} from "~/data/demo-catalog";
import type {
  AdviceArticle,
  Audience,
  Locale,
  PackagingPreset,
  Product,
  ResolvedCartLine,
} from "~/domain/types";
import { env, hasSupabaseConfig } from "./env.server";
import { mapPublicMediaUrls, publicMediaDeliveryUrl } from "./public-media";
import { createPublicSupabase, createServiceSupabase } from "./supabase.server";
import { paragraphsToRichTextDocument, parseRichTextInput, richTextPlainText, storedBlocksToRichTextDocument } from "./rich-text";

const editorialArticleSummaries: Record<string, Record<"fr-FR" | "en-GB", string>> = {
  "recette-d-extraction-pour-v60-zen-coffee-lab-torrefacteur-de-cafes-de-specialite-en-france": {
    "fr-FR": "Nous partageons avec vous deux recettes que nous utilisons au V60, avec nos repères de mouture, 12 g de café lavé ou 13,5 g de café nature, 200 ml d’eau à 91–93 °C et un versement en plusieurs étapes.",
    "en-GB": "We use two V60 recipes ourselves and share them here, with our grind settings, 12 g of washed coffee or 13.5 g of natural coffee, 200 ml of water at 91–93°C and a staged pour.",
  },
  "de-l-importance-de-l-eau-zen-coffee-lab-torrefacteur-de-cafes-de-specialite-en-france": {
    "fr-FR": "Nous parlons d’un élément souvent oublié : l’eau, qui compose 98 à 99 % de la tasse. Sa minéralité, sa dureté et son pH peuvent changer l’acidité et les arômes ; une eau agréable à boire n’est pas forcément la meilleure pour le café.",
    "en-GB": "We look at something that is often overlooked: water, which makes up 98–99% of the cup. Its minerals, hardness and pH can change acidity and flavour, and water that tastes good on its own is not always best for coffee.",
  },
};

function isMissingRibbonColumnError(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && /ribbon_(new|back_soon)/.test(error.message ?? ""));
}

function mapDatabaseProduct(row: any): Product {
  const stockOnHandGrams = Number(row.stock_on_hand_grams ?? (row.product_variants ?? []).reduce((total: number, variant: any) => total + Number(variant.stock_on_hand ?? 0) * Number(variant.weight_grams ?? 0), 0));
  const stockReservedGrams = Number(row.stock_reserved_grams ?? (row.product_variants ?? []).reduce((total: number, variant: any) => total + Number(variant.stock_reserved ?? 0) * Number(variant.weight_grams ?? 0), 0));
  const lowStockThresholdGrams = Number(row.low_stock_threshold_grams ?? (row.product_variants ?? []).reduce((total: number, variant: any) => total + Number(variant.low_stock_threshold ?? 0) * Number(variant.weight_grams ?? 0), 0));
  const translations = Object.fromEntries(
    row.product_translations.map((translation: any) => [
      translation.locale,
      {
        locale: translation.locale,
        name: translation.name,
        shortDescription: translation.short_description,
        body: translation.body,
        producer: translation.producer,
        region: translation.region,
        variety: translation.variety,
        process: translation.process,
        tastingNotes: translation.tasting_notes ?? [],
        seoTitle: translation.seo_title,
        seoDescription: translation.seo_description,
        focusKeyphrase: translation.focus_keyphrase ?? "",
      },
    ]),
  ) as Product["translations"];
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    altitudeMeters: row.altitude_meters,
    featured: row.featured,
    ribbonNew: Boolean(row.ribbon_new),
    ribbonBackSoon: Boolean(row.ribbon_back_soon),
    professionalEnabled: row.professional_enabled ?? false,
    professionalStockKg: Number(row.professional_stock_kg ?? 0),
    professionalStockReservedKg: Number(row.professional_stock_reserved_kg ?? 0),
    thumbnailLabelUrl: row.thumbnail_label_public_url ? publicMediaDeliveryUrl(row.thumbnail_label_public_url) : null,
    thumbnailBackgroundColor: row.thumbnail_background_color ?? "#d9ddd3",
    hoverImageUrl: row.hover_image_public_url ? publicMediaDeliveryUrl(row.hover_image_public_url) : null,
    translations,
    media: row.product_media
      .toSorted((a: any, b: any) => a.position - b.position)
      .map((media: any) => ({
        id: media.id,
        url: publicMediaDeliveryUrl(media.public_url),
        alt: { "fr-FR": media.alt_fr, "en-GB": media.alt_en },
        width: media.width,
        height: media.height,
        position: media.position,
      })),
    editorialBlocks: (row.product_editorial_blocks ?? [])
      .toSorted((a: any, b: any) => a.position - b.position)
      .map((block: any) => ({
        id: block.id,
        position: block.position,
        imageUrl: publicMediaDeliveryUrl(block.public_url),
        imageAlt: { "fr-FR": block.alt_fr, "en-GB": block.alt_en },
        title: { "fr-FR": block.title_fr, "en-GB": block.title_en },
        body: { "fr-FR": block.body_fr, "en-GB": block.body_en },
      })),
    extractionGuide: {
      title: {
        "fr-FR": "Notre recette d'extraction pour filtre/v60",
        "en-GB": "Our filter/V60 brewing recipe",
      },
      href: {
        "fr-FR": "/blog/recette-d-extraction-pour-v60-zen-coffee-lab-torrefacteur-de-cafes-de-specialite-en-france",
        "en-GB": "/en/blog/recette-d-extraction-pour-v60-zen-coffee-lab-torrefacteur-de-cafes-de-specialite-en-france",
      },
      label: { "fr-FR": "Lire le guide", "en-GB": "Read the guide" },
    },
    variants: row.product_variants.map((variant: any) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      weightGrams: variant.weight_grams,
      internalCostCents: variant.internal_cost_cents,
      stockOnHand: Math.floor(stockOnHandGrams / variant.weight_grams),
      stockReserved: Math.max(0, Math.floor(stockOnHandGrams / variant.weight_grams) - Math.floor(Math.max(0, stockOnHandGrams - stockReservedGrams) / variant.weight_grams)),
      lowStockThreshold: Math.floor(lowStockThresholdGrams / variant.weight_grams),
      hsCode: variant.hs_code,
      customsOriginCountry: variant.customs_origin_country,
      offers: variant.variant_offers.map((offer: any) => ({
        id: offer.id,
        audience: offer.audience,
        price: { amount: offer.price_cents, currency: "EUR" },
        minimumQuantity: offer.minimum_quantity,
        active: offer.active,
      })),
    })),
    stockOnHandGrams,
    stockReservedGrams,
    lowStockThresholdGrams,
  };
}

async function databaseProducts(includeDrafts = false): Promise<Product[]> {
  const client = includeDrafts ? createServiceSupabase() : (createPublicSupabase() ?? createServiceSupabase());
  if (!client) throw new Error("Supabase service configuration is incomplete.");
  const statuses = includeDrafts
    ? ["draft", "published", "archived"]
    : ["published", "archived"];
  let { data, error } = await client
    .from("products")
    .select(
      `
      id, slug, status, display_order, altitude_meters, featured, ribbon_new, ribbon_back_soon, professional_enabled, professional_stock_kg, professional_stock_reserved_kg, stock_on_hand_grams, stock_reserved_grams, low_stock_threshold_grams,
      thumbnail_label_public_url, thumbnail_background_color, hover_image_public_url,
      product_translations(*),
      product_media(*),
      product_editorial_blocks(*),
      product_variants(*, variant_offers(*))
    `,
    )
    .in("status", statuses)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (isMissingRibbonColumnError(error)) {
    const compatibleResult = await client
      .from("products")
      .select(`
        id, slug, status, display_order, altitude_meters, featured, professional_enabled, professional_stock_kg, professional_stock_reserved_kg, stock_on_hand_grams, stock_reserved_grams, low_stock_threshold_grams,
        thumbnail_label_public_url, thumbnail_background_color, hover_image_public_url,
        product_translations(*),
        product_media(*),
        product_editorial_blocks(*),
        product_variants(*, variant_offers(*))
      `)
      .in("status", statuses)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (compatibleResult.error) throw new Error(`Unable to load catalog: ${compatibleResult.error.message}`);
    return (compatibleResult.data ?? []).map(mapDatabaseProduct);
  }
  if (error?.code === "42703" && error.message.includes("display_order")) {
    const compatibleResult = await client
      .from("products")
      .select(`
        id, slug, status, altitude_meters, featured, ribbon_new, ribbon_back_soon, professional_enabled, professional_stock_kg, professional_stock_reserved_kg, stock_on_hand_grams, stock_reserved_grams, low_stock_threshold_grams,
        thumbnail_label_public_url, thumbnail_background_color, hover_image_public_url,
        product_translations(*),
        product_media(*),
        product_editorial_blocks(*),
        product_variants(*, variant_offers(*))
      `)
      .in("status", statuses)
      .order("created_at", { ascending: false });
    if (compatibleResult.error) throw new Error(`Unable to load catalog: ${compatibleResult.error.message}`);
    return (compatibleResult.data ?? []).map(mapDatabaseProduct);
  }
  if (error?.code === "42703" && error.message.includes("hover_image_")) {
    const compatibleResult = await client
      .from("products")
      .select(`
        id, slug, status, display_order, altitude_meters, featured, ribbon_new, ribbon_back_soon, professional_enabled, professional_stock_kg, professional_stock_reserved_kg, stock_on_hand_grams, stock_reserved_grams, low_stock_threshold_grams,
        thumbnail_label_public_url, thumbnail_background_color,
        product_translations(*),
        product_media(*),
        product_editorial_blocks(*),
        product_variants(*, variant_offers(*))
      `)
      .in("status", statuses)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (compatibleResult.error) throw new Error(`Unable to load catalog: ${compatibleResult.error.message}`);
    return (compatibleResult.data ?? []).map(mapDatabaseProduct);
  }
  if (error?.code === "42703" && error.message.includes("thumbnail_")) {
    const compatibleResult = await client
      .from("products")
      .select(`
        id, slug, status, altitude_meters, featured, ribbon_new, ribbon_back_soon, professional_enabled, professional_stock_kg, professional_stock_reserved_kg, stock_on_hand_grams, stock_reserved_grams, low_stock_threshold_grams,
        product_translations(*),
        product_media(*),
        product_editorial_blocks(*),
        product_variants(*, variant_offers(*))
      `)
      .in("status", statuses)
      .order("created_at", { ascending: false });
    if (compatibleResult.error) throw new Error(`Unable to load catalog: ${compatibleResult.error.message}`);
    return (compatibleResult.data ?? []).map(mapDatabaseProduct);
  }
  if (error?.code === "42703" && error.message.includes("professional_")) {
    const legacyResult = await client
      .from("products")
      .select(`
        id, slug, status, display_order, altitude_meters, featured,
        product_translations(*),
        product_media(*),
        product_editorial_blocks(*),
        product_variants(*, variant_offers(*))
      `)
      .in("status", statuses)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (legacyResult.error) throw new Error(`Unable to load catalog: ${legacyResult.error.message}`);
    return (legacyResult.data ?? []).map(mapDatabaseProduct);
  }
  if (error?.code === "42703" && error.message.includes("stock_on_hand_grams")) {
    const legacyResult = await client
      .from("products")
      .select(`
        id, slug, status, display_order, altitude_meters, featured, ribbon_new, ribbon_back_soon, professional_enabled, professional_stock_kg, professional_stock_reserved_kg,
        thumbnail_label_public_url, thumbnail_background_color, hover_image_public_url,
        product_translations(*),
        product_media(*),
        product_editorial_blocks(*),
        product_variants(*, variant_offers(*))
      `)
      .in("status", statuses)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (legacyResult.error) throw new Error(`Unable to load catalog: ${legacyResult.error.message}`);
    return (legacyResult.data ?? []).map(mapDatabaseProduct);
  }
  if (error) throw new Error(`Unable to load catalog: ${error.message}`);
  return (data ?? []).map(mapDatabaseProduct);
}

function applyDemoStockModel(product: Product): Product {
  const availableGrams = Math.max(0, product.stockOnHandGrams - product.stockReservedGrams);
  return { ...product, variants: product.variants.map((variant) => ({ ...variant, stockOnHand: Math.floor(product.stockOnHandGrams / variant.weightGrams), stockReserved: Math.max(0, Math.floor(product.stockOnHandGrams / variant.weightGrams) - Math.floor(availableGrams / variant.weightGrams)), lowStockThreshold: Math.floor(product.lowStockThresholdGrams / variant.weightGrams) })) };
}

async function getRawProducts(): Promise<Product[]> {
  if (!hasSupabaseConfig()) {
    if (env().ALLOW_DEMO_DATA) return demoProducts.map(applyDemoStockModel);
    throw new Error("Catalog database is not configured.");
  }
  try {
    return await databaseProducts();
  } catch (error) {
    if (env().ALLOW_DEMO_DATA) return demoProducts.map(applyDemoStockModel);
    throw error;
  }
}

export function hasPurchasableVariant(
  product: Product,
  audience: Audience,
): boolean {
  return product.variants.some((variant) => {
    const availableStock = variant.stockOnHand - variant.stockReserved;
    return variant.offers.some(
      (offer) =>
        offer.audience === audience &&
        offer.active &&
        availableStock >= offer.minimumQuantity,
    );
  });
}

function safeProductProjection(
  product: Product,
  audience: Audience,
  availableOnly = false,
): Product {
  return {
    ...product,
    variants: product.variants
      .map((variant) => ({
        ...variant,
        internalCostCents: 0,
        offers: variant.offers.filter(
          (offer) => offer.audience === audience && offer.active,
        ),
      }))
      .filter(
        (variant) =>
          variant.offers.length > 0 &&
          (!availableOnly ||
            variant.offers.some(
              (offer) =>
                variant.stockOnHand - variant.stockReserved >=
                offer.minimumQuantity,
            )),
      ),
  };
}

export async function getProducts(
  options: {
    status?: "published" | "archived";
    audience?: Audience;
    availableOnly?: boolean;
  } = {},
): Promise<Product[]> {
  const audience = options.audience ?? "retail";
  const products = await getRawProducts();
  return products
    .filter((product) =>
      options.status ? product.status === options.status : true,
    )
    .map((product) =>
      safeProductProjection(product, audience, options.availableOnly),
    )
    .filter((product) => !options.availableOnly || product.variants.length > 0);
}

export async function getAdminProducts(): Promise<Product[]> {
  const products = hasSupabaseConfig()
    ? await databaseProducts(true)
    : await getRawProducts();
  return products.map((product) => ({
    ...product,
    variants: product.variants.filter((variant) =>
      variant.offers.some((offer) => offer.active),
    ),
  }));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return (await getProducts()).find((product) => product.slug === slug) ?? null;
}

export async function getPackagingPresets(): Promise<PackagingPreset[]> {
  if (!hasSupabaseConfig()) return demoPackagingPresets;
  const client = createServiceSupabase();
  if (!client) throw new Error("Supabase service configuration is incomplete.");
  const { data, error } = await client
    .from("packaging_presets")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(`Unable to load packaging: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    maxNetWeightGrams: row.max_net_weight_grams,
    tareWeightGrams: row.tare_weight_grams,
    lengthCm: row.length_cm,
    widthCm: row.width_cm,
    heightCm: row.height_cm,
    active: row.active,
  }));
}

export async function getArticles(options: { includeUnpublished?: boolean } = {}): Promise<AdviceArticle[]> {
  if (!hasSupabaseConfig()) return demoArticles;
  const client = options.includeUnpublished ? createServiceSupabase() : (createPublicSupabase() ?? createServiceSupabase());
  if (!client) throw new Error("Supabase service configuration is incomplete.");
  let query = client
    .from("advice_articles")
    .select(
      "slug,pinned,published_at,advice_translations(locale,title,excerpt,blocks)",
    );
  if (!options.includeUnpublished) query = query.eq("status", "published");
  const { data, error } = await query.order("pinned", { ascending: false }).order("published_at", { ascending: false });
  if (error) {
    if (env().ALLOW_DEMO_DATA) return demoArticles;
    throw new Error(`Unable to load advice: ${error.message}`);
  }
  return (data ?? []).flatMap((article: any) => {
    const fr = article.advice_translations?.find(
      (item: any) => item.locale === "fr-FR",
    );
    const en = article.advice_translations?.find(
      (item: any) => item.locale === "en-GB",
    );
    if (!fr || !en) return [];
    const body = (translation: any) => storedBlocksToRichTextDocument(translation.blocks ?? []);
    const excerptBody = (translation: any) => parseRichTextInput(String(translation.excerpt ?? ""), 1) ?? paragraphsToRichTextDocument([String(translation.excerpt ?? "")]);
    const frenchExcerptBody = excerptBody(fr);
    const englishExcerptBody = excerptBody(en);
    const frenchBody = body(fr);
    const englishBody = body(en);
    const body2 = (translation: any) => {
      const layout = translation.blocks?.find((block: any) => block.type === "storyLayout")?.content ?? {};
      return layout.body2 ? storedBlocksToRichTextDocument([{ type: "richText", content: layout.body2 }]) : null;
    };
    const story = (translation: any) => {
      const layout = translation.blocks?.find((block: any) => block.type === "storyLayout")?.content ?? {};
      return mapPublicMediaUrls({ ...layout, layoutConfig: layout.layoutConfig, introImageUrl: layout.introImageUrl ?? layout.imageUrl, introImageAlt: layout.introImageAlt ?? layout.imageAlt, bodyImageUrl: layout.bodyImageUrl ?? layout.imageUrl, bodyImageAlt: layout.bodyImageAlt ?? layout.imageAlt, bodyImageFirst: layout.bodyImageFirst ?? layout.imageFirst });
    };
    return [
      {
        slug: article.slug,
        pinned: Boolean(article.pinned),
        publishedAt: article.published_at ?? new Date(0).toISOString(),
        title: { "fr-FR": fr.title, "en-GB": en.title },
        summary: editorialArticleSummaries[article.slug] ?? { "fr-FR": richTextPlainText(frenchExcerptBody), "en-GB": richTextPlainText(englishExcerptBody) },
        excerpt: editorialArticleSummaries[article.slug] ?? { "fr-FR": richTextPlainText(frenchExcerptBody), "en-GB": richTextPlainText(englishExcerptBody) },
        excerptBody: { "fr-FR": frenchExcerptBody, "en-GB": englishExcerptBody },
        body: { "fr-FR": frenchBody, "en-GB": englishBody },
        ...(body2(fr) && body2(en) ? { body2: { "fr-FR": body2(fr)!, "en-GB": body2(en)! } } : {}),
        story: { "fr-FR": story(fr), "en-GB": story(en) },
      },
    ];
  });
}

export async function resolveCartLines(
  lines: readonly {
    productId: string;
    variantId: string;
    audience: Audience;
    quantity: number;
  }[],
  locale: Locale,
  authorizedAudience: Audience,
): Promise<ResolvedCartLine[]> {
  const products = (await getRawProducts()).filter(
    (product) => product.status === "published",
  );
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  return lines.map((line) => {
    if (
      line.audience === "professional" &&
      authorizedAudience !== "professional"
    ) {
      throw new Response("Professional pricing requires an approved account.", {
        status: 403,
      });
    }
    const product = productsById.get(line.productId);
    const variant = product?.variants.find(
      (candidate) => candidate.id === line.variantId,
    );
    const offer = variant?.offers.find(
      (candidate) => candidate.audience === line.audience && candidate.active,
    );
    if (!product || !variant || !offer)
      throw new Response("A cart item is no longer available.", {
        status: 409,
      });
    if (line.quantity < offer.minimumQuantity)
      throw new Response("Minimum quantity not reached.", { status: 409 });
    const availableStock = variant.stockOnHand - variant.stockReserved;
    if (line.quantity > availableStock)
      throw new Response("Insufficient stock.", { status: 409 });
    return {
      ...line,
      productSlug: product.slug,
      productName: product.translations[locale].name,
      variantLabel: variant.label,
      unitPriceCents: offer.price.amount,
      unitCostCents: variant.internalCostCents,
      unitWeightGrams: variant.weightGrams,
      hsCode: variant.hsCode,
      customsOriginCountry: variant.customsOriginCountry,
      availableStock,
      imageUrl: product.media[0]?.url ?? "",
    };
  });
}
