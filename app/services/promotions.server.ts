import { createServiceSupabase } from "~/lib/supabase.server";
export type PromotionCode = { id: string; code: string; discount_type: "percent" | "fixed"; discount_value: number; active: boolean; created_at: string };
export function normalizePromotionCode(value: unknown) { return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : ""; }
export async function resolvePromotion(code: unknown, subtotalCents: number) {
  const normalized = normalizePromotionCode(code); if (!normalized) return { code: null, discountCents: 0 };
  const client = createServiceSupabase(); if (!client) throw new Response("Promotions unavailable.", { status: 503 });
  const { data, error } = await client.from("promotion_codes").select("code,discount_type,discount_value").eq("code", normalized).eq("active", true).maybeSingle();
  if (error) throw new Response("Promotions unavailable.", { status: 503 }); if (!data) throw new Response("Invalid promotion code.", { status: 422 });
  const discountCents = data.discount_type === "percent" ? Math.round(subtotalCents * data.discount_value / 100) : data.discount_value;
  return { code: data.code, discountCents: Math.min(subtotalCents, Math.max(0, discountCents)) };
}
