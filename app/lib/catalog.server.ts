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
import { createServiceSupabase } from "./supabase.server";
import { paragraphsToRichTextDocument, parseRichTextInput, richTextPlainText, storedBlocksToRichTextDocument, synchronizeRichTextLayout } from "./rich-text";

function mapDatabaseProduct(row: any): Product {
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
    variants: row.product_variants.map((variant: any) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      weightGrams: variant.weight_grams,
      internalCostCents: variant.internal_cost_cents,
      stockOnHand: variant.stock_on_hand,
      stockReserved: variant.stock_reserved,
      lowStockThreshold: variant.low_stock_threshold,
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
  };
}

async function databaseProducts(includeDrafts = false): Promise<Product[]> {
  const client = createServiceSupabase();
  if (!client) throw new Error("Supabase service configuration is incomplete.");
  const statuses = includeDrafts
    ? ["draft", "published", "archived"]
    : ["published", "archived"];
  let { data, error } = await client
    .from("products")
    .select(
      `
      id, slug, status, display_order, altitude_meters, featured, professional_enabled, professional_stock_kg, professional_stock_reserved_kg,
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
  if (error?.code === "42703" && error.message.includes("display_order")) {
    const compatibleResult = await client
      .from("products")
      .select(`
        id, slug, status, altitude_meters, featured, professional_enabled, professional_stock_kg, professional_stock_reserved_kg,
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
        id, slug, status, display_order, altitude_meters, featured, professional_enabled, professional_stock_kg, professional_stock_reserved_kg,
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
        id, slug, status, altitude_meters, featured, professional_enabled, professional_stock_kg, professional_stock_reserved_kg,
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
  if (error) throw new Error(`Unable to load catalog: ${error.message}`);
  return (data ?? []).map(mapDatabaseProduct);
}

async function getRawProducts(): Promise<Product[]> {
  const products = hasSupabaseConfig()
    ? await databaseProducts()
    : env().ALLOW_DEMO_DATA
      ? demoProducts
      : (() => {
          throw new Error("Catalog database is not configured.");
        })();
  return products;
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
  const client = createServiceSupabase();
  if (!client) throw new Error("Supabase service configuration is incomplete.");
  let query = client
    .from("advice_articles")
    .select(
      "slug,published_at,advice_translations(locale,title,excerpt,blocks)",
    );
  if (!options.includeUnpublished) query = query.eq("status", "published");
  const { data, error } = await query.order("published_at", { ascending: false });
  if (error) throw new Error(`Unable to load advice: ${error.message}`);
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
    const englishExcerptBody = synchronizeRichTextLayout(frenchExcerptBody, excerptBody(en));
    const frenchBody = body(fr);
    const englishBody = synchronizeRichTextLayout(frenchBody, body(en));
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
        publishedAt: article.published_at ?? new Date(0).toISOString(),
        title: { "fr-FR": fr.title, "en-GB": en.title },
        excerpt: { "fr-FR": richTextPlainText(frenchExcerptBody), "en-GB": richTextPlainText(englishExcerptBody) },
        excerptBody: { "fr-FR": frenchExcerptBody, "en-GB": englishExcerptBody },
        body: { "fr-FR": frenchBody, "en-GB": englishBody },
        ...(body2(fr) && body2(en) ? { body2: { "fr-FR": body2(fr)!, "en-GB": synchronizeRichTextLayout(body2(fr)!, body2(en)!) } } : {}),
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
