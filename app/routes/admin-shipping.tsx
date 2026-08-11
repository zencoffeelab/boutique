import { Info, PackagePlus, Trash2, X } from "lucide-react";
import { useRef } from "react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { shippingCountryLabel } from "~/domain/shipping-countries";
import { SHIPPING_ZONE_COUNTRIES, type ShippingPriceRule, type ShippingZone } from "~/domain/shipping-pricing";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import {
  getFreeShippingThresholds,
  getShippingPriceRule,
  saveFreeShippingThresholds,
  saveShippingPriceRule,
} from "~/services/site-settings.server";

type PackagingPresetRow = {
  id: string;
  name: string;
  max_net_weight_grams: number;
  tare_weight_grams: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  active: boolean;
};

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

const deletePresetSchema = z.object({ intent: z.literal("delete_preset"), id: z.uuid() });
const thresholdsSchema = z.object({ intent: z.literal("save_thresholds"), france: z.coerce.number().finite().nonnegative().max(100_000), europe: z.coerce.number().finite().nonnegative().max(100_000) });
const shippingPriceRuleSchema = z.object({
  intent: z.literal("save_shipping_price_rule"),
  minimumWeightKg: z.coerce.number().finite().positive().max(30),
  maximumWeightKg: z.coerce.number().finite().positive().max(100),
  minimumDiscount: z.coerce.number().finite().nonnegative().max(1_000),
  maximumDiscount: z.coerce.number().finite().nonnegative().max(1_000),
  minimumDiscountPercent: z.coerce.number().finite().nonnegative().max(100),
  maximumDiscountPercent: z.coerce.number().finite().nonnegative().max(100),
}).superRefine((value, context) => {
  if (value.maximumWeightKg <= value.minimumWeightKg) context.addIssue({ code: "custom", path: ["maximumWeightKg"], message: "Le poids haut doit dépasser le poids bas." });
  if (value.maximumDiscount < value.minimumDiscount) context.addIssue({ code: "custom", path: ["maximumDiscount"], message: "La réduction haute doit dépasser la réduction basse." });
  if (value.maximumDiscountPercent < value.minimumDiscountPercent) context.addIssue({ code: "custom", path: ["maximumDiscountPercent"], message: "Le taux haut doit dépasser le taux bas." });
});

