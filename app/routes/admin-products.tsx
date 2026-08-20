import { useEffect, useState } from "react";
import { Archive, GripVertical, MoveDown, MoveUp, PackageOpen, Plus, Save } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney } from "~/domain/money";
import type { Product, ProductStatus } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { getAdminProducts } from "~/lib/catalog.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const productStockUpdateSchema = z.object({ productId: z.uuid(), stockOnHandGrams: z.coerce.number().int().min(0), lowStockThresholdGrams: z.coerce.number().int().min(0) });
const variantUpdateSchema = z.object({
  variantId: z.uuid(), internalCostCents: z.coerce.number().int().min(0),
});
const productOrderSchema = z.object({ catalogue: z.enum(["current", "archived"]), productIds: z.array(z.uuid()).min(1) });

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Les mutations sont désactivées en mode démonstration." };
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "reorder_products") {
    const parsed = productOrderSchema.safeParse({ catalogue: form.get("catalogue"), productIds: form.getAll("productId").map(String) });
    if (!parsed.success) return { ok: false, message: "Ordre de produits invalide." };
    const client = createServiceSupabase();
    if (!client) return { ok: false, message: "Base de données indisponible." };
    const { data: orderedProducts, error: productsError } = await client.from("products").select("id,status").in("id", parsed.data.productIds);
    if (productsError || orderedProducts?.length !== parsed.data.productIds.length) return { ok: false, message: productsError?.message ?? "Un produit est introuvable." };
    const matchesCatalogue = orderedProducts.every((product: { status: ProductStatus }) => parsed.data.catalogue === "archived" ? product.status === "archived" : product.status !== "archived");
    if (!matchesCatalogue) return { ok: false, message: "Les produits doivent rester dans leur catalogue d’origine." };
    const updates = await Promise.all(parsed.data.productIds.map((productId, index) => client.from("products").update({ display_order: index + 1, updated_at: new Date().toISOString() }).eq("id", productId)));
    const failedUpdate = updates.find((update) => update.error);
    if (failedUpdate?.error) return { ok: false, message: failedUpdate.error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "product.reordered", entity_type: "catalogue", entity_id: parsed.data.catalogue, after_data: { productIds: parsed.data.productIds } });
    return { ok: true, message: "Ordre d’affichage enregistré." };
  }
  if (intent !== "update_variants") return { ok: false, message: "Action invalide." };
  const values = (name: string) => form.getAll(name).map(String);
  const productUpdates = values("productId").map((productId, index) => productStockUpdateSchema.safeParse({ productId, stockOnHandGrams: values("stockOnHandGrams")[index], lowStockThresholdGrams: values("lowStockThresholdGrams")[index] }));
  const variantIds = values("variantId");
  const costs = values("internalCostCents");
  const updates = variantIds.map((variantId, index) => variantUpdateSchema.safeParse({ variantId, internalCostCents: costs[index] }));
  if (productUpdates.length === 0 || productUpdates.some((update) => !update.success) || updates.some((update) => !update.success)) return { ok: false, message: "Valeurs invalides." };
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base de données indisponible." };
  const stockRows = productUpdates.filter((update): update is { success: true; data: z.infer<typeof productStockUpdateSchema> } => update.success).map(({ data }) => data);
  const { data: currentProducts, error: readError } = await client.from("products").select("id,stock_reserved_grams").in("id", stockRows.map((row) => row.productId));
  if (readError) return { ok: false, message: readError.message };
  for (const row of stockRows) {
    const current = currentProducts?.find((product) => product.id === row.productId);
    if (!current || row.stockOnHandGrams < Number(current.stock_reserved_grams ?? 0)) return { ok: false, message: "Le stock total ne peut pas être inférieur au stock réservé." };
    const { error } = await client.from("products").update({ stock_on_hand_grams: row.stockOnHandGrams, low_stock_threshold_grams: row.lowStockThresholdGrams, updated_at: new Date().toISOString() }).eq("id", row.productId);
    if (error) return { ok: false, message: error.message };
  }
  const variantRows = updates.filter((update): update is { success: true; data: z.infer<typeof variantUpdateSchema> } => update.success).map(({ data }) => data);
  for (const row of variantRows) {
    const { error } = await client.from("product_variants").update({ internal_cost_cents: row.internalCostCents, updated_at: new Date().toISOString() }).eq("id", row.variantId);
    if (error) return { ok: false, message: error.message };
    const { error: offerError } = await client.from("variant_offers").upsert({
      variant_id: row.variantId,
      audience: "retail",
      price_cents: row.internalCostCents,
      minimum_quantity: 1,
      active: true,
    }, { onConflict: "variant_id,audience" });
    if (offerError) return { ok: false, message: offerError.message };
  }
  await client.from("audit_log").insert({ actor_id: admin.id, action: "product.stock_updated", entity_type: "products", entity_id: stockRows[0].productId, after_data: { products: stockRows } });
  return { ok: true, message: `${stockRows.length} stock${stockRows.length > 1 ? "s" : ""} café et ${variantRows.length} variante${variantRows.length > 1 ? "s" : ""} enregistrés.` };

}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request); const products = await getAdminProducts(); const variants = products.flatMap((product) => product.variants);
  return { demo: admin.demo, products, stats: { products: products.length, published: products.filter((product) => product.status === "published").length, archived: products.filter((product) => product.status === "archived").length, variants: variants.length, lowStock: variants.filter((variant) => variant.stockOnHand - variant.stockReserved <= variant.lowStockThreshold).length } };
}
export const meta: MetaFunction = () => [{ title: "Produits | Administration Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];
const statusLabels: Record<ProductStatus, string> = { draft: "Brouillon", published: "Publié", archived: "Archivé" };
type ProductGroup = Readonly<{ id: string; name: string; products: readonly Product[] }>;

function adminCoffeeId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cafe";
}

function groupProductsByName(products: readonly Product[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const product of products) { const name = product.translations["fr-FR"].name.trim() || "Café sans nom"; const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR"); const previous = groups.get(key); groups.set(key, previous ? { ...previous, products: [...previous.products, product] } : { id: `${adminCoffeeId(name)}-${adminCoffeeId(product.id)}`, name, products: [product] }); }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, "fr-FR"));
}
function LegacyProductTable({ products, emptyMessage, label }: { products: readonly Product[]; emptyMessage: string; label: string }) {
 return <CardContent style={{ padding: 0 }}><Table aria-label={label}><TableHeader><TableRow><TableHead>Fiche</TableHead><TableHead>Statut</TableHead><TableHead>Variante</TableHead><TableHead>Stock disponible</TableHead><TableHead>Coût interne</TableHead><TableHead>Mise à jour rapide</TableHead></TableRow></TableHeader><TableBody>{products.flatMap((product) => product.variants.length === 0 ? [<TableRow key={product.id}><TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>Ouvrir la fiche</Link></TableCell><TableCell><Badge>{statusLabels[product.status]}</Badge></TableCell><TableCell colSpan={4}><span className="admin-muted">Aucune variante — ouvrez la fiche pour en ajouter une.</span></TableCell></TableRow>] : [...product.variants].sort((left, right) => left.weightGrams - right.weightGrams || left.label.localeCompare(right.label, "fr-FR")).map((variant) => { const availableStock = variant.stockOnHand - variant.stockReserved; return <TableRow key={variant.id}><TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>Ouvrir la fiche</Link><br /><small>{variant.sku}</small></TableCell><TableCell><Badge>{statusLabels[product.status]}</Badge></TableCell><TableCell>{variant.label}</TableCell><TableCell><span className={availableStock <= variant.lowStockThreshold ? "admin-stock-warning" : undefined}>{availableStock}</span><br /><small>Réservé : {variant.stockReserved} · Seuil {variant.lowStockThreshold}</small></TableCell><TableCell>{formatMoney(variant.internalCostCents, "fr-FR")}</TableCell><TableCell><div className="admin-quick-form"><input type="hidden" name="variantId" value={variant.id} /><label><span>Stock total</span><input name="stockOnHand" type="number" min="0" defaultValue={variant.stockOnHand} /></label><label><span>Seuil d’alerte</span><input name="lowStockThreshold" type="number" min="0" defaultValue={variant.lowStockThreshold} /></label><label><span>Coût en centimes</span><input name="internalCostCents" type="number" min="0" defaultValue={variant.internalCostCents} /></label></div></TableCell></TableRow>; }))}</TableBody></Table>{products.length === 0 ? <p className="admin-empty-state">{emptyMessage}</p> : null}</CardContent>;
}
function ProductTable({ products, emptyMessage, label }: { products: readonly Product[]; emptyMessage: string; label: string }) {
  return (
    <CardContent style={{ padding: 0 }}>
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            <TableHead>Fiche</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Variante</TableHead>
            <TableHead>Stock disponible</TableHead>
            <TableHead>Mise à jour rapide</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.flatMap((product) => product.variants.length === 0
            ? [<TableRow key={product.id}><TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>Ouvrir la fiche</Link></TableCell><TableCell><Badge>{statusLabels[product.status]}</Badge></TableCell><TableCell colSpan={3}><span className="admin-muted">Aucune variante — ouvrez la fiche pour en ajouter une.</span></TableCell></TableRow>]
            : [...product.variants].sort((left, right) => left.weightGrams - right.weightGrams || left.label.localeCompare(right.label, "fr-FR")).map((variant, index) => {
              const availableGrams = Math.max(0, product.stockOnHandGrams - product.stockReservedGrams);
              const availableUnits = Math.floor(availableGrams / variant.weightGrams);
              const thresholdUnits = Math.floor(product.lowStockThresholdGrams / variant.weightGrams);
              return <TableRow key={variant.id}><TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>Ouvrir la fiche</Link><br /><small>{variant.sku}</small></TableCell><TableCell><Badge>{statusLabels[product.status]}</Badge></TableCell><TableCell>{variant.label}</TableCell><TableCell><span className={availableGrams <= product.lowStockThresholdGrams ? "admin-stock-warning" : undefined}>{availableUnits} paquet{availableUnits > 1 ? "s" : ""}</span><br /><small>{availableGrams} g disponibles · seuil {product.lowStockThresholdGrams} g ({thresholdUnits} paquets)</small></TableCell><TableCell><div className="admin-quick-form">{index === 0 ? <><input type="hidden" name="productId" value={product.id} /><label><span>Stock total du café (g)</span><input name="stockOnHandGrams" type="number" min="0" step="1" defaultValue={product.stockOnHandGrams} /></label><label><span>Seuil d’alerte (g)</span><input name="lowStockThresholdGrams" type="number" min="0" step="1" defaultValue={product.lowStockThresholdGrams} /></label></> : null}<input type="hidden" name="variantId" value={variant.id} /><label><span>Coût en centimes</span><input name="internalCostCents" type="number" min="0" defaultValue={variant.internalCostCents} /></label></div></TableCell></TableRow>;
            }))}
        </TableBody>
      </Table>
      {products.length === 0 ? <p className="admin-empty-state">{emptyMessage}</p> : null}
    </CardContent>
  );
}

function ProductTableWithoutPrices({ products, emptyMessage, label }: { products: readonly Product[]; emptyMessage: string; label: string }) {
 return <CardContent style={{ padding: 0 }}><Table aria-label={label}><TableHeader><TableRow><TableHead>Fiche</TableHead><TableHead>Statut</TableHead><TableHead>Variante</TableHead><TableHead>Stock disponible</TableHead><TableHead>Coût interne</TableHead><TableHead>Mise à jour rapide</TableHead></TableRow></TableHeader><TableBody>{products.flatMap((product) => product.variants.length === 0 ? [<TableRow key={product.id}><TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>Ouvrir la fiche</Link></TableCell><TableCell><Badge>{statusLabels[product.status]}</Badge></TableCell><TableCell colSpan={4}><span className="admin-muted">Aucune variante — ouvrez la fiche pour en ajouter une.</span></TableCell></TableRow>] : [...product.variants].sort((left, right) => left.weightGrams - right.weightGrams || left.label.localeCompare(right.label, "fr-FR")).map((variant, index) => { const availableGrams = Math.max(0, product.stockOnHandGrams - product.stockReservedGrams); const availableUnits = Math.floor(availableGrams / variant.weightGrams); const thresholdUnits = Math.floor(product.lowStockThresholdGrams / variant.weightGrams); return <TableRow key={variant.id}><TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>Ouvrir la fiche</Link><br /><small>{variant.sku}</small></TableCell><TableCell><Badge>{statusLabels[product.status]}</Badge></TableCell><TableCell>{variant.label}</TableCell><TableCell><span className={availableGrams <= product.lowStockThresholdGrams ? "admin-stock-warning" : undefined}>{availableUnits} paquet{availableUnits > 1 ? "s" : ""}</span><br /><small>{availableGrams} g disponibles · seuil {product.lowStockThresholdGrams} g ({thresholdUnits} paquets)</small></TableCell><TableCell>{formatMoney(variant.internalCostCents, "fr-FR")}</TableCell><TableCell><div className="admin-quick-form">{index === 0 ? <><input type="hidden" name="productId" value={product.id} /><label><span>Stock total du café (g)</span><input name="stockOnHandGrams" type="number" min="0" step="1" defaultValue={product.stockOnHandGrams} /></label><label><span>Seuil d’alerte (g)</span><input name="lowStockThresholdGrams" type="number" min="0" step="1" defaultValue={product.lowStockThresholdGrams} /></label></> : null}<input type="hidden" name="variantId" value={variant.id} /><label><span>Coût en centimes</span><input name="internalCostCents" type="number" min="0" defaultValue={variant.internalCostCents} /></label></div></TableCell></TableRow>; }))}</TableBody></Table>{products.length === 0 ? <p className="admin-empty-state">{emptyMessage}</p> : null}</CardContent>;
}
function CoffeeTabs({ products, emptyMessage, label }: { products: readonly Product[]; emptyMessage: string; label: string }) {
  const groups = groupProductsByName(products); const [activeTab, setActiveTab] = useState(groups[0]?.id ?? ""); useEffect(() => { if (!groups.some((group) => group.id === activeTab)) setActiveTab(groups[0]?.id ?? ""); }, [activeTab, groups]);
  const tabsId = `admin-coffee-${adminCoffeeId(label)}`;
  if (groups.length === 0) return <Card><ProductTable products={[]} label={label} emptyMessage={emptyMessage} /></Card>;
  return <div className="admin-coffee-tabs"><div className="admin-coffee-tabs__list" role="tablist" aria-label={label}>{groups.map((group) => <button key={group.id} id={`${tabsId}-${group.id}-tab`} className="admin-coffee-tabs__tab" type="button" role="tab" aria-selected={group.id === activeTab} aria-controls={`${tabsId}-${group.id}-panel`} onClick={() => setActiveTab(group.id)}>{group.name}<span>{group.products.reduce((count, product) => count + product.variants.length, 0)}</span></button>)}</div>{groups.map((group) => { const variantCount = group.products.reduce((count, product) => count + product.variants.length, 0); return <div key={group.id} id={`${tabsId}-${group.id}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${group.id}-tab`} hidden={group.id !== activeTab}><div className="admin-coffee-tabs__summary"><strong>{group.name}</strong><span>{variantCount} variante{variantCount > 1 ? "s" : ""}{group.products.length > 1 ? ` réunies depuis ${group.products.length} fiches` : ""}</span></div><Card><ProductTable products={group.products} label={`${label} — ${group.name}`} emptyMessage={emptyMessage} /></Card></div>; })}</div>;
}
function ProductOrderList({
  products,
  catalogue,
  demo,
}: {
  products: readonly Product[];
  catalogue: "current" | "archived";
  demo: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const [orderedProducts, setOrderedProducts] = useState(products);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  useEffect(() => {
    setOrderedProducts(products);
  }, [products]);
  const saveOrder = (nextProducts: readonly Product[]) => {
    setOrderedProducts(nextProducts);
    const formData = new FormData();
    formData.set("intent", "reorder_products");
    formData.set("catalogue", catalogue);
    nextProducts.forEach((product) => formData.append("productId", product.id));
    fetcher.submit(formData, { method: "post" });
  };
  const move = (productId: string, offset: -1 | 1) => {
    const index = orderedProducts.findIndex(
      (product) => product.id === productId,
    );
    const target = index + offset;
    if (index < 0 || target < 0 || target >= orderedProducts.length) return;
    const nextProducts = [...orderedProducts];
    [nextProducts[index], nextProducts[target]] = [
      nextProducts[target],
      nextProducts[index],
    ];
    saveOrder(nextProducts);
  };
  if (products.length < 2) return null;
  return (
    <details
      className="admin-product-order"
      aria-label={
        catalogue === "archived"
          ? "Ordre des produits archivés"
          : "Ordre du catalogue actuel"
      }
    >
      <summary className="admin-product-order__summary">
        <span>Ordre d’affichage</span>
        <small>Afficher la réorganisation</small>
      </summary>
      <div className="admin-product-order__heading">
        <div>
          <h3>Ordre d’affichage</h3>
          <p>Glissez les cafés pour définir leur ordre sur le site.</p>
        </div>
        <span aria-live="polite">
          {fetcher.state !== "idle"
            ? "Enregistrement…"
            : (fetcher.data?.message ?? "")}
        </span>
      </div>
      <ol>
        {orderedProducts.map((product, index) => (
          <li
            key={product.id}
            className={draggedId === product.id ? "is-dragging" : undefined}
            draggable={!demo}
            onDragStart={() => setDraggedId(product.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggedId || draggedId === product.id) return;
              const draggedIndex = orderedProducts.findIndex(
                (item) => item.id === draggedId,
              );
              const targetIndex = orderedProducts.findIndex(
                (item) => item.id === product.id,
              );
              const nextProducts = [...orderedProducts];
              const [draggedProduct] = nextProducts.splice(draggedIndex, 1);
              nextProducts.splice(targetIndex, 0, draggedProduct);
              setDraggedId(null);
              saveOrder(nextProducts);
            }}
            onDragEnd={() => setDraggedId(null)}
          >
            <GripVertical aria-hidden="true" />
            <span className="admin-product-order__position">{index + 1}</span>
            <strong>{product.translations["fr-FR"].name}</strong>
            <span>{statusLabels[product.status]}</span>
            <div className="admin-product-order__actions">
              <button
                type="button"
                onClick={() => move(product.id, -1)}
                disabled={demo || index === 0}
                aria-label={`Monter ${product.translations["fr-FR"].name}`}
              >
                <MoveUp aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(product.id, 1)}
                disabled={demo || index === orderedProducts.length - 1}
                aria-label={`Descendre ${product.translations["fr-FR"].name}`}
              >
                <MoveDown aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function AdminProducts() {
  const { demo, products, stats } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const currentProducts = products.filter(
    (product) => product.status !== "archived",
  );
  const archivedProducts = products.filter(
    (product) => product.status === "archived",
  );
  return (
    <AdminShell active="products">
      <Form method="post">
        <input type="hidden" name="intent" value="update_variants" />
        <header className="admin-heading">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h1>Produits</h1>
            <p className="admin-heading__description">
              Gérez les cafés, leurs variantes, leurs prix et leurs niveaux de
              stock.
            </p>
          </div>
          <Link
            className={`ui-button ui-button--default${demo ? " is-disabled" : ""}`}
            to="/admin/produits/nouveau"
            aria-disabled={demo}
            onClick={demo ? (event) => event.preventDefault() : undefined}
          >
            <Plus aria-hidden="true" /> Ajouter un café
          </Link>
        </header>
        {demo ? (
          <p className="admin-notice">
            Mode démonstration local : le catalogue est en lecture seule.
          </p>
        ) : null}
        {result?.message ? (
          <p
            className={result.ok ? "form-message" : "form-message form-error"}
            role="status"
          >
            {result.message}
          </p>
        ) : null}
        <section className="stats-grid" aria-label="Indicateurs du catalogue">
          <Card>
            <CardContent>
              <p className="stat-label">Produits</p>
              <p className="stat-value">{stats.products}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="stat-label">Publiés</p>
              <p className="stat-value">{stats.published}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="stat-label">Variantes</p>
              <p className="stat-value">{stats.variants}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="stat-label">Stocks faibles</p>
              <p className="stat-value">{stats.lowStock}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="stat-label">Archivés</p>
              <p className="stat-value">{stats.archived}</p>
            </CardContent>
          </Card>
        </section>
        <section
          id="catalogue"
          className="admin-catalogue-section"
          aria-labelledby="current-products-title"
        >
          <div className="admin-catalogue-section__heading">
            <PackageOpen aria-hidden="true" />
            <div>
              <h2 id="current-products-title">Catalogue actuel</h2>
              <p>Produits publiés et brouillons en cours de préparation.</p>
            </div>
            <Badge>
              {currentProducts.length} produit
              {currentProducts.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <ProductOrderList
            products={currentProducts}
            catalogue="current"
            demo={demo}
          />
          <CoffeeTabs
            products={currentProducts}
            label="Cafés publiés et brouillons"
            emptyMessage="Aucun produit actif ou brouillon dans le catalogue."
          />
        </section>
        <section
          className="admin-catalogue-section admin-catalogue-section--archived"
          aria-labelledby="archived-products-title"
        >
          <div className="admin-catalogue-section__heading">
            <Archive aria-hidden="true" />
            <div>
              <h2 id="archived-products-title">Produits archivés</h2>
              <p>
                Ces produits ne sont plus proposés à la vente, mais leur
                historique reste accessible.
              </p>
            </div>
            <Badge>
              {archivedProducts.length} produit
              {archivedProducts.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <ProductOrderList
            products={archivedProducts}
            catalogue="archived"
            demo={demo}
          />
          <CoffeeTabs
            products={archivedProducts}
            label="Cafés archivés"
            emptyMessage="Aucun produit archivé."
          />
        </section>
        <button
          className="ui-button ui-button--default admin-product-save-fab"
          type="submit"
          disabled={demo}
        >
          <Save aria-hidden="true" /> Enregistrer
        </button>
      </Form>
    </AdminShell>
  );
}
