import { describe, expect, it } from "vitest";
import { professionalApplicationSchema } from "~/domain/schemas";

describe("professional application", () => {
  const valid = { companyName: "Coffee Club", lastName: "Doe", firstName: "Jane", email: "jane@example.com", phone: "0600000000", businessType: "Coffee shop", monthlyVolume: "11-50 kg", locale: "fr-FR", privacyConsent: true };
  it("accepts every planned field and volume", () => expect(professionalApplicationSchema.safeParse(valid).success).toBe(true));
  it("rejects unknown business and volume values", () => expect(professionalApplicationSchema.safeParse({ ...valid, businessType: "Influencer", monthlyVolume: "500 kg" }).success).toBe(false));
  it("accepts the honeypot field so bots receive a neutral response", () => expect(professionalApplicationSchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(true));
});
