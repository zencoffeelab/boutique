import { z } from "zod";

export const audienceSchema = z.enum(["retail", "professional"]);

export const cartLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  audience: audienceSchema,
  quantity: z.coerce.number().int().min(1).max(100),
});

export const shippingAddressSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  company: z.string().trim().max(120).optional().default(""),
  email: z.email(),
  phone: z.string().trim().min(6).max(30),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional().default(""),
  postalCode: z.string().trim().min(2).max(20),
  city: z.string().trim().min(1).max(100),
  countryCode: z.enum([
    "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GB", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL",
    "PL", "PT", "RO", "SE", "SI", "SK",
  ]),
});

export const shippingQuoteSchema = z.object({
  cartId: z.uuid(),
  locale: z.enum(["fr-FR", "en-GB"]),
  lines: z.array(cartLineSchema).min(1).max(100),
  address: shippingAddressSchema,
});

export const checkoutSchema = shippingQuoteSchema.extend({
  shippingRateId: z.string().min(1),
  acceptTerms: z.literal(true),
});

export const professionalApplicationSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  lastName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  email: z.email(),
  phone: z.string().trim().min(6).max(30),
  businessType: z.enum(["Coffee shop", "Restaurant", "Revendeur", "Distributeur", "Autre"]),
  monthlyVolume: z.enum(["1-10 kg", "11-50 kg", "51-100 kg", "100+ kg"]),
  locale: z.enum(["fr-FR", "en-GB"]),
  privacyConsent: z.literal(true),
  website: z.string().max(500).optional(),
});

export const professionalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "suspended"]),
  note: z.string().trim().max(1_000).optional().default(""),
});

export const refundSchema = z.object({
  amountCents: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
