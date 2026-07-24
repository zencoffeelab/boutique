import type { Audience, CartLine, Product, ProductVariant, VariantOffer } from "~/domain/types";

export function buildProductCartLine({ product, variant, offer, audience, quantity }: { product: Product; variant: ProductVariant; offer: VariantOffer; audience: Audience; quantity: number }): CartLine {
  return {
    productId: product.id,
    variantId: variant.id,
    audience,
    quantity,
    preview: {
      productSlug: product.slug,
      productNames: { "fr-FR": product.translations["fr-FR"].name, "en-GB": product.translations["en-GB"].name },
      variantLabel: variant.label,
      unitPriceCents: offer.price.amount,
      imageUrl: product.media[0]?.url ?? "",
    },
  };
}
