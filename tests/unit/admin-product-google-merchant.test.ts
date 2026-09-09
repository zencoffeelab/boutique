import { describe, expect, it } from "vitest";
import { googleMerchantXml } from "~/routes/admin-product";

describe("Google Merchant product XML", () => {
  it("exports direct image files in thumbnail, hover, then gallery order", () => {
    const xml = googleMerchantXml({
      slug: "kenya-nyeri",
      media: [{ id: "media-1", url: "/media/storage/product-media/kenya-diagram.jpg", alt: { "fr-FR": "", "en-GB": "" }, width: 1000, height: 1000, position: 1 }],
      hoverImageUrl: "/media/storage/product-media/kenya-hover.jpg",
      thumbnailLabelUrl: "/media/storage/product-media/kenya-thumbnail.png",
      translations: {
        "fr-FR": { locale: "fr-FR", name: "Kenya Nyeri", shortDescription: "Café de spécialité", body: "", producer: "", region: "", variety: "", process: "", tastingNotes: [], seoTitle: "", seoDescription: "", focusKeyphrase: "" },
        "en-GB": { locale: "en-GB", name: "Kenya Nyeri", shortDescription: "", body: "", producer: "", region: "", variety: "", process: "", tastingNotes: [], seoTitle: "", seoDescription: "", focusKeyphrase: "" },
      },
      variants: [{ id: "variant-1", sku: "KEN-250", label: "250 g", weightGrams: 250, internalCostCents: 0, stockOnHand: 3, stockReserved: 0, lowStockThreshold: 0, hsCode: "090111", customsOriginCountry: "KE", offers: [{ id: "offer-1", audience: "retail", price: { amount: 1590, currency: "EUR" }, minimumQuantity: 1, active: true }] }],
    });

    expect(xml).toContain("<g:image_link>https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/kenya-thumbnail.png</g:image_link>");
    expect(xml).toContain("<g:additional_image_link>https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/kenya-hover.jpg</g:additional_image_link>");
    expect(xml).toContain("<g:additional_image_link>https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/kenya-diagram.jpg</g:additional_image_link>");
    expect(xml.indexOf("kenya-thumbnail.png")).toBeLessThan(xml.indexOf("kenya-hover.jpg"));
    expect(xml.indexOf("kenya-hover.jpg")).toBeLessThan(xml.indexOf("kenya-diagram.jpg"));
    expect(xml).toContain("<g:shipping_weight>250 g</g:shipping_weight>");
    expect(xml).toContain("<g:unit_pricing_measure>250 g</g:unit_pricing_measure>");
    expect(xml).toContain("<g:unit_pricing_base_measure>1 kg</g:unit_pricing_base_measure>");
  });

  it("skips a malformed image and uses the next available image", () => {
    const xml = googleMerchantXml({
      slug: "kenya-nyeri",
      media: [{ id: "media-1", url: "ftp://invalid.example/coffee.jpg", alt: { "fr-FR": "", "en-GB": "" }, width: 1000, height: 1000, position: 1 }],
      hoverImageUrl: "/media/storage/product-media/kenya-hover.jpg",
      thumbnailLabelUrl: null,
      translations: {
        "fr-FR": { locale: "fr-FR", name: "Kenya Nyeri", shortDescription: "Café de spécialité", body: "", producer: "", region: "", variety: "", process: "", tastingNotes: [], seoTitle: "", seoDescription: "", focusKeyphrase: "" },
        "en-GB": { locale: "en-GB", name: "Kenya Nyeri", shortDescription: "", body: "", producer: "", region: "", variety: "", process: "", tastingNotes: [], seoTitle: "", seoDescription: "", focusKeyphrase: "" },
      },
      variants: [{ id: "variant-1", sku: "KEN-250", label: "250 g", weightGrams: 250, internalCostCents: 0, stockOnHand: 3, stockReserved: 0, lowStockThreshold: 0, hsCode: "090111", customsOriginCountry: "KE", offers: [{ id: "offer-1", audience: "retail", price: { amount: 1590, currency: "EUR" }, minimumQuantity: 1, active: true }] }],
    });

    expect(xml).toContain("<g:image_link>https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/kenya-hover.jpg</g:image_link>");
  });
});
