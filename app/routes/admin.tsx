import { LogOut, Store } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney, formatSignedMoney } from "~/domain/money";
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
  const client = createServiceSupabase(); if (!client) return { ok: false, message: "Base de données indisponible." };
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
  const client = admin.demo ? null : createServiceSupabase();
  const [{ data: orders }, { data: applications }, { data: commerceStats }] = client ? await Promise.all([
    client.from("orders").select("id,order_number,email,subtotal_cents,shipping_charged_cents,total_cents,cost_of_goods_cents,actual_shipping_cost_cents,stripe_fee_cents,status,created_at").order("created_at", { ascending: false }).limit(50),
    client.from("professional_applications").select("id,company_name,first_name,last_name,email,business_type,monthly_volume,status,created_at").eq("status", "pending").order("created_at"),
    client.rpc("commerce_dashboard_stats"),
  ]) : [{ data: [] }, { data: [] }, { data: null }];
  const totals = commerceStats as { revenue_cents?: number; orders?: number; contribution_cents?: number } | null;
  return {
    demo: admin.demo,
    products,
    stats: {
      revenueCents: totals?.revenue_cents ?? 0,
      orders: totals?.orders ?? 0,
      lowStock: variants.filter((variant) => variant.stockOnHand - variant.stockReserved <= variant.lowStockThreshold).length,
      proApplications: (applications ?? []).length,
      contributionCents: totals?.contribution_cents ?? 0,
    },
    recentOrders: (orders ?? []).slice(0, 8),
    applications: applications ?? [],
  };
}

