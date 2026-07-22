import { Plus, Trash2, Upload } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { formatMoney } from "~/domain/money";
import type { ProductVariant } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { getAdminProducts } from "~/lib/catalog.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const productSchema = z.object({
  intent: z.literal("save_product"), productId: z.string().min(1),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), status: z.enum(["draft", "published", "archived"]),
  altitudeMeters: z.coerce.number().int().min(0).max(10_000), featured: z.string().optional().transform(Boolean),
  nameFr: z.string().trim().min(2), nameEn: z.string().trim().min(2),
  shortFr: z.string().trim().min(10), shortEn: z.string().trim().min(10), bodyFr: z.string().trim().min(10), bodyEn: z.string().trim().min(10),
  producerFr: z.string().trim().min(1), producerEn: z.string().trim().min(1), regionFr: z.string().trim().min(1), regionEn: z.string().trim().min(1),
  varietyFr: z.string().trim().min(1), varietyEn: z.string().trim().min(1), processFr: z.string().trim().min(1), processEn: z.string().trim().min(1),
  notesFr: z.string(), notesEn: z.string(), seoTitleFr: z.string().trim().min(2), seoTitleEn: z.string().trim().min(2), seoDescriptionFr: z.string().trim().min(10), seoDescriptionEn: z.string().trim().min(10),
});
const variantSchema = z.object({
  intent: z.literal("create_variant"), productId: z.uuid(), sku: z.string().trim().min(2).max(80), label: z.string().trim().min(1).max(80),
  weightGrams: z.coerce.number().int().min(1).max(100_000), internalCostCents: z.coerce.number().int().min(0), stockOnHand: z.coerce.number().int().min(0), lowStockThreshold: z.coerce.number().int().min(0),
  hsCode: z.string().trim().regex(/^\d{6,10}$/), customsOriginCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), retailPriceCents: z.coerce.number().int().min(0),
  professional: z.string().optional().transform(Boolean), proPriceCents: z.coerce.number().int().min(0).optional(), proMinimumQuantity: z.coerce.number().int().min(1).optional(),
});
const deleteVariantSchema = z.object({
  intent: z.literal("delete_variant"), productId: z.uuid(), variantId: z.uuid(),
});

const emptyTranslation = (locale: "fr-FR" | "en-GB") => ({ locale, name: "", shortDescription: "", body: "", producer: "", region: "", variety: "", process: "", tastingNotes: [], seoTitle: "", seoDescription: "" });

