import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import {
  DEFAULT_SHIPPING_PRICE_RULE,
  normalizeShippingPriceRule,
  type ShippingPriceRule,
} from "~/domain/shipping-pricing";

export type FreeShippingThresholds = { fr: number; euUk: number };

const settingKeys = ["free_shipping_fr_cents", "free_shipping_eu_uk_cents"] as const;
const shippingPriceRuleKey = "shipping_price_rule";

function environmentThresholds(): FreeShippingThresholds {
  const config = env();
  return { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS };
}

export async function getFreeShippingThresholds(): Promise<FreeShippingThresholds> {
  const fallback = environmentThresholds();
  const client = createServiceSupabase();
  if (!client) return fallback;
  const { data, error } = await client.from("site_settings").select("key,value").in("key", [...settingKeys]);
  if (error) return fallback;
  const values = new Map((data ?? []).map((row) => [row.key, Number(row.value)]));
  const fr = values.get(settingKeys[0]);
  const euUk = values.get(settingKeys[1]);
  return {
    fr: Number.isSafeInteger(fr) && (fr ?? 0) >= 0 ? fr! : fallback.fr,
    euUk: Number.isSafeInteger(euUk) && (euUk ?? 0) >= 0 ? euUk! : fallback.euUk,
  };
}

export async function saveFreeShippingThresholds(thresholds: FreeShippingThresholds, actorId: string) {
  const client = createServiceSupabase();
  if (!client) throw new Error("Base indisponible.");
  const before = await getFreeShippingThresholds();
  const { error } = await client.from("site_settings").upsert([
    { key: settingKeys[0], value: thresholds.fr },
    { key: settingKeys[1], value: thresholds.euUk },
  ], { onConflict: "key" });
  if (error) throw new Error(error.message);
  await client.from("audit_log").insert({ actor_id: actorId, action: "shipping.thresholds.updated", entity_type: "site_settings", entity_id: "free_shipping_thresholds", before_data: before, after_data: thresholds });
}

export async function getShippingPriceRule(): Promise<ShippingPriceRule> {
  const client = createServiceSupabase();
  if (!client) return DEFAULT_SHIPPING_PRICE_RULE;
  const { data, error } = await client.from("site_settings").select("value").eq("key", shippingPriceRuleKey).maybeSingle();
  if (error || !data) return DEFAULT_SHIPPING_PRICE_RULE;
  return normalizeShippingPriceRule(data.value);
}

export async function saveShippingPriceRule(rule: ShippingPriceRule, actorId: string) {
  const client = createServiceSupabase();
  if (!client) throw new Error("Base indisponible.");
  const normalized = normalizeShippingPriceRule(rule);
  const before = await getShippingPriceRule();
  const { error } = await client.from("site_settings").upsert(
    { key: shippingPriceRuleKey, value: normalized },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
  await client.from("audit_log").insert({
    actor_id: actorId,
    action: "shipping.price_rule.updated",
    entity_type: "site_settings",
    entity_id: shippingPriceRuleKey,
    before_data: before,
    after_data: normalized,
  });
}
