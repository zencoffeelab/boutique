import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { DEFAULT_SHIPPING_TARIFFS, type ConfiguredShippingService, type ShippingTariffs, type ShippingZone } from "~/domain/shipping-zones";

export type FreeShippingThresholds = { fr: number; euUk: number };

const settingKeys = ["free_shipping_fr_cents", "free_shipping_eu_uk_cents"] as const;
const shippingTariffSettingKey = "shipping_tariffs";
const instagramUrlSettingKey = "instagram_url";
export const defaultInstagramUrl = "https://www.instagram.com/zencoffeeclub/";
const shippingServices: ConfiguredShippingService[] = ["mondial_relay", "fedex", "fedex_signature", "colissimo"];

function validInstagramUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname === "www.instagram.com");
  } catch {
    return false;
  }
}

function validTariffs(value: unknown): value is ShippingTariffs {
  if (!value || typeof value !== "object") return false;
  return [1, 2, 3, 4, 5].every((zone) => {
    const zoneTariffs = (value as Record<string, unknown>)[zone];
    if (!zoneTariffs || typeof zoneTariffs !== "object") return false;
    return Object.entries(zoneTariffs).every(([service, prices]) => shippingServices.includes(service as ConfiguredShippingService) && Array.isArray(prices) && prices.length === 3 && prices.every((price) => price === null || (typeof price === "number" && Number.isSafeInteger(price) && price >= 0)));
  });
}

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

export async function getShippingTariffs(): Promise<ShippingTariffs> {
  const client = createServiceSupabase();
  if (!client) return DEFAULT_SHIPPING_TARIFFS;
  const { data, error } = await client.from("site_settings").select("value").eq("key", shippingTariffSettingKey).maybeSingle();
  return !error && validTariffs(data?.value) ? data.value : DEFAULT_SHIPPING_TARIFFS;
}

export async function saveShippingTariffs(tariffs: ShippingTariffs, actorId: string) {
  const client = createServiceSupabase();
  if (!client) throw new Error("Base indisponible.");
  const before = await getShippingTariffs();
  const { error } = await client.from("site_settings").upsert({ key: shippingTariffSettingKey, value: tariffs }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await client.from("audit_log").insert({ actor_id: actorId, action: "shipping.tariffs.updated", entity_type: "site_settings", entity_id: shippingTariffSettingKey, before_data: before, after_data: tariffs });
}

export async function getInstagramUrl(): Promise<string> {
  const client = createServiceSupabase();
  if (!client) return defaultInstagramUrl;
  const { data, error } = await client.from("site_settings").select("value").eq("key", instagramUrlSettingKey).maybeSingle();
  return !error && validInstagramUrl(data?.value) ? data.value : defaultInstagramUrl;
}

export async function saveInstagramUrl(instagramUrl: string, actorId: string) {
  if (!validInstagramUrl(instagramUrl)) throw new Error("L’URL doit être un lien HTTPS vers Instagram.");
  const client = createServiceSupabase();
  if (!client) throw new Error("Base indisponible.");
  const before = await getInstagramUrl();
  const { error } = await client.from("site_settings").upsert({ key: instagramUrlSettingKey, value: instagramUrl }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await client.from("audit_log").insert({ actor_id: actorId, action: "site_footer.instagram_url.updated", entity_type: "site_settings", entity_id: instagramUrlSettingKey, before_data: { instagramUrl: before }, after_data: { instagramUrl } });
}
