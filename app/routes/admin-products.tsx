import { Plus } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney } from "~/domain/money";
import { requireAdmin } from "~/lib/auth.server";
import { getAdminProducts } from "~/lib/catalog.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const variantUpdateSchema = z.object({
  intent: z.literal("update_variant"), variantId: z.uuid(), retailOfferId: z.uuid(),
  stockOnHand: z.coerce.number().int().min(0), lowStockThreshold: z.coerce.number().int().min(0),
  internalCostCents: z.coerce.number().int().min(0), retailPriceCents: z.coerce.number().int().min(0),
  proOfferId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  proPriceCents: z.coerce.number().int().min(0).optional(), proMinimumQuantity: z.coerce.number().int().min(1).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Les mutations sont désactivées en mode démonstration." };
  const parsed = variantUpdateSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { ok: false, message: "Valeurs invalides.", errors: parsed.error.flatten().fieldErrors };
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base de données indisponible." };
  const before = await client.from("product_variants").select("*").eq("id", parsed.data.variantId).single();
  const { error } = await client.from("product_variants").update({ stock_on_hand: parsed.data.stockOnHand, low_stock_threshold: parsed.data.lowStockThreshold, internal_cost_cents: parsed.data.internalCostCents, updated_at: new Date().toISOString() }).eq("id", parsed.data.variantId);
  if (error) return { ok: false, message: error.message };
  const { error: offerError } = await client.from("variant_offers").update({ price_cents: parsed.data.retailPriceCents }).eq("id", parsed.data.retailOfferId);
  if (offerError) return { ok: false, message: offerError.message };
  if (parsed.data.proOfferId && parsed.data.proPriceCents !== undefined && parsed.data.proMinimumQuantity !== undefined) {
    const { error: proError } = await client.from("variant_offers").update({ price_cents: parsed.data.proPriceCents, minimum_quantity: parsed.data.proMinimumQuantity }).eq("id", parsed.data.proOfferId);
    if (proError) return { ok: false, message: proError.message };
  }
  await client.from("audit_log").insert({ actor_id: admin.id, action: "variant.updated", entity_type: "product_variant", entity_id: parsed.data.variantId, before_data: before.data, after_data: parsed.data });
  return { ok: true, message: "Variante mise à jour." };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const products = await getAdminProducts();
  const variants = products.flatMap((product) => product.variants);
  return {
    demo: admin.demo,
    products,
    stats: {
      products: products.length,
      published: products.filter((product) => product.status === "published").length,
      archived: products.filter((product) => product.status === "archived").length,
      variants: variants.length,
      lowStock: variants.filter((variant) => variant.stockOnHand - variant.stockReserved <= variant.lowStockThreshold).length,
    },
  };
}

export const meta: MetaFunction = () => [
  { title: "Produits | Administration Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

export default function AdminProducts() {
  const { demo, products, stats } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <AdminShell active="products">
      <header className="admin-heading">
        <div><p className="eyebrow">Catalogue</p><h1>Produits</h1><p className="admin-heading__description">Gérez les cafés, leurs variantes, leurs prix et leurs niveaux de stock.</p></div>
        <Link className={`ui-button ui-button--default${demo ? " is-disabled" : ""}`} to="/admin/produits/nouveau" aria-disabled={demo} onClick={demo ? (event) => event.preventDefault() : undefined}><Plus aria-hidden="true" /> Ajouter un café</Link>
      </header>
      {demo ? <p className="admin-notice">Mode démonstration local : le catalogue est en lecture seule.</p> : null}
      {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
      <section className="stats-grid" aria-label="Indicateurs du catalogue">
        <Card><CardContent><p className="stat-label">Produits</p><p className="stat-value">{stats.products}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Publiés</p><p className="stat-value">{stats.published}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Variantes</p><p className="stat-value">{stats.variants}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Stocks faibles</p><p className="stat-value">{stats.lowStock}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Archivés</p><p className="stat-value">{stats.archived}</p></CardContent></Card>
      </section>
      <Card id="catalogue">
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader><TableRow><TableHead>Café</TableHead><TableHead>Statut</TableHead><TableHead>Variante</TableHead><TableHead>Stock</TableHead><TableHead>Prix public</TableHead><TableHead>Mise à jour rapide</TableHead></TableRow></TableHeader>
            <TableBody>
              {products.flatMap((product) => product.variants.length === 0 ? [
                <TableRow key={product.id}>
                  <TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>{product.translations["fr-FR"].name}</Link></TableCell>
                  <TableCell><Badge>{product.status}</Badge></TableCell>
                  <TableCell colSpan={4}><span className="admin-muted">Aucune variante — ouvrez la fiche pour en ajouter une.</span></TableCell>
                </TableRow>,
              ] : product.variants.map((variant) => {
                const retailOffer = variant.offers.find((offer) => offer.audience === "retail");
                const proOffer = variant.offers.find((offer) => offer.audience === "professional");
                const availableStock = variant.stockOnHand - variant.stockReserved;
                return (
                  <TableRow key={variant.id}>
                    <TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>{product.translations["fr-FR"].name}</Link><br /><small>{variant.sku}</small></TableCell>
                    <TableCell><Badge>{product.status}</Badge></TableCell>
                    <TableCell>{variant.label}</TableCell>
                    <TableCell><span className={availableStock <= variant.lowStockThreshold ? "admin-stock-warning" : undefined}>{availableStock}</span><br /><small>Seuil {variant.lowStockThreshold}</small></TableCell>
                    <TableCell>{formatMoney(retailOffer?.price.amount ?? 0, "fr-FR")}</TableCell>
                    <TableCell>
                      <Form method="post" className="admin-quick-form">
                        <input type="hidden" name="intent" value="update_variant" />
                        <input type="hidden" name="variantId" value={variant.id} />
                        <input type="hidden" name="retailOfferId" value={retailOffer?.id} />
                        <input type="hidden" name="proOfferId" value={proOffer?.id ?? ""} />
                        <label><span>Stock</span><input name="stockOnHand" type="number" min="0" defaultValue={variant.stockOnHand} /></label>
                        <label><span>Seuil</span><input name="lowStockThreshold" type="number" min="0" defaultValue={variant.lowStockThreshold} /></label>
                        <label><span>Prix ¢</span><input name="retailPriceCents" type="number" min="0" defaultValue={retailOffer?.price.amount ?? 0} /></label>
                        <label><span>Coût ¢</span><input name="internalCostCents" type="number" min="0" defaultValue={variant.internalCostCents} /></label>
                        {proOffer ? <><label><span>Prix pro ¢</span><input name="proPriceCents" type="number" min="0" defaultValue={proOffer.price.amount} /></label><label><span>Minimum pro</span><input name="proMinimumQuantity" type="number" min="1" defaultValue={proOffer.minimumQuantity} /></label></> : null}
                        <button className="ui-button ui-button--outline ui-button--sm" type="submit" disabled={demo}>Enregistrer</button>
                      </Form>
                    </TableCell>
                  </TableRow>
                );
              }))}
            </TableBody>
          </Table>
          {products.length === 0 ? <p className="admin-empty-state">Aucun produit dans le catalogue.</p> : null}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
