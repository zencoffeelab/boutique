import { describe, expect, it } from "vitest";
import { pickupPointIdSchema, professionalApplicationSchema, shippingAddressSchema, shippingQuoteSchema } from "~/domain/schemas";
import { EU_SHIPPING_COUNTRY_CODES } from "~/domain/shipping-countries";

describe("shipping countries", () => {
  it("accepts every EU destination and rejects unsupported countries", () => {
    const address = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "0600000000", line1: "1 Main Street", postalCode: "1000", city: "Capital" };
    expect(EU_SHIPPING_COUNTRY_CODES).toHaveLength(27);
    for (const countryCode of EU_SHIPPING_COUNTRY_CODES) expect(shippingAddressSchema.safeParse({ ...address, countryCode }).success).toBe(true);
    expect(shippingAddressSchema.safeParse({ ...address, countryCode: "US" }).success).toBe(false);
  });
});

describe("professional application", () => {
  const valid = { companyName: "Coffee Club", lastName: "Doe", firstName: "Jane", email: "jane@example.com", phone: "0600000000", businessType: "Coffee shop", monthlyVolume: "11-50 kg", locale: "fr-FR", privacyConsent: true };
  it("accepts every planned field and volume", () => expect(professionalApplicationSchema.safeParse(valid).success).toBe(true));
  it("rejects unknown business and volume values", () => expect(professionalApplicationSchema.safeParse({ ...valid, businessType: "Influencer", monthlyVolume: "500 kg" }).success).toBe(false));
  it("accepts the honeypot field so bots receive a neutral response", () => expect(professionalApplicationSchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(true));
});

describe("pickup-point checkout input", () => {
  it("accepts an official alphanumeric Colissimo point identifier", () => expect(pickupPointIdSchema.safeParse("850010").success).toBe(true));
  it("rejects identifiers containing separators or markup", () => {
    expect(pickupPointIdSchema.safeParse("FR-850010").success).toBe(false);
    expect(pickupPointIdSchema.safeParse("<script>").success).toBe(false);
  });
  it("keeps pickup selection optional for home delivery", () => {
    const parsed = shippingQuoteSchema.safeParse({ cartId: crypto.randomUUID(), locale: "fr-FR", lines: [{ productId: "product", variantId: "variant", audience: "retail", quantity: 1 }], address: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "0600000000", line1: "1 rue du Café", postalCode: "37000", city: "Tours", countryCode: "FR" } });
    expect(parsed.success).toBe(true);
  });
});
