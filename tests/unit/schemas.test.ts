import { describe, expect, it } from "vitest";
import { checkoutSchema, contactFormSchema, pickupPointIdSchema, professionalApplicationSchema, shippingAddressSchema, shippingQuoteSchema } from "~/domain/schemas";
import { EU_SHIPPING_COUNTRY_CODES, NON_EU_SHIPPING_COUNTRY_CODES, SHIPPING_COUNTRY_CODES, shippingCountryLabel } from "~/domain/shipping-countries";

describe("shipping countries", () => {
  it("accepts every EU destination and rejects unsupported countries", () => {
    const address = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "0600000000", line1: "1 Main Street", postalCode: "1000", city: "Capital" };
    expect(EU_SHIPPING_COUNTRY_CODES).toHaveLength(27);
    expect(SHIPPING_COUNTRY_CODES).toHaveLength(31);
    for (const countryCode of EU_SHIPPING_COUNTRY_CODES) expect(shippingAddressSchema.safeParse({ ...address, countryCode }).success).toBe(true);
    expect(NON_EU_SHIPPING_COUNTRY_CODES).toEqual(["LI", "NO", "GB", "CH"]);
    for (const countryCode of NON_EU_SHIPPING_COUNTRY_CODES) expect(shippingAddressSchema.safeParse({ ...address, countryCode }).success).toBe(true);
    expect(shippingAddressSchema.safeParse({ ...address, countryCode: "US" }).success).toBe(false);
  });

  it("lists EU destinations alphabetically by their French names", () => {
    const names = EU_SHIPPING_COUNTRY_CODES.map((countryCode) => shippingCountryLabel(countryCode, "fr-FR"));
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right, "fr-FR")));
    expect(names[0]).toBe("Allemagne");
    const outsideEuNames = NON_EU_SHIPPING_COUNTRY_CODES.map((countryCode) => shippingCountryLabel(countryCode, "fr-FR"));
    expect(outsideEuNames).toEqual(["Liechtenstein", "Norvège", "Royaume-Uni", "Suisse"]);
  });
});

describe("professional application", () => {
  const valid = { companyName: "Coffee Club", countryCode: "FR", lastName: "Doe", firstName: "Jane", email: "jane@example.com", phone: "0600000000", businessType: "Coffee shop", monthlyVolume: "11-50 kg", locale: "fr-FR", privacyConsent: true };
  it("accepts every planned field and volume", () => expect(professionalApplicationSchema.safeParse(valid).success).toBe(true));
  it("rejects unknown business and volume values", () => expect(professionalApplicationSchema.safeParse({ ...valid, businessType: "Influencer", monthlyVolume: "500 kg" }).success).toBe(false));
  it("accepts the honeypot field so bots receive a neutral response", () => expect(professionalApplicationSchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(true));
});

describe("customer account at checkout", () => {
  const checkout = {
    cartId: "00000000-0000-4000-8000-000000000001",
    locale: "fr-FR" as const,
    lines: [{ productId: "product", variantId: "variant", audience: "retail" as const, quantity: 1 }],
    address: { firstName: "Ada", lastName: "Lovelace", company: "", email: "ada@example.com", phone: "0600000000", line1: "1 rue du Café", line2: "", postalCode: "37000", city: "Tours", countryCode: "FR" as const },
    shippingRateId: "sendcloud:rate",
    acceptTerms: true as const,
  };

  it("accepts guest checkout without creating an account", () => {
    expect(checkoutSchema.safeParse(checkout).success).toBe(true);
  });

  it("requires a strong password when account creation is selected", () => {
    expect(checkoutSchema.safeParse({ ...checkout, createAccount: true, accountPassword: "short" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...checkout, createAccount: true, accountPassword: "long-password" }).success).toBe(true);
  });
});

describe("contact form", () => {
  const message = { name: "Ada Lovelace", email: "ada@example.com", phone: "", subject: "coffee" as const, message: "Bonjour, je souhaite en savoir plus.", locale: "fr-FR" as const, privacyConsent: true as const, website: "" };

  it("accepts a complete contact request", () => {
    expect(contactFormSchema.safeParse(message).success).toBe(true);
  });

  it("rejects a short message or missing consent", () => {
    expect(contactFormSchema.safeParse({ ...message, message: "Bonjour" }).success).toBe(false);
    expect(contactFormSchema.safeParse({ ...message, privacyConsent: false }).success).toBe(false);
  });
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
