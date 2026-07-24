export const locales = ["fr-FR", "en-GB"] as const;
export type Locale = (typeof locales)[number];

export const audiences = ["retail", "professional"] as const;
export type Audience = (typeof audiences)[number];

export const productStatuses = ["draft", "published", "archived"] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const professionalApplicationStatuses = [
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;
export type ProfessionalApplicationStatus =
  (typeof professionalApplicationStatuses)[number];

export const orderStatuses = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_to_ship",
  "shipped",
  "delivered",
  "canceled",
  "partially_refunded",
  "refunded",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export type Money = Readonly<{
  amount: number;
  currency: "EUR";
}>;

export type ProductTranslation = Readonly<{
  locale: Locale;
  name: string;
  shortDescription: string;
  body: string;
  producer: string;
  region: string;
  variety: string;
  process: string;
  tastingNotes: readonly string[];
  seoTitle: string;
  seoDescription: string;
}>;

export type ProductMedia = Readonly<{
  id: string;
  url: string;
  alt: Record<Locale, string>;
  width: number;
  height: number;
  position: number;
}>;

export type VariantOffer = Readonly<{
  id: string;
  audience: Audience;
  price: Money;
  minimumQuantity: number;
  active: boolean;
}>;

export type ProductVariant = Readonly<{
  id: string;
  sku: string;
  label: string;
  weightGrams: number;
  internalCostCents: number;
  stockOnHand: number;
  stockReserved: number;
  lowStockThreshold: number;
  hsCode: string;
  customsOriginCountry: string;
  offers: readonly VariantOffer[];
}>;

export type Product = Readonly<{
  id: string;
  slug: string;
  status: ProductStatus;
  altitudeMeters: number;
  featured: boolean;
  translations: Record<Locale, ProductTranslation>;
  media: readonly ProductMedia[];
  variants: readonly ProductVariant[];
}>;

export type CartLine = Readonly<{
  productId: string;
  variantId: string;
  audience: Audience;
  quantity: number;
}>;

export type ResolvedCartLine = CartLine &
  Readonly<{
    productSlug: string;
    productName: string;
    variantLabel: string;
    unitPriceCents: number;
    unitCostCents: number;
    unitWeightGrams: number;
    hsCode: string;
    customsOriginCountry: string;
    availableStock: number;
    imageUrl: string;
  }>;

export type PackagingPreset = Readonly<{
  id: string;
  name: string;
  maxNetWeightGrams: number;
  tareWeightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  active: boolean;
}>;

export type PackedParcel = Readonly<{
  presetId: string;
  presetName: string;
  netWeightGrams: number;
  shippingWeightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  lines: readonly Readonly<{
    variantId: string;
    quantity: number;
    unitWeightGrams: number;
  }>[];
}>;

export type PickupPoint = Readonly<{
  id: string;
  name: string;
  address1: string;
  address2: string;
  address3: string;
  postalCode: string;
  city: string;
  countryCode: string;
  type: string;
  network: string;
  locationHint: string;
  distanceMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  accessible: boolean;
  maxWeightGrams: number | null;
}>;

export type ShippingRate = Readonly<{
  id: string;
  provider: "sendcloud" | "shippo" | "mock";
  carrier: string;
  service: string;
  deliveryMethod: "home" | "pickup";
  pickupPoint?: PickupPoint;
  amountCents: number;
  currency: "EUR";
  estimatedDays: number | null;
  freeShippingApplied: boolean;
  signatureRequired?: boolean;
}>;

export type AdviceArticle = Readonly<{
  slug: string;
  publishedAt: string;
  title: Record<Locale, string>;
  excerpt: Record<Locale, string>;
  body: Record<Locale, readonly string[]>;
}>;
