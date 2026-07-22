import { Info, PackagePlus, Trash2, X } from "lucide-react";
import { useRef } from "react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

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

export function canDeletePackagingPreset(presetActive: boolean, activePresetCount: number) {
  return !presetActive || activePresetCount > 1;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const config = env();
  if (admin.demo) return { demo: true, presets: [] as PackagingPresetRow[], thresholds: { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS } };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data, error } = await client.from("packaging_presets").select("*").order("max_net_weight_grams");
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, presets: (data ?? []) as PackagingPresetRow[], thresholds: { fr: config.FREE_SHIPPING_FR_CENTS, euUk: config.FREE_SHIPPING_EU_UK_CENTS } };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const form = Object.fromEntries(await request.formData());
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };

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

export function ShippingHelp({ presets, thresholds }: { presets: PackagingPresetRow[]; thresholds: { fr: number; euUk: number } }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
  return <>
    <button className="admin-info-button" type="button" aria-label="Comprendre les emballages et le franco" aria-haspopup="dialog" aria-controls="shipping-help" onClick={() => dialogRef.current?.showModal()}><Info aria-hidden="true" /></button>
    <dialog className="admin-help-dialog" id="shipping-help" ref={dialogRef} aria-labelledby="shipping-help-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="admin-help-dialog__panel">
        <header><div><p className="eyebrow">Guide d’utilisation</p><h2 id="shipping-help-title">Emballages, franco et étiquettes</h2></div><form method="dialog"><button className="ui-button ui-button--icon ui-button--outline" aria-label="Fermer la fenêtre"><X aria-hidden="true" /></button></form></header>
        <div className="admin-help-dialog__content">
          <section><h3>À quoi servent les emballages ?</h3><p>Le site transforme automatiquement le panier en un ou plusieurs colis avant d’interroger Shippo.</p><dl className="admin-help-definitions"><div><dt>Poids net maximal</dt><dd>Quantité maximale de café dans le carton, sans l’emballage.</dd></div><div><dt>Tare</dt><dd>Poids du carton vide et du calage, ajouté au poids du café.</dd></div><div><dt>Dimensions</dt><dd>Longueur, largeur et hauteur extérieures transmises au transporteur.</dd></div><div><dt>Actif</dt><dd>Autorise l’utilisation de cet emballage dans les nouveaux devis.</dd></div></dl><p><strong>Exemple :</strong> quatre paquets de 200 g représentent 800 g de café. Avec un carton de 180 g, Shippo reçoit un colis de 980 g.</p></section>
          <section><h3>Emballages actuellement configurés</h3><div className="admin-help-table-wrap"><table className="admin-help-table"><thead><tr><th>Emballage</th><th>Café maximal</th><th>Tare</th><th>Dimensions</th><th>État</th></tr></thead><tbody>{presets.length > 0 ? presets.map((preset) => <tr key={preset.id}><td>{preset.name}</td><td>{preset.max_net_weight_grams} g</td><td>{preset.tare_weight_grams} g</td><td>{preset.length_cm} × {preset.width_cm} × {preset.height_cm} cm</td><td>{preset.active ? "Actif" : "Inactif"}</td></tr>) : <tr><td colSpan={5}>Aucun emballage configuré.</td></tr>}</tbody></table></div><p>Le site choisit le plus petit emballage adapté. Si le panier dépasse la capacité maximale, il crée plusieurs colis.</p></section>
          <section><h3>Calcul des tarifs Shippo</h3><ol><li>Le poids des paquets est additionné.</li><li>La commande est répartie dans les emballages actifs.</li><li>La tare et les dimensions de chaque colis sont ajoutées.</li><li>Shippo renvoie les services et tarifs réels.</li><li>Pour plusieurs colis, les tarifs du même service sont additionnés.</li></ol><p>Le devis est valable 15 minutes. Le point relais est disponible uniquement en France. Pour le Royaume-Uni, la déclaration douanière est générée automatiquement.</p></section>
          <section><h3>Franco de port</h3><p>La livraison est offerte à partir de <strong>{euros(thresholds.fr)} en France</strong> et de <strong>{euros(thresholds.euUk)} dans l’Union européenne et au Royaume-Uni</strong>, selon le sous-total des cafés.</p><p>Le service compatible le moins cher passe à 0 € pour le client. Shippo facture toujours l’étiquette à Zen Coffee Lab : son coût reste donc à votre charge. Les seuils sont configurés dans les variables Cloudflare et ne sont pas modifiables sur cet écran.</p></section>
          <section><h3>Après le paiement</h3><ol><li>Stripe confirme le paiement.</li><li>La commande apparaît dans le back-office.</li><li>Vous ouvrez la commande et cliquez sur « Acheter les étiquettes ».</li><li>Une étiquette PDF est achetée pour chaque colis.</li><li>Le suivi et le coût réel sont enregistrés.</li></ol><p>L’achat des étiquettes n’est jamais automatique. Une modification d’emballage s’applique uniquement aux nouveaux devis.</p></section>
        </div>
      </div>
    </dialog>
  </>;
}

export default function AdminShipping() {
  const { demo, presets, thresholds } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const activePresetCount = presets.filter((preset) => preset.active).length;
  return <AdminShell active="shipping">
    <header className="admin-heading"><div><p className="eyebrow">Shippo</p><div className="admin-title-with-help"><h1>Emballages & franco</h1><ShippingHelp presets={presets} thresholds={thresholds} /></div></div></header>
    {demo ? <p className="admin-notice">Connectez Supabase pour modifier les emballages.</p> : null}
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    <section className="ui-card admin-editor"><h2>Seuils de livraison gratuite</h2><p>France : <strong>{thresholds.fr / 100} €</strong> · UE et Royaume-Uni : <strong>{thresholds.euUk / 100} €</strong></p><p><small>Ces seuils sont configurés par environnement avec <code>FREE_SHIPPING_FR_CENTS</code> et <code>FREE_SHIPPING_EU_UK_CENTS</code>.</small></p></section>
    <section className="admin-content-list" aria-label="Emballages">{presets.map((preset) => {
      const canDelete = canDeletePackagingPreset(preset.active, activePresetCount);
      return <details className="ui-card admin-content-page" key={preset.id}><summary><strong>{preset.name}</strong><span className="ui-badge">{preset.active ? "actif" : "inactif"}</span></summary><PresetForm preset={preset} demo={demo} /><Form method="post" className="admin-delete-form" onSubmit={(event) => { if (!window.confirm(`Supprimer définitivement l’emballage « ${preset.name} » ?`)) event.preventDefault(); }}><input type="hidden" name="intent" value="delete_preset" /><input type="hidden" name="id" value={preset.id} /><button className="ui-button ui-button--danger ui-button--sm" type="submit" disabled={demo || !canDelete} title={!canDelete ? "Activez d’abord un autre emballage" : undefined}><Trash2 aria-hidden="true" /> Supprimer l’emballage</button></Form></details>;
    })}</section>
    <section className="ui-card admin-editor"><h2>Nouvel emballage</h2><PresetForm demo={demo} /></section>
  </AdminShell>;
}
