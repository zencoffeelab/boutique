import { ArrowRight, Boxes, LogOut, Package, ShoppingCart, Store, Truck, Users } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney, formatSignedMoney } from "~/domain/money";
import { requireAdmin } from "~/lib/auth.server";
import { getAdminProducts } from "~/lib/catalog.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const orderDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const client = admin.demo ? null : createServiceSupabase();
  const dashboardData = client ? Promise.all([
    client.from("orders").select("id,order_number,email,subtotal_cents,shipping_charged_cents,total_cents,cost_of_goods_cents,actual_shipping_cost_cents,stripe_fee_cents,status,created_at").order("created_at", { ascending: false }).limit(50),
    client.from("professional_applications").select("id").eq("status", "pending"),
    client.rpc("commerce_dashboard_stats"),
  ]) : Promise.resolve([{ data: [] }, { data: [] }, { data: null }] as const);
  const [products, [{ data: orders }, { data: applications }, { data: commerceStats }]] = await Promise.all([
    getAdminProducts(),
    dashboardData,
  ]);
  const variants = products.flatMap((product) => product.variants);
  const totals = commerceStats as { revenue_cents?: number; orders?: number; contribution_cents?: number } | null;
  const revenueCents = totals?.revenue_cents ?? 0;
  const orderCount = totals?.orders ?? 0;
  const lowStock = variants.filter((variant) => variant.stockOnHand - variant.stockReserved <= variant.lowStockThreshold).length;
  const ordersToPrepare = (orders ?? []).filter((order) => ["paid", "preparing", "ready_to_ship"].includes(order.status)).length;
  return {
    demo: admin.demo,
    stats: {
      revenueCents,
      orders: orderCount,
      averageOrderCents: orderCount > 0 ? Math.round(revenueCents / orderCount) : 0,
      contributionCents: totals?.contribution_cents ?? 0,
      publishedProducts: products.filter((product) => product.status === "published").length,
      activeVariants: variants.length,
      availableUnits: variants.reduce((total, variant) => total + Math.max(variant.stockOnHand - variant.stockReserved, 0), 0),
      lowStock,
      proApplications: (applications ?? []).length,
      ordersToPrepare,
    },
    recentOrders: (orders ?? []).slice(0, 8),
  };
}

export const meta: MetaFunction = () => [
  { title: "Tableau de bord | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

export default function Admin() {
  const { demo, stats, recentOrders } = useLoaderData<typeof loader>();
  return (
    <AdminShell active="dashboard">
      <header className="admin-heading">
        <div><p className="eyebrow">Zen Coffee Lab</p><h1>Tableau de bord</h1><p className="admin-heading__description">Une vue d’ensemble de la boutique et des tâches à traiter.</p></div>
        <Link className="ui-button ui-button--outline ui-button--sm" to="/"><Store aria-hidden="true" /> Voir la boutique</Link>
      </header>
      {demo ? <p className="admin-notice">Mode démonstration local : les données financières et les actions sont limitées.</p> : null}
      <section className="stats-grid" aria-label="Indicateurs commerciaux">
        <Card><CardContent><p className="stat-label">Chiffre d’affaires</p><p className="stat-value">{formatMoney(stats.revenueCents, "fr-FR")}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Commandes</p><p className="stat-value">{stats.orders}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Panier moyen</p><p className="stat-value">{formatMoney(stats.averageOrderCents, "fr-FR")}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Contribution</p><p className="stat-value">{formatSignedMoney(stats.contributionCents, "fr-FR")}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Produits publiés</p><p className="stat-value">{stats.publishedProducts}</p><p className="stat-detail">{stats.activeVariants} variante{stats.activeVariants > 1 ? "s" : ""} active{stats.activeVariants > 1 ? "s" : ""}</p></CardContent></Card>
        <Card><CardContent><p className="stat-label">Stock disponible</p><p className="stat-value">{stats.availableUnits}</p><p className="stat-detail">unités toutes variantes</p></CardContent></Card>
      </section>

      <section className="admin-dashboard-grid">
        <Card>
          <CardHeader className="admin-card-heading"><div><p className="eyebrow">Commandes</p><h2>Activité récente</h2></div><Link className="text-link" to="/admin/commandes">Toutes les commandes <ArrowRight aria-hidden="true" /></Link></CardHeader>
          <CardContent style={{ padding: 0 }}>
            <Table>
              <TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Date</TableHead><TableHead>Statut</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
              <TableBody>{recentOrders.map((order) => <TableRow key={order.id}><TableCell><Link className="text-link" to={`/admin/commandes?q=${encodeURIComponent(order.order_number)}`}>{order.order_number}</Link></TableCell><TableCell>{orderDateFormatter.format(new Date(order.created_at))}</TableCell><TableCell><Badge>{order.status}</Badge></TableCell><TableCell>{formatMoney(order.total_cents, "fr-FR")}</TableCell></TableRow>)}</TableBody>
            </Table>
            {recentOrders.length === 0 ? <p className="admin-empty-state">Aucune commande récente.</p> : null}
          </CardContent>
        </Card>

        <div className="admin-dashboard-sidebar">
          <Card>
            <CardHeader><p className="eyebrow">À traiter</p><h2>Tâches prioritaires</h2></CardHeader>
            <CardContent className="admin-task-list">
              <Link to="/admin/commandes"><span><ShoppingCart aria-hidden="true" /><strong>Commandes à préparer</strong></span><Badge>{stats.ordersToPrepare}</Badge></Link>
              <Link to="/admin/produits#catalogue"><span><Boxes aria-hidden="true" /><strong>Stocks faibles</strong></span><Badge>{stats.lowStock}</Badge></Link>
              <Link to="/admin/professionnels"><span><Users aria-hidden="true" /><strong>Demandes professionnelles</strong></span><Badge>{stats.proApplications}</Badge></Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><p className="eyebrow">Accès rapides</p><h2>Gérer la boutique</h2></CardHeader>
            <CardContent className="admin-quick-links">
              <Link to="/admin/produits"><Package aria-hidden="true" /><span><strong>Produits</strong><small>Catalogue, prix et variantes</small></span><ArrowRight aria-hidden="true" /></Link>
              <Link to="/admin/commandes"><ShoppingCart aria-hidden="true" /><span><strong>Commandes</strong><small>Paiements et remboursements</small></span><ArrowRight aria-hidden="true" /></Link>
              <Link to="/admin/expedition"><Truck aria-hidden="true" /><span><strong>Expédition</strong><small>Étiquettes et colis</small></span><ArrowRight aria-hidden="true" /></Link>
            </CardContent>
          </Card>
        </div>
      </section>
      <footer className="admin-footer"><Link className="text-link" to="/mon-compte"><LogOut aria-hidden="true" /> Quitter l’administration</Link></footer>
    </AdminShell>
  );
}