export async function loader({ request, params }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (params.id === "nouveau") return { demo: admin.demo, isNew: true, product: { id: "nouveau", slug: "", status: "draft" as const, altitudeMeters: 0, featured: false, translations: { "fr-FR": emptyTranslation("fr-FR"), "en-GB": emptyTranslation("en-GB") }, media: [], variants: [] } };
  const product = (await getAdminProducts()).find((item) => item.id === params.id);
  if (!product) throw new Response("Produit introuvable.", { status: 404 }); return { demo: admin.demo, isNew: false, product };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request); if (admin.demo) return { ok: false, message: "L’éditeur est en lecture seule dans la démonstration locale." };
  const form = await request.formData(); const intent = String(form.get("intent")); const client = createServiceSupabase(); if (!client) return { ok: false, message: "Base de données indisponible." };
  if (intent === "upload_media") {
    const productId = String(form.get("productId")); const file = form.get("file"); const altFr = String(form.get("altFr") ?? "").trim(); const altEn = String(form.get("altEn") ?? "").trim();
    if (!(file instanceof File) || file.size === 0 || file.size > 8_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !altFr || !altEn) return { ok: false, message: "Image JPEG/PNG/WebP (8 Mo maximum) et textes alternatifs requis." };
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg"; const path = `${productId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from("product-media").upload(path, await file.arrayBuffer(), { contentType: file.type }); if (error) return { ok: false, message: error.message };
    const url = client.storage.from("product-media").getPublicUrl(path).data.publicUrl; const { count } = await client.from("product_media").select("id", { count: "exact", head: true }).eq("product_id", productId);
    await client.from("product_media").insert({ product_id: productId, storage_path: path, public_url: url, alt_fr: altFr, alt_en: altEn, width: 1600, height: 1600, position: count ?? 0 });
    await client.from("audit_log").insert({ actor_id: admin.id, action: "product.media_added", entity_type: "product", entity_id: productId, after_data: { path, altFr, altEn } });
    return { ok: true, message: "Image ajoutée." };
  }
  if (intent === "create_variant") {
    const parsed = variantSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return { ok: false, message: "Données de variante invalides.", errors: parsed.error.flatten().fieldErrors };
    const { data: variant, error } = await client.from("product_variants").insert({ product_id: parsed.data.productId, sku: parsed.data.sku, label: parsed.data.label, weight_grams: parsed.data.weightGrams, internal_cost_cents: parsed.data.internalCostCents, stock_on_hand: parsed.data.stockOnHand, low_stock_threshold: parsed.data.lowStockThreshold, hs_code: parsed.data.hsCode, customs_origin_country: parsed.data.customsOriginCountry }).select("id").single();
    if (error || !variant) return { ok: false, message: error?.message ?? "Variante non créée." };
    const offers = [{ variant_id: variant.id, audience: "retail", price_cents: parsed.data.retailPriceCents, minimum_quantity: 1, active: true }];
    if (parsed.data.professional) offers.push({ variant_id: variant.id, audience: "professional", price_cents: parsed.data.proPriceCents ?? 0, minimum_quantity: parsed.data.proMinimumQuantity ?? 1, active: true });
    const { error: offerError } = await client.from("variant_offers").insert(offers); if (offerError) { await client.from("product_variants").delete().eq("id", variant.id); return { ok: false, message: offerError.message }; }
    await client.from("stock_movements").insert({ variant_id: variant.id, quantity_delta: parsed.data.stockOnHand, reason: "Initial stock", actor_id: admin.id });
    await client.from("audit_log").insert({ actor_id: admin.id, action: "variant.created", entity_type: "product_variant", entity_id: variant.id, after_data: parsed.data });
    return redirect(`/admin/produits/${parsed.data.productId}`);
  }
  if (intent === "delete_variant") {
    const parsed = deleteVariantSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: "Variante invalide." };
    const { data: variant, error: variantError } = await client.from("product_variants")
      .select("id,product_id,sku,label,stock_reserved")
      .eq("id", parsed.data.variantId)
      .eq("product_id", parsed.data.productId)
      .maybeSingle();
    if (variantError) return { ok: false, message: variantError.message };
    if (!variant) return { ok: false, message: "Variante introuvable pour ce produit." };
    if (variant.stock_reserved > 0) return { ok: false, message: "Cette variante possède du stock réservé. Attendez la finalisation ou l’expiration des commandes en cours avant de la supprimer." };
    const { data: offers, error: offerReadError } = await client.from("variant_offers").select("id,audience,price_cents,minimum_quantity,active").eq("variant_id", variant.id);
    if (offerReadError) return { ok: false, message: offerReadError.message };
    if (!(offers ?? []).some((offer) => offer.active)) return { ok: false, message: "Cette variante est déjà supprimée de la vente." };
    const { error: deleteError } = await client.from("variant_offers").update({ active: false }).eq("variant_id", variant.id).eq("active", true);
    if (deleteError) return { ok: false, message: deleteError.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "variant.archived", entity_type: "product_variant", entity_id: variant.id, before_data: { variant, offers }, after_data: { active: false } });
    return redirect(`/admin/produits/${parsed.data.productId}`);
  }
  const parsed = productSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return { ok: false, message: "Les deux versions linguistiques doivent être complètes.", errors: parsed.error.flatten().fieldErrors };
  const creating = parsed.data.productId === "nouveau"; const before = creating ? { data: null } : await client.from("products").select("*,product_translations(*)").eq("id", parsed.data.productId).single();
  const productMutation = { slug: parsed.data.slug, status: creating ? "draft" : parsed.data.status, altitude_meters: parsed.data.altitudeMeters, featured: parsed.data.featured, updated_at: new Date().toISOString() };
  const mutation = creating ? await client.from("products").insert(productMutation).select("id").single() : await client.from("products").update(productMutation).eq("id", parsed.data.productId).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "Produit non enregistré." }; const savedProductId = mutation.data.id;
  const translations = [
    { locale: "fr-FR", name: parsed.data.nameFr, short_description: parsed.data.shortFr, body: parsed.data.bodyFr, producer: parsed.data.producerFr, region: parsed.data.regionFr, variety: parsed.data.varietyFr, process: parsed.data.processFr, tasting_notes: parsed.data.notesFr.split(",").map((note) => note.trim()).filter(Boolean), seo_title: parsed.data.seoTitleFr, seo_description: parsed.data.seoDescriptionFr },
    { locale: "en-GB", name: parsed.data.nameEn, short_description: parsed.data.shortEn, body: parsed.data.bodyEn, producer: parsed.data.producerEn, region: parsed.data.regionEn, variety: parsed.data.varietyEn, process: parsed.data.processEn, tasting_notes: parsed.data.notesEn.split(",").map((note) => note.trim()).filter(Boolean), seo_title: parsed.data.seoTitleEn, seo_description: parsed.data.seoDescriptionEn },
  ].map((translation) => ({ ...translation, product_id: savedProductId }));
  const { error: translationError } = await client.from("product_translations").upsert(translations, { onConflict: "product_id,locale" }); if (translationError) { if (creating) await client.from("products").delete().eq("id", savedProductId); return { ok: false, message: translationError.message }; }
  await client.from("audit_log").insert({ actor_id: admin.id, action: creating ? "product.created" : "product.updated", entity_type: "product", entity_id: savedProductId, before_data: before.data, after_data: parsed.data });
  return redirect(`/admin/produits/${savedProductId}`);
}