export function canDeletePackagingPreset(presetActive: boolean, activePresetCount: number) {
  return !presetActive || activePresetCount > 1;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) {
    const [thresholds, pricingRule] = await Promise.all([getFreeShippingThresholds(), getShippingPriceRule()]);
    return { demo: true, presets: [] as PackagingPresetRow[], thresholds, pricingRule };
  }
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const [{ data, error }, thresholds, pricingRule] = await Promise.all([
    client.from("packaging_presets").select("*").order("max_net_weight_grams"),
    getFreeShippingThresholds(),
    getShippingPriceRule(),
  ]);
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, presets: (data ?? []) as PackagingPresetRow[], thresholds, pricingRule };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const form = Object.fromEntries(await request.formData());
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };

  if (form.intent === "save_thresholds") {
    const parsed = thresholdsSchema.safeParse(form);
    if (!parsed.success) return { ok: false, message: "Les seuils doivent être des montants en euros valides." };
    try {
      await saveFreeShippingThresholds({ fr: Math.round(parsed.data.france * 100), euUk: Math.round(parsed.data.europe * 100) }, admin.id);
      return { ok: true, message: "Seuils de livraison gratuite enregistrés." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Seuils non enregistrés." };
    }
  }

  if (form.intent === "save_shipping_price_rule") {
    const parsed = shippingPriceRuleSchema.safeParse(form);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "La règle tarifaire est invalide." };
    const pricingRule: ShippingPriceRule = {
      minimumWeightGrams: Math.round(parsed.data.minimumWeightKg * 1_000),
      maximumWeightGrams: Math.round(parsed.data.maximumWeightKg * 1_000),
      minimumDiscountCents: Math.round(parsed.data.minimumDiscount * 100),
      maximumDiscountCents: Math.round(parsed.data.maximumDiscount * 100),
      minimumDiscountBasisPoints: Math.round(parsed.data.minimumDiscountPercent * 100),
      maximumDiscountBasisPoints: Math.round(parsed.data.maximumDiscountPercent * 100),
    };
    try {
      await saveShippingPriceRule(pricingRule, admin.id);
      return { ok: true, message: "Règle de réduction des tarifs enregistrée." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Règle tarifaire non enregistrée." };
    }
  }

  if (form.intent === "delete_preset") {
    const parsed = deletePresetSchema.safeParse(form);
    if (!parsed.success) return { ok: false, message: "Emballage invalide." };
    const { data: before, error: readError } = await client.from("packaging_presets").select("*").eq("id", parsed.data.id).maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!before) return { ok: false, message: "Emballage introuvable." };
    const { count, error: countError } = await client.from("packaging_presets").select("id", { count: "exact", head: true }).eq("active", true);
    if (countError) return { ok: false, message: countError.message };
    if (!canDeletePackagingPreset(before.active, count ?? 0)) return { ok: false, message: "Impossible de supprimer le dernier emballage actif. Activez d’abord un autre emballage." };
    const { error } = await client.from("packaging_presets").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, message: error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "packaging.deleted", entity_type: "packaging_preset", entity_id: parsed.data.id, before_data: before });
    return { ok: true, message: "Emballage supprimé." };
  }

  const parsed = presetSchema.safeParse(form);
  if (!parsed.success) return { ok: false, message: "Dimensions ou poids invalides." };
  if (parsed.data.id && !parsed.data.active) {
    const [beforeResult, countResult] = await Promise.all([
      client.from("packaging_presets").select("active").eq("id", parsed.data.id).maybeSingle(),
      client.from("packaging_presets").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    if (beforeResult.error || countResult.error) return { ok: false, message: beforeResult.error?.message ?? countResult.error?.message ?? "Impossible de vérifier les emballages actifs." };
    if (beforeResult.data?.active && (countResult.count ?? 0) <= 1) return { ok: false, message: "Au moins un emballage doit rester actif pour calculer la livraison." };
  }
  const values = { name: parsed.data.name, max_net_weight_grams: parsed.data.maxNetWeightGrams, tare_weight_grams: parsed.data.tareWeightGrams, length_cm: parsed.data.lengthCm, width_cm: parsed.data.widthCm, height_cm: parsed.data.heightCm, active: parsed.data.active };
  const mutation = parsed.data.id ? await client.from("packaging_presets").update(values).eq("id", parsed.data.id).select("id").single() : await client.from("packaging_presets").insert(values).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "Emballage non enregistré." };
  await client.from("audit_log").insert({ actor_id: admin.id, action: parsed.data.id ? "packaging.updated" : "packaging.created", entity_type: "packaging_preset", entity_id: mutation.data.id, after_data: parsed.data });
  return { ok: true, message: "Configuration d’emballage enregistrée." };
}