export const meta: MetaFunction = () => [
  { title: "Administration | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

function ProfessionalDecision({ application }: { application: { id: string; company_name: string; first_name: string; last_name: string; email: string; business_type: string; monthly_volume: string } }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string }>();
  return <article className="admin-application"><div><strong>{application.company_name}</strong><p>{application.first_name} {application.last_name} · {application.business_type} · {application.monthly_volume}</p><small>{application.email}</small></div><fetcher.Form method="post" action={`/api/admin/pro-applications/${application.id}/decision`}><input type="hidden" name="note" value="" /><button className="ui-button ui-button--default ui-button--sm" name="decision" value="approved" disabled={fetcher.state !== "idle"}>Approuver</button><button className="ui-button ui-button--ghost ui-button--sm" name="decision" value="rejected" disabled={fetcher.state !== "idle"}>Refuser</button></fetcher.Form></article>;
}

export default function Admin() {
  const { demo, products, stats, recentOrders, applications } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <AdminShell active="dashboard">
        <header className="admin-heading">
          <div><p className="eyebrow">Zen Coffee Lab</p><h1>Tableau de bord</h1></div>
          <Link className="ui-button ui-button--outline ui-button--sm" to="/"><Store aria-hidden="true" /> Voir la boutique</Link>
        </header>
        {demo ? <p className="admin-notice">Mode démonstration local : les mutations sont désactivées. Les coûts à 0 € et tarifs pro du catalogue de démo doivent être remplacés avant production.</p> : null}
        {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
        <section className="stats-grid" aria-label="Indicateurs">
          <Card><CardContent><p className="stat-label">Chiffre d’affaires</p><p className="stat-value">{formatMoney(stats.revenueCents, "fr-FR")}</p></CardContent></Card>
          <Card><CardContent><p className="stat-label">Commandes</p><p className="stat-value">{stats.orders}</p></CardContent></Card>
          <Card><CardContent><p className="stat-label">Stocks faibles</p><p className="stat-value">{stats.lowStock}</p></CardContent></Card>
          <Card><CardContent><p className="stat-label">Demandes pro</p><p className="stat-value">{stats.proApplications}</p></CardContent></Card>
          <Card><CardContent><p className="stat-label">Contribution</p><p className="stat-value">{formatSignedMoney(stats.contributionCents, "fr-FR")}</p></CardContent></Card>
        </section>
        <section className="admin-grid">
          <Card id="catalogue">
            <CardHeader>
              <div className="section-header" style={{ margin: 0 }}>
                <div><p className="eyebrow">Catalogue</p><h2 style={{ font: "600 1.3rem/1 var(--sans)", margin: 0 }}>Produits et variantes</h2></div>
                <Link className={`ui-button ui-button--default ui-button--sm${demo ? " is-disabled" : ""}`} to="/admin/produits/nouveau" aria-disabled={demo} onClick={demo ? (event) => event.preventDefault() : undefined}>Ajouter un café</Link>
              </div>
            </CardHeader>
            <CardContent style={{ padding: 0 }}>
              <Table>
                <TableHeader><TableRow><TableHead>Café</TableHead><TableHead>Statut</TableHead><TableHead>Variante</TableHead><TableHead>Stock</TableHead><TableHead>Prix public</TableHead><TableHead>Coût interne</TableHead></TableRow></TableHeader>
                <TableBody>
                  {products.flatMap((product) => product.variants.map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell><Link className="text-link" to={`/admin/produits/${product.id}`}>{product.translations["fr-FR"].name}</Link><br /><small>{variant.sku}</small></TableCell>
                      <TableCell><Badge>{product.status}</Badge></TableCell>
                      <TableCell>{variant.label}</TableCell>
                      <TableCell>{variant.stockOnHand - variant.stockReserved}<br /><small>Seuil {variant.lowStockThreshold}</small></TableCell>
                      <TableCell>{formatMoney(variant.offers.find((offer) => offer.audience === "retail")?.price.amount ?? 0, "fr-FR")}</TableCell>
                      <TableCell>
                        <Form method="post" className="admin-quick-form">
                          <input type="hidden" name="intent" value="update_variant" />
                          <input type="hidden" name="variantId" value={variant.id} />
                          <input type="hidden" name="retailOfferId" value={variant.offers.find((offer) => offer.audience === "retail")?.id} />
                          <input type="hidden" name="proOfferId" value={variant.offers.find((offer) => offer.audience === "professional")?.id ?? ""} />
                          <label><span>Stock</span><input name="stockOnHand" type="number" min="0" defaultValue={variant.stockOnHand} /></label>
                          <label><span>Seuil</span><input name="lowStockThreshold" type="number" min="0" defaultValue={variant.lowStockThreshold} /></label>
                          <label><span>Prix ¢</span><input name="retailPriceCents" type="number" min="0" defaultValue={variant.offers.find((offer) => offer.audience === "retail")?.price.amount ?? 0} /></label>
                          <label><span>Coût ¢</span><input name="internalCostCents" type="number" min="0" defaultValue={variant.internalCostCents} /></label>
                          {variant.offers.find((offer) => offer.audience === "professional") ? <><label><span>Prix pro ¢</span><input name="proPriceCents" type="number" min="0" defaultValue={variant.offers.find((offer) => offer.audience === "professional")?.price.amount} /></label><label><span>Minimum pro</span><input name="proMinimumQuantity" type="number" min="1" defaultValue={variant.offers.find((offer) => offer.audience === "professional")?.minimumQuantity} /></label></> : null}
                          <button className="ui-button ui-button--outline ui-button--sm" type="submit" disabled={demo}>Enregistrer</button>
                        </Form>
                      </TableCell>
                    </TableRow>
                  )))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div>
            <Card>
              <CardHeader><p className="eyebrow">Commandes</p><h2 style={{ font: "600 1.3rem/1 var(--sans)", margin: 0 }}>Activité récente</h2></CardHeader>
              <CardContent style={{ padding: 0 }}><Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Statut</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{recentOrders.map((order) => <TableRow key={order.id}><TableCell>{order.order_number}</TableCell><TableCell><Badge>{order.status}</Badge></TableCell><TableCell>{formatMoney(order.total_cents, "fr-FR")}</TableCell></TableRow>)}</TableBody></Table>{recentOrders.length === 0 ? <p style={{ padding: "1rem" }}>Aucune commande.</p> : null}</CardContent>
            </Card>
            <Card id="demandes-pro" style={{ marginTop: "1rem" }}>
              <CardHeader><p className="eyebrow">Professionnels</p><h2 style={{ font: "600 1.3rem/1 var(--sans)", margin: 0 }}>Demandes en attente</h2></CardHeader>
              <CardContent>{applications.map((application) => <ProfessionalDecision key={application.id} application={application} />)}{applications.length === 0 ? <p>Aucune demande à traiter.</p> : null}</CardContent>
            </Card>
          </div>
        </section>
        <footer style={{ marginTop: "3rem" }}><Link className="text-link" to="/mon-compte"><LogOut aria-hidden="true" /> Quitter l’administration</Link></footer>
    </AdminShell>
  );
}