export const meta: MetaFunction = () => [{ title: "Éditer un café | Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function TranslationFields({ language, translation }: { language: "Français" | "English"; translation: any }) {
  const suffix = language === "Français" ? "Fr" : "En";
  return <fieldset className="admin-editor__language"><legend>{language}</legend><div className="form-grid">
    <div className="field field--wide"><label>Nom<input name={`name${suffix}`} defaultValue={translation.name} required /></label></div>
    <div className="field field--wide"><label>Description courte<textarea name={`short${suffix}`} defaultValue={translation.shortDescription} required /></label></div>
    <div className="field field--wide"><label>Contenu produit<textarea name={`body${suffix}`} defaultValue={translation.body} required /></label></div>
    <div className="field"><label>Producteur<input name={`producer${suffix}`} defaultValue={translation.producer} required /></label></div><div className="field"><label>Région<input name={`region${suffix}`} defaultValue={translation.region} required /></label></div>
    <div className="field"><label>Variété<input name={`variety${suffix}`} defaultValue={translation.variety} required /></label></div><div className="field"><label>Traitement<input name={`process${suffix}`} defaultValue={translation.process} required /></label></div>
    <div className="field field--wide"><label>Notes, séparées par des virgules<input name={`notes${suffix}`} defaultValue={translation.tastingNotes.join(", ")} /></label></div>
    <div className="field field--wide"><label>Titre SEO<input name={`seoTitle${suffix}`} defaultValue={translation.seoTitle} required /></label></div><div className="field field--wide"><label>Description SEO<textarea name={`seoDescription${suffix}`} defaultValue={translation.seoDescription} required /></label></div>
  </div></fieldset>;
}

function VariantList({ productId, variants, demo }: { productId: string; variants: readonly ProductVariant[]; demo: boolean }) {
  if (variants.length === 0) return <p className="admin-notice">Aucune variante active pour ce produit.</p>;
  return <div className="ui-table-wrap"><table className="ui-table">
    <thead><tr><th>Variante</th><th>SKU</th><th>Poids</th><th>Stock</th><th>Prix public</th><th>Prix pro</th><th>Coût interne</th><th>Action</th></tr></thead>
    <tbody>{variants.map((variant) => {
      const retailOffer = variant.offers.find((offer) => offer.audience === "retail" && offer.active);
      const professionalOffer = variant.offers.find((offer) => offer.audience === "professional" && offer.active);
      return <tr key={variant.id}>
        <td><strong>{variant.label}</strong></td>
        <td>{variant.sku}</td>
        <td>{variant.weightGrams} g</td>
        <td>{variant.stockOnHand - variant.stockReserved} disponible{variant.stockReserved > 0 ? ` · ${variant.stockReserved} réservé` : ""}</td>
        <td>{retailOffer ? formatMoney(retailOffer.price.amount, "fr-FR") : "—"}</td>
        <td>{professionalOffer ? `${formatMoney(professionalOffer.price.amount, "fr-FR")} · min. ${professionalOffer.minimumQuantity}` : "—"}</td>
        <td>{formatMoney(variant.internalCostCents, "fr-FR")}</td>
        <td><Form method="post" onSubmit={(event) => { if (!window.confirm(`Supprimer la variante « ${variant.label} » de la vente ? L’historique sera conservé.`)) event.preventDefault(); }}>
          <input type="hidden" name="intent" value="delete_variant" />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="variantId" value={variant.id} />
          <button className="ui-button ui-button--danger ui-button--sm" type="submit" disabled={demo || variant.stockReserved > 0} aria-label={`Supprimer la variante ${variant.label}`} title={variant.stockReserved > 0 ? "Suppression impossible tant que du stock est réservé" : undefined}><Trash2 aria-hidden="true" /> Supprimer</button>
        </Form></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export default function AdminProduct() {
  const { demo, isNew, product } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>();
  return <AdminShell active="products"><header className="admin-heading"><div><p className="eyebrow">Catalogue</p><h1>{isNew ? "Nouveau café" : product.translations["fr-FR"].name}</h1></div>{!isNew ? <Link className="ui-button ui-button--outline" to={`/boutique/${product.slug}`}>Voir la fiche</Link> : null}</header>{demo ? <p className="admin-notice">Lecture seule en démonstration.</p> : null}{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"}>{result.message}</p> : null}<Form method="post" className="ui-card admin-editor"><input type="hidden" name="intent" value="save_product" /><input type="hidden" name="productId" value={product.id} /><div className="form-grid"><div className="field"><label>Slug<input name="slug" defaultValue={product.slug} required /></label></div><div className="field"><label>Statut<select name="status" defaultValue={product.status} disabled={isNew}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select>{isNew ? <input type="hidden" name="status" value="draft" /> : null}</label></div><div className="field"><label>Altitude (m)<input name="altitudeMeters" type="number" min="0" defaultValue={product.altitudeMeters} /></label></div><label><input name="featured" type="checkbox" defaultChecked={product.featured} /> Mis en avant</label></div><TranslationFields language="Français" translation={product.translations["fr-FR"]} /><TranslationFields language="English" translation={product.translations["en-GB"]} /><button className="ui-button ui-button--default" type="submit" disabled={demo}>Enregistrer le produit</button></Form>{!isNew ? <><section className="ui-card admin-editor"><h2>Variantes existantes</h2><p>La suppression retire la variante de la vente tout en conservant son historique de stock et de commandes.</p><VariantList productId={product.id} variants={product.variants} demo={demo} /></section><section className="ui-card admin-editor"><h2>Ajouter une variante</h2><Form method="post" className="form-grid"><input type="hidden" name="intent" value="create_variant" /><input type="hidden" name="productId" value={product.id} /><div className="field"><label>SKU<input name="sku" required /></label></div><div className="field"><label>Libellé<input name="label" placeholder="200 g" required /></label></div><div className="field"><label>Poids (g)<input name="weightGrams" type="number" min="1" required /></label></div><div className="field"><label>Stock initial<input name="stockOnHand" type="number" min="0" defaultValue="0" required /></label></div><div className="field"><label>Seuil bas<input name="lowStockThreshold" type="number" min="0" defaultValue="5" required /></label></div><div className="field"><label>Coût interne (¢)<input name="internalCostCents" type="number" min="0" required /></label></div><div className="field"><label>Prix public (¢)<input name="retailPriceCents" type="number" min="0" required /></label></div><div className="field"><label>Code douanier<input name="hsCode" defaultValue="090121" required /></label></div><div className="field"><label>Origine douanière<input name="customsOriginCountry" defaultValue="FR" maxLength={2} required /></label></div><label><input name="professional" type="checkbox" /> Offre professionnelle</label><div className="field"><label>Prix pro (¢)<input name="proPriceCents" type="number" min="0" defaultValue="0" /></label></div><div className="field"><label>Minimum pro<input name="proMinimumQuantity" type="number" min="1" defaultValue="1" /></label></div><button className="ui-button ui-button--outline" type="submit" disabled={demo}><Plus aria-hidden="true" /> Ajouter la variante</button></Form></section><section className="ui-card admin-editor"><h2>Galerie</h2><div className="admin-media-grid">{product.media.map((media) => <img key={media.id} src={media.url} alt={media.alt["fr-FR"]} />)}</div><Form method="post" encType="multipart/form-data" className="form-grid"><input type="hidden" name="intent" value="upload_media" /><input type="hidden" name="productId" value={product.id} /><div className="field field--wide"><label>Fichier<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></label></div><div className="field"><label>Texte alternatif FR<input name="altFr" required /></label></div><div className="field"><label>Alternative text EN<input name="altEn" required /></label></div><button className="ui-button ui-button--outline" type="submit" disabled={demo}><Upload aria-hidden="true" /> Ajouter l’image</button></Form></section></> : <p className="admin-notice">Enregistrez d’abord le café en brouillon, puis ajoutez ses variantes et ses images avant publication.</p>}</AdminShell>;
}
