import { demoArticles, demoPackagingPresets, demoProducts } from "~/data/demo-catalog";
import type { AdviceArticle, Audience, Locale, PackagingPreset, Product, ResolvedCartLine } from "~/domain/types";
import { env, hasSupabaseConfig } from "./env.server";
import { createServiceSupabase } from "./supabase.server";

function mapDatabaseProduct(row: any): Product {
  const translations = Object.fromEntries(
    row.product_translations.map((translation: any) => [translation.locale, {
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
    }]),
  ) as Product["translations"];
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    altitudeMeters: row.altitude_meters,
    featured: row.featured,
    translations,
    media: row.product_media
      .toSorted((a: any, b: any) => a.position - b.position)
      .map((media: any) => ({
        id: media.id,
        url: media.public_url,
        alt: { "fr-FR": media.alt_fr, "en-GB": media.alt_en },
        width: media.width,
        height: media.height,
        position: media.position,
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
  const { data, error } = await client
    .from("products")
    .select(`
      id, slug, status, altitude_meters, featured,
      product_translations(*),
      product_media(*),
      product_variants(*, variant_offers(*))
    `)
    .in("status", includeDrafts ? ["draft", "published", "archived"] : ["published", "archived"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load catalog: ${error.message}`);
  return (data ?? []).map(mapDatabaseProduct);
}

async function getRawProducts(): Promise<Product[]> {
  const products = hasSupabaseConfig()
    ? await databaseProducts()
    : env().ALLOW_DEMO_DATA
      ? demoProducts
      : (() => { throw new Error("Catalog database is not configured."); })();
  return products;
}

export function hasPurchasableVariant(product: Product, audience: Audience): boolean {
  return product.variants.some((variant) => {
    const availableStock = variant.stockOnHand - variant.stockReserved;
    return variant.offers.some((offer) => offer.audience === audience && offer.active && availableStock >= offer.minimumQuantity);
  });
}

function safeProductProjection(product: Product, audience: Audience, availableOnly = false): Product {
  return {
    ...product,
    variants: product.variants
      .map((variant) => ({
        ...variant,
        internalCostCents: 0,
        offers: variant.offers.filter((offer) => offer.audience === audience && offer.active),
      }))
      .filter((variant) => variant.offers.length > 0 && (!availableOnly || variant.offers.some((offer) => variant.stockOnHand - variant.stockReserved >= offer.minimumQuantity))),
  };
}

export async function getProducts(options: { status?: "published" | "archived"; audience?: Audience; availableOnly?: boolean } = {}): Promise<Product[]> {
  const audience = options.audience ?? "retail";
  const products = await getRawProducts();
  return products
    .filter((product) => options.status ? product.status === options.status : true)
    .map((product) => safeProductProjection(product, audience, options.availableOnly))
    .filter((product) => !options.availableOnly || product.variants.length > 0);
}

export async function getAdminProducts(): Promise<Product[]> {
  if (hasSupabaseConfig()) return databaseProducts(true);
  return getRawProducts();
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return (await getProducts()).find((product) => product.slug === slug) ?? null;
}

export async function getPackagingPresets(): Promise<PackagingPreset[]> {
  if (!hasSupabaseConfig()) return demoPackagingPresets;
  const client = createServiceSupabase();
  if (!client) throw new Error("Supabase service configuration is incomplete.");
  const { data, error } = await client.from("packaging_presets").select("*").eq("active", true);
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

export async function getArticles(): Promise<AdviceArticle[]> {
  if (!hasSupabaseConfig()) return demoArticles;
  const client = createServiceSupabase(); if (!client) throw new Error("Supabase service configuration is incomplete.");
  const { data, error } = await client.from("advice_articles").select("slug,published_at,advice_translations(locale,title,excerpt,blocks)").eq("status", "published").order("published_at", { ascending: false });
  if (error) throw new Error(`Unable to load advice: ${error.message}`);
  return (data ?? []).flatMap((article: any) => {
    const fr = article.advice_translations?.find((item: any) => item.locale === "fr-FR"); const en = article.advice_translations?.find((item: any) => item.locale === "en-GB"); if (!fr || !en) return [];
    const paragraphs = (translation: any) => (translation.blocks ?? []).filter((block: any) => block.type === "paragraph").map((block: any) => String(block.content));
    return [{ slug: article.slug, publishedAt: article.published_at ?? new Date(0).toISOString(), title: { "fr-FR": fr.title, "en-GB": en.title }, excerpt: { "fr-FR": fr.excerpt, "en-GB": en.excerpt }, body: { "fr-FR": paragraphs(fr), "en-GB": paragraphs(en) } }];
  });
}

export async function resolveCartLines(
  lines: readonly { productId: string; variantId: string; audience: Audience; quantity: number }[],
  locale: Locale,
  authorizedAudience: Audience,
): Promise<ResolvedCartLine[]> {
  const products = (await getRawProducts()).filter((product) => product.status === "published");
  const productsById = new Map(products.map((product) => [product.id, product]));
  return lines.map((line) => {
    if (line.audience === "professional" && authorizedAudience !== "professional") {
      throw new Response("Professional pricing requires an approved account.", { status: 403 });
    }
    const product = productsById.get(line.productId);
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
    const offer = variant?.offers.find((candidate) => candidate.audience === line.audience && candidate.active);
    if (!product || !variant || !offer) throw new Response("A cart item is no longer available.", { status: 409 });
    if (line.quantity < offer.minimumQuantity) throw new Response("Minimum quantity not reached.", { status: 409 });
    const availableStock = variant.stockOnHand - variant.stockReserved;
    if (line.quantity > availableStock) throw new Response("Insufficient stock.", { status: 409 });
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
