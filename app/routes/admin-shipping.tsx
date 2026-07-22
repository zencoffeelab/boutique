import { PackagePlus } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const presetSchema = z.object({
  intent: z.literal("save_preset"),
  id: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  name: z.string().trim().min(2).max(100),
  maxNetWeightGrams: z.coerce.number().int().positive().max(100_000),
  tareWeightGrams: z.coerce.number().int().nonnegative().max(20_000),
  lengthCm: z.coerce.number().positive().max(500),
  widthCm: z.coerce.number().positive().max(500),
  heightCm: z.coerce.number().positive().max(500),
  active: z.string().optional().transform(Boolean),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request); const config = env();
  if (admin.demo) return { demo: true, presets: [], thresholds: { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS } };
  const client = createServiceSupabase(); if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data, error } = await client.from("packaging_presets").select("*").order("max_net_weight_grams"); if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, presets: data ?? [], thresholds: { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS } };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request); if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const parsed = presetSchema.safeParse(Object.fromEntries(await request.formData())); if (!parsed.success) return { ok: false, message: "Dimensions ou poids invalides." };
  const client = createServiceSupabase(); if (!client) return { ok: false, message: "Base indisponible." };
  const values = { name: parsed.data.name, max_net_weight_grams: parsed.data.maxNetWeightGrams, tare_weight_grams: parsed.data.tareWeightGrams, length_cm: parsed.data.lengthCm, width_cm: parsed.data.widthCm, height_cm: parsed.data.heightCm, active: parsed.data.active };
  const mutation = parsed.data.id ? await client.from("packaging_presets").update(values).eq("id", parsed.data.id).select("id").single() : await client.from("packaging_presets").insert(values).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "Emballage non enregistré." };
  await client.from("audit_log").insert({ actor_id: admin.id, action: parsed.data.id ? "packaging.updated" : "packaging.created", entity_type: "packaging_preset", entity_id: mutation.data.id, after_data: parsed.data });
  return { ok: true, message: "Configuration d’emballage enregistrée." };
}

export const meta: MetaFunction = () => [{ title: "Expédition | Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function PresetForm({ preset, demo }: { preset?: any; demo: boolean }) {
  return <Form method="post" className="form-grid"><input type="hidden" name="intent" value="save_preset" /><input type="hidden" name="id" value={preset?.id ?? ""} /><div className="field field--wide"><label>Nom<input name="name" defaultValue={preset?.name ?? ""} placeholder="Carton 3 kg" required /></label></div><div className="field"><label>Poids net maximal (g)<input name="maxNetWeightGrams" type="number" min="1" defaultValue={preset?.max_net_weight_grams ?? 3000} required /></label></div><div className="field"><label>Tare (g)<input name="tareWeightGrams" type="number" min="0" defaultValue={preset?.tare_weight_grams ?? 250} required /></label></div><div className="field"><label>Longueur (cm)<input name="lengthCm" type="number" min="0.1" step="0.1" defaultValue={preset?.length_cm ?? 30} required /></label></div><div className="field"><label>Largeur (cm)<input name="widthCm" type="number" min="0.1" step="0.1" defaultValue={preset?.width_cm ?? 22} required /></label></div><div className="field"><label>Hauteur (cm)<input name="heightCm" type="number" min="0.1" step="0.1" defaultValue={preset?.height_cm ?? 15} required /></label></div><label><input name="active" type="checkbox" defaultChecked={preset?.active ?? true} /> Utilisable pour les devis</label><button className="ui-button ui-button--default" type="submit" disabled={demo}>{preset ? "Enregistrer" : <><PackagePlus aria-hidden="true" /> Ajouter</>}</button></Form>;
}

export default function AdminShipping() {
  const { demo, presets, thresholds } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>();
  return <AdminShell active="shipping"><header className="admin-heading"><div><p className="eyebrow">Shippo</p><h1>Emballages & franco</h1></div></header>{demo ? <p className="admin-notice">Connectez Supabase pour modifier les emballages.</p> : null}{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}<section className="ui-card admin-editor"><h2>Seuils de livraison gratuite</h2><p>France : <strong>{thresholds.fr / 100} €</strong> · UE et Royaume-Uni : <strong>{thresholds.euUk / 100} €</strong></p><p><small>Ces seuils sont configurés par environnement avec <code>FREE_SHIPPING_FR_CENTS</code> et <code>FREE_SHIPPING_EU_UK_CENTS</code>.</small></p></section><section className="admin-content-list" aria-label="Emballages">{presets.map((preset) => <details className="ui-card admin-content-page" key={preset.id}><summary><strong>{preset.name}</strong><span className="ui-badge">{preset.active ? "actif" : "inactif"}</span></summary><PresetForm preset={preset} demo={demo} /></details>)}</section><section className="ui-card admin-editor"><h2>Nouvel emballage</h2><PresetForm demo={demo} /></section></AdminShell>;
}
