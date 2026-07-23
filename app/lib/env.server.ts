import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VITE_SITE_URL: z.url().default("http://localhost:5173"),
  VITE_GA_MEASUREMENT_ID: z.string().optional(),
  VITE_SUPABASE_URL: z.string().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  SHIPPO_API_TOKEN: z.string().optional(),
  SHIPPO_WEBHOOK_SECRET: z.string().optional(),
  SENDCLOUD_PUBLIC_KEY: z.string().optional(),
  SENDCLOUD_SECRET_KEY: z.string().optional(),
  SENDCLOUD_WEBHOOK_SECRET: z.string().optional(),
  SENDCLOUD_SHIPPING_METHOD_ID: z.coerce.number().int().positive().optional(),
  SENDCLOUD_SHIPPING_METHODS: z.string().optional().default("{}"),
  COLISSIMO_PICKUP_API_KEY: z.string().optional(),
  COLISSIMO_PICKUP_PARTNER_CLIENT_CODE: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{6}$/).optional()),
  FREE_SHIPPING_FR_CENTS: z.coerce.number().int().nonnegative().default(7_500),
  FREE_SHIPPING_EU_UK_CENTS: z.coerce.number().int().nonnegative().default(15_000),
  SHIP_FROM_NAME: z.string().default("Zen Coffee Lab"),
  SHIP_FROM_COMPANY: z.string().default("Zen Coffee Lab"),
  SHIP_FROM_STREET1: z.string().optional(),
  SHIP_FROM_STREET2: z.string().optional(),
  SHIP_FROM_CITY: z.string().default("Tours"),
  SHIP_FROM_POSTAL_CODE: z.string().optional(),
  SHIP_FROM_COUNTRY: z.string().default("FR"),
  SHIP_FROM_PHONE: z.string().optional(),
  SHIP_FROM_EMAIL: z.email().default("contact@zencoffeelab.com"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Zen Coffee Lab <commandes@zencoffeelab.com>"),
  ADMIN_NOTIFICATION_EMAIL: z.email().default("contact@zencoffeelab.com"),
  CRON_SECRET: z.string().optional(),
  ALLOW_DEMO_DATA: booleanString,
  PAYMENTS_MOCK: booleanString,
  SHIPPING_MOCK: booleanString,
  DEMO_ADMIN: booleanString,
});

let cached: z.infer<typeof schema> | undefined;

export function env(): z.infer<typeof schema> {
  if (!cached) {
    const parsed = schema.parse(process.env);
    const localDefault = parsed.NODE_ENV !== "production";
    cached = {
      ...parsed,
      ALLOW_DEMO_DATA: process.env.ALLOW_DEMO_DATA === undefined ? localDefault : parsed.ALLOW_DEMO_DATA,
      PAYMENTS_MOCK: process.env.PAYMENTS_MOCK === undefined ? localDefault : parsed.PAYMENTS_MOCK,
      SHIPPING_MOCK: process.env.SHIPPING_MOCK === undefined ? localDefault : parsed.SHIPPING_MOCK,
      DEMO_ADMIN: process.env.DEMO_ADMIN === undefined ? localDefault : parsed.DEMO_ADMIN,
    };
  }
  if (cached.NODE_ENV === "production") {
    const forbiddenMocks = cached.ALLOW_DEMO_DATA || cached.PAYMENTS_MOCK || cached.SHIPPING_MOCK || cached.DEMO_ADMIN;
    if (forbiddenMocks) throw new Error("Mock and demo flags must be disabled in production.");
  }
  return cached;
}

export function hasSupabaseConfig(): boolean {
  const config = env();
  return Boolean(config.VITE_SUPABASE_URL && config.VITE_SUPABASE_ANON_KEY);
}