export const meta: MetaFunction = () => [{ title: "Expédition | Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function PresetForm({ preset, demo }: { preset?: PackagingPresetRow; demo: boolean }) {
  return <Form method="post" className="form-grid">
    <input type="hidden" name="intent" value="save_preset" />
    <input type="hidden" name="id" value={preset?.id ?? ""} />
    <div className="field field--wide"><label>Nom<input name="name" defaultValue={preset?.name ?? ""} placeholder="Carton 3 kg" required /></label></div>
    <div className="field"><label>Poids net maximal (g)<input name="maxNetWeightGrams" type="number" min="1" defaultValue={preset?.max_net_weight_grams ?? 3000} required /></label></div>
    <div className="field"><label>Tare (g)<input name="tareWeightGrams" type="number" min="0" defaultValue={preset?.tare_weight_grams ?? 250} required /></label></div>
    <div className="field"><label>Longueur (cm)<input name="lengthCm" type="number" min="0.1" step="0.1" defaultValue={preset?.length_cm ?? 30} required /></label></div>
    <div className="field"><label>Largeur (cm)<input name="widthCm" type="number" min="0.1" step="0.1" defaultValue={preset?.width_cm ?? 22} required /></label></div>
    <div className="field"><label>Hauteur (cm)<input name="heightCm" type="number" min="0.1" step="0.1" defaultValue={preset?.height_cm ?? 15} required /></label></div>
    <label><input name="active" type="checkbox" defaultChecked={preset?.active ?? true} /> Utilisable pour les devis</label>
    <button className="ui-button ui-button--default" type="submit" disabled={demo}>{preset ? "Enregistrer" : <><PackagePlus aria-hidden="true" /> Ajouter</>}</button>
  </Form>;
}

export function ShippingPriceRuleForm({ rule, demo }: { rule: ShippingPriceRule; demo: boolean }) {
  const zones = Object.entries(SHIPPING_ZONE_COUNTRIES) as Array<[`${ShippingZone}`, (typeof SHIPPING_ZONE_COUNTRIES)[ShippingZone]]>;
  return <section className="ui-card admin-editor">
    <h2>Réduction progressive des tarifs</h2>
    <p>Le tarif Shippo est diminué selon la zone et le poids total expédié. La zone et le poids comptent chacun pour moitié dans la progression du pourcentage entre les deux bornes. Le prix client est ensuite arrondi au montant autorisé le plus proche se terminant par <strong>,00 €</strong>, <strong>,50 €</strong> ou <strong>,90 €</strong>.</p>
    <Form method="post" className="form-grid">
      <input type="hidden" name="intent" value="save_shipping_price_rule" />
      <div className="field"><label>Poids bas (kg)<input name="minimumWeightKg" type="number" min="0.1" max="30" step="0.1" defaultValue={(rule.minimumWeightGrams / 1_000).toFixed(1)} required /></label></div>
      <div className="field"><label>Poids haut (kg)<input name="maximumWeightKg" type="number" min="0.2" max="100" step="0.1" defaultValue={(rule.maximumWeightGrams / 1_000).toFixed(1)} required /></label></div>
      <div className="field"><label>Réduction minimale (€)<input name="minimumDiscount" type="number" min="0" max="1000" step="0.01" defaultValue={(rule.minimumDiscountCents / 100).toFixed(2)} required /></label></div>
      <div className="field"><label>Réduction haute (€)<input name="maximumDiscount" type="number" min="0" max="1000" step="0.01" defaultValue={(rule.maximumDiscountCents / 100).toFixed(2)} required /></label></div>
      <div className="field"><label>Taux de départ (%)<input name="minimumDiscountPercent" type="number" min="0" max="100" step="0.1" defaultValue={(rule.minimumDiscountBasisPoints / 100).toFixed(1)} required /></label></div>
      <div className="field"><label>Taux maximal (%)<input name="maximumDiscountPercent" type="number" min="0" max="100" step="0.1" defaultValue={(rule.maximumDiscountBasisPoints / 100).toFixed(1)} required /></label></div>
      <div className="field field--wide"><p><strong>Bornes actuelles :</strong> au moins {(rule.minimumDiscountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} de réduction en Zone 1 jusqu’à {(rule.minimumWeightGrams / 1_000).toLocaleString("fr-FR")} kg ; réduction cible de {(rule.maximumDiscountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} en Zone 4 à partir de {(rule.maximumWeightGrams / 1_000).toLocaleString("fr-FR")} kg.</p></div>
      <div><button className="ui-button ui-button--default" type="submit" disabled={demo}>Enregistrer la règle</button></div>
    </Form>
    <div className="admin-help-table-wrap"><table className="admin-help-table"><thead><tr><th>Zone</th><th>Pays</th></tr></thead><tbody>{zones.map(([zone, countries]) => <tr key={zone}><td>Zone {zone}</td><td>{countries.map((country) => shippingCountryLabel(country, "fr-FR")).join(", ")}</td></tr>)}</tbody></table></div>
  </section>;
}

export function ShippingHelp({ presets, thresholds, pricingRule }: { presets: PackagingPresetRow[]; thresholds: { fr: number; euUk: number }; pricingRule: ShippingPriceRule }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
  return <>
    <button className="admin-info-button" type="button" aria-label="Comprendre les emballages et le franco" aria-haspopup="dialog" aria-controls="shipping-help" onClick={() => dialogRef.current?.showModal()}><Info aria-hidden="true" /></button>
    <dialog className="admin-help-dialog" id="shipping-help" ref={dialogRef} aria-labelledby="shipping-help-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="admin-help-dialog__panel">
        <header><div><p className="eyebrow">Guide d’utilisation</p><h2 id="shipping-help-title">Emballages, franco et étiquettes</h2></div><form method="dialog"><button className="ui-button ui-button--icon ui-button--outline" aria-label="Fermer la fenêtre"><X aria-hidden="true" /></button></form></header>
        <div className="admin-help-dialog__content">
          <section><h3>À quoi servent les emballages ?</h3><p>Le site transforme automatiquement le panier en un ou plusieurs colis avant d’interroger les services de livraison.</p><dl className="admin-help-definitions"><div><dt>Poids net maximal</dt><dd>Quantité maximale de café dans le carton, sans l’emballage.</dd></div><div><dt>Tare</dt><dd>Poids du carton vide et du calage, ajouté au poids du café.</dd></div><div><dt>Dimensions</dt><dd>Longueur, largeur et hauteur extérieures transmises au transporteur.</dd></div><div><dt>Actif</dt><dd>Autorise l’utilisation de cet emballage dans les nouveaux devis.</dd></div></dl><p><strong>Exemple :</strong> quatre paquets de 200 g représentent 800 g de café. Avec un carton de 180 g, le transporteur reçoit un colis de 980 g.</p></section>
          <section><h3>Emballages actuellement configurés</h3><div className="admin-help-table-wrap"><table className="admin-help-table"><thead><tr><th>Emballage</th><th>Café maximal</th><th>Tare</th><th>Dimensions</th><th>État</th></tr></thead><tbody>{presets.length > 0 ? presets.map((preset) => <tr key={preset.id}><td>{preset.name}</td><td>{preset.max_net_weight_grams} g</td><td>{preset.tare_weight_grams} g</td><td>{preset.length_cm} × {preset.width_cm} × {preset.height_cm} cm</td><td>{preset.active ? "Actif" : "Inactif"}</td></tr>) : <tr><td colSpan={5}>Aucun emballage configuré.</td></tr>}</tbody></table></div><p>Le site choisit le plus petit emballage adapté. Si le panier dépasse la capacité maximale, il crée plusieurs colis.</p></section>
          <section><h3>Calcul des tarifs transporteur</h3><ol><li>Le poids des paquets est additionné.</li><li>La commande est répartie dans les emballages actifs.</li><li>La tare et les dimensions de chaque colis sont ajoutées.</li><li>Shippo est interrogé séparément pour chaque colis avec le seul compte Colissimo intégré actif.</li><li>Le site conserve Colissimo Domicile en France, Colissimo International Expert à domicile dans l’Union européenne ou Colissimo Point Retrait selon le choix du client.</li><li>Les montants réels sont additionnés, puis la réduction progressive par zone et poids est appliquée.</li><li>Le prix client est arrondi à la terminaison ,00 €, ,50 € ou ,90 € la plus proche avant l’éventuel franco.</li></ol><p>La zone et le poids comptent chacun pour moitié. Le taux évolue actuellement de <strong>{pricingRule.minimumDiscountBasisPoints / 100} %</strong> à <strong>{pricingRule.maximumDiscountBasisPoints / 100} %</strong>, pour une réduction cible comprise entre <strong>{euros(pricingRule.minimumDiscountCents)}</strong> et <strong>{euros(pricingRule.maximumDiscountCents)}</strong>. Le devis client est valable 15 minutes et les identifiants Shippo restent exclusivement côté serveur.</p></section>
          <section><h3>Point Retrait</h3><p>Le choix Point Retrait apparaît automatiquement dans le checkout quand la clé du Web Service Point Retrait Colissimo est configurée. Sans cette clé, la livraison Colissimo à domicile reste entièrement disponible.</p><p>L’annuaire renvoie au maximum 12 points par distance et le site revalide le pays, la disponibilité et le poids avant de demander le devis Shippo.</p></section>
          <section><h3>Franco de port</h3><p>La livraison est offerte à partir de <strong>{euros(thresholds.fr)} en France</strong> et de <strong>{euros(thresholds.euUk)} dans le reste de l’Union européenne</strong>, selon le sous-total des cafés.</p><p>Le tarif devient gratuit pour le client, mais le coût réel de l’étiquette Shippo reste enregistré et à la charge de Zen Coffee Lab. Les seuils sont modifiables dans la carte dédiée de cet écran.</p></section>
          <section><h3>Après le paiement</h3><ol><li>Stripe confirme le paiement par webhook signé.</li><li>La commande payée apparaît dans « Commandes » avec son numéro définitif.</li><li>Vous ouvrez la commande et cliquez sur « Générer les étiquettes Colissimo ».</li><li>Une étiquette PDF Shippo est achetée pour chaque colis.</li><li>Le suivi et le coût réel sont enregistrés dans la commande.</li></ol><p>L’achat des étiquettes n’est jamais automatique : il reste sous contrôle de l’administrateur et n’est disponible qu’après confirmation du paiement. Une modification d’emballage s’applique uniquement aux nouveaux devis.</p></section>
        </div>
      </div>
    </dialog>
  </>;
}

export default function AdminShipping() {
  const { demo, presets, thresholds, pricingRule } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const activePresetCount = presets.filter((preset) => preset.active).length;
  return <AdminShell active="shipping">
    <header className="admin-heading"><div><p className="eyebrow">Shippo · Colissimo</p><div className="admin-title-with-help"><h1>Tarifs, emballages & franco</h1><ShippingHelp presets={presets} thresholds={thresholds} pricingRule={pricingRule} /></div></div></header>
    {demo ? <p className="admin-notice">Connectez Supabase pour modifier les tarifs et les emballages.</p> : null}
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    <ShippingPriceRuleForm rule={pricingRule} demo={demo} />
    <section className="ui-card admin-editor"><h2>Seuils de livraison gratuite</h2><p>Modifiez les montants à partir desquels la livraison Colissimo devient gratuite.</p><Form method="post" className="form-grid"><input type="hidden" name="intent" value="save_thresholds" /><div className="field"><label>France (€)<input name="france" type="number" min="0" max="100000" step="0.01" defaultValue={(thresholds.fr / 100).toFixed(2)} required /></label></div><div className="field"><label>Union européenne hors France (€)<input name="europe" type="number" min="0" max="100000" step="0.01" defaultValue={(thresholds.euUk / 100).toFixed(2)} required /></label></div><div><button className="ui-button ui-button--default" type="submit" disabled={demo}>Enregistrer les seuils</button></div></Form></section>
    <section className="admin-content-list" aria-label="Emballages">{presets.map((preset) => {
      const canDelete = canDeletePackagingPreset(preset.active, activePresetCount);
      return <details className="ui-card admin-content-page" key={preset.id}><summary><strong>{preset.name}</strong><span className="ui-badge">{preset.active ? "actif" : "inactif"}</span></summary><PresetForm preset={preset} demo={demo} /><Form method="post" className="admin-delete-form" onSubmit={(event) => { if (!window.confirm(`Supprimer définitivement l’emballage « ${preset.name} » ?`)) event.preventDefault(); }}><input type="hidden" name="intent" value="delete_preset" /><input type="hidden" name="id" value={preset.id} /><button className="ui-button ui-button--danger ui-button--sm" type="submit" disabled={demo || !canDelete} title={!canDelete ? "Activez d’abord un autre emballage" : undefined}><Trash2 aria-hidden="true" /> Supprimer l’emballage</button></Form></details>;
    })}</section>
    <section className="ui-card admin-editor"><h2>Nouvel emballage</h2><PresetForm demo={demo} /></section>
  </AdminShell>;
}
