import { BadgeCheck, CircleDollarSign, Search, ShoppingBag, UserRound, Users } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { AdminMemberRoleForm } from "~/components/admin-member-role-form";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney } from "~/domain/money";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

type CustomerProfile = {
  id: string;
  role: "customer" | "admin";
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
};

type CustomerAuthUser = {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
  user_metadata?: { signup_source?: unknown };
};

type CustomerOrder = {
  id: string;
  profile_id: string | null;
  email: string;
  total_cents: number;
  paid_at: string | null;
  created_at: string;
  shipping_address: { city?: unknown; countryCode?: unknown } | null;
};

const CUSTOMER_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function normalizeEmail(value: string | undefined | null) {
  return value?.trim().toLocaleLowerCase("fr-FR") ?? "";
}
function includesSearch(values: unknown[], query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("fr-FR");
  return values.some((value) => String(value ?? "").toLocaleLowerCase("fr-FR").includes(normalized));
}

function signupSource(user: CustomerAuthUser, paidOrders: CustomerOrder[]) {
  const metadataSource = user.user_metadata?.signup_source;
  if (metadataSource === "checkout") return "Commande";
  if (metadataSource === "account") return "Mon compte";
  return paidOrders.some((order) => new Date(order.created_at) <= new Date(user.created_at)) ? "Commande" : "Mon compte";
}

export function buildRetailCustomers(profiles: CustomerProfile[], users: CustomerAuthUser[], orders: CustomerOrder[]) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const profileIdByEmail = new Map(users.flatMap((user) => user.email ? [[normalizeEmail(user.email), user.id] as const] : []));
  const ordersByProfile = new Map<string, CustomerOrder[]>();

  for (const order of orders) {
    const customerId = order.profile_id ?? profileIdByEmail.get(normalizeEmail(order.email));
    if (!customerId) continue;
    const customerOrders = ordersByProfile.get(customerId) ?? [];
    customerOrders.push(order);
    ordersByProfile.set(customerId, customerOrders);
  }

  return profiles.flatMap((profile) => {
    const user = usersById.get(profile.id);
    if (!user?.email) return [];
    const paidOrders = (ordersByProfile.get(profile.id) ?? [])
      .filter((order) => Boolean(order.paid_at))
      .toSorted((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    const latestAddress = paidOrders[0]?.shipping_address;
    return [{
      id: profile.id,
      role: profile.role,
      firstName: profile.first_name ?? "",
      lastName: profile.last_name ?? "",
      email: user.email,
      phone: profile.phone ?? "",
      createdAt: profile.created_at,
      emailConfirmed: Boolean(user.email_confirmed_at),
      lastSignInAt: user.last_sign_in_at ?? null,
      signupSource: signupSource(user, paidOrders),
      orderCount: paidOrders.length,
      totalSpentCents: paidOrders.reduce((total, order) => total + order.total_cents, 0),
      lastOrderAt: paidOrders[0]?.created_at ?? null,
      location: [latestAddress?.city, latestAddress?.countryCode].filter((value): value is string => typeof value === "string" && Boolean(value)).join(" · "),
    }];
  }).toSorted((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "confirmed" || requestedStatus === "pending" || requestedStatus === "buyers" || requestedStatus === "admins" ? requestedStatus : "all";
  if (admin.demo) return { demo: true, adminId: admin.id, query, status, summary: { customers: 0, confirmed: 0, buyers: 0, admins: 0, revenueCents: 0 }, customers: [] };

  const client = createServiceSupabase();
  if (!client) throw new Response("Base de données indisponible.", { status: 503 });
  const [profileResult, userResult, orderResult] = await Promise.all([
    client.from("profiles").select("id,role,first_name,last_name,phone,created_at").is("professional_status", null).order("created_at", { ascending: false }).limit(5_000),
    client.auth.admin.listUsers({ page: 1, perPage: 1_000 }),
    client.from("orders").select("id,profile_id,email,total_cents,paid_at,created_at,shipping_address").eq("audience", "retail").order("created_at", { ascending: false }).limit(10_000),
  ]);
  if (profileResult.error) throw new Response(profileResult.error.message, { status: 500 });
  if (userResult.error) throw new Response(userResult.error.message, { status: 500 });
  if (orderResult.error) throw new Response(orderResult.error.message, { status: 500 });

  const allCustomers = buildRetailCustomers(
    (profileResult.data ?? []) as CustomerProfile[],
    userResult.data.users as CustomerAuthUser[],
    (orderResult.data ?? []) as CustomerOrder[],
  );
  const matchesStatus = (customer: (typeof allCustomers)[number]) => status === "all"
    || (status === "confirmed" && customer.emailConfirmed)
    || (status === "pending" && !customer.emailConfirmed)
    || (status === "buyers" && customer.orderCount > 0)
    || (status === "admins" && customer.role === "admin");
  const customers = allCustomers.filter((customer) => matchesStatus(customer) && includesSearch([customer.firstName, customer.lastName, customer.email, customer.phone, customer.location], query));

  return {
    demo: false,
    adminId: admin.id,
    query,
    status,
    summary: {
      customers: allCustomers.length,
      confirmed: allCustomers.filter((customer) => customer.emailConfirmed).length,
      buyers: allCustomers.filter((customer) => customer.orderCount > 0).length,
      admins: allCustomers.filter((customer) => customer.role === "admin").length,
      revenueCents: allCustomers.reduce((total, customer) => total + customer.totalSpentCents, 0),
    },
    customers,
  };
}

export const meta: MetaFunction = () => [
  { title: "Clients | Administration Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

function formatDate(value: string | null) {
  return value ? CUSTOMER_DATE_FORMATTER.format(new Date(value)) : "Jamais";
}

export default function AdminCustomers() {
  const { demo, adminId, query, status, summary, customers } = useLoaderData<typeof loader>();
  return <AdminShell active="customers">
    <header className="admin-heading"><div><p className="eyebrow">Comptes & fidélité</p><h1>Clients</h1><p className="admin-heading__description">Comptes particuliers créés depuis une commande ou depuis la page Mon compte.</p></div><Link className="ui-button ui-button--outline ui-button--sm" to="/mon-compte">Voir Mon compte</Link></header>
    {demo ? <p className="admin-notice">Connectez Supabase pour consulter les comptes clients.</p> : null}
    <section className="stats-grid" aria-label="Indicateurs clients">
      <Card><CardContent><Users aria-hidden="true" /><p className="stat-label">Comptes clients</p><p className="stat-value">{summary.customers}</p></CardContent></Card>
      <Card><CardContent><BadgeCheck aria-hidden="true" /><p className="stat-label">E-mails confirmés</p><p className="stat-value">{summary.confirmed}</p></CardContent></Card>
      <Card><CardContent><ShoppingBag aria-hidden="true" /><p className="stat-label">Clients acheteurs</p><p className="stat-value">{summary.buyers}</p></CardContent></Card>
      <Card><CardContent><UserRound aria-hidden="true" /><p className="stat-label">Administrateurs</p><p className="stat-value">{summary.admins}</p></CardContent></Card>
      <Card><CardContent><CircleDollarSign aria-hidden="true" /><p className="stat-label">CA des comptes</p><p className="stat-value">{formatMoney(summary.revenueCents, "fr-FR")}</p></CardContent></Card>
    </section>
    <Form method="get" className="admin-filter admin-customer-filter" role="search">
      <label className="sr-only" htmlFor="customer-search">Rechercher un client</label><input id="customer-search" name="q" type="search" defaultValue={query} placeholder="Nom, e-mail, téléphone ou ville" />
      <label className="sr-only" htmlFor="customer-status">Statut du compte</label><select id="customer-status" name="status" defaultValue={status}><option value="all">Tous les comptes</option><option value="confirmed">E-mail confirmé</option><option value="pending">Confirmation en attente</option><option value="buyers">Avec commande</option><option value="admins">Administrateurs</option></select>
      <button className="ui-button ui-button--default" type="submit"><Search aria-hidden="true" /> Rechercher</button>
    </Form>
    <Card className="admin-professional-section">
      <CardHeader><p className="eyebrow">Base clients</p><h2>Membres particuliers</h2></CardHeader>
      <CardContent style={{ padding: 0 }}><Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Compte</TableHead><TableHead>Commandes</TableHead><TableHead>Dernière activité</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{customers.map((customer) => <TableRow key={customer.id}>
        <TableCell><strong>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email}</strong><br /><small><a href={`mailto:${customer.email}`}>{customer.email}</a>{customer.phone ? <> · {customer.phone}</> : null}{customer.location ? <><br />{customer.location}</> : null}</small></TableCell>
        <TableCell><Badge className={customer.emailConfirmed ? "admin-pro-status admin-pro-status--approved" : "admin-customer-status--pending"}>{customer.emailConfirmed ? "Confirmé" : "À confirmer"}</Badge>{customer.role === "admin" ? <><br /><Badge className="admin-member-role-badge">Administrateur</Badge></> : null}<br /><small>Inscription : {customer.signupSource}<br />{formatDate(customer.createdAt)}</small></TableCell>
        <TableCell><strong>{customer.orderCount}</strong><br /><small>{formatMoney(customer.totalSpentCents, "fr-FR")}</small></TableCell>
        <TableCell>Commande : {formatDate(customer.lastOrderAt)}<br /><small>Connexion : {formatDate(customer.lastSignInAt)}</small></TableCell>
        <TableCell><div className="admin-customer-actions"><AdminMemberRoleForm memberId={customer.id} role={customer.role} currentAdminId={adminId} memberLabel={[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email} /><Link className="text-link" to={`/admin/commandes?q=${encodeURIComponent(customer.email)}`}><ShoppingBag aria-hidden="true" /> Voir les commandes</Link><a className="text-link" href={`mailto:${customer.email}`}><UserRound aria-hidden="true" /> Contacter</a></div></TableCell>
      </TableRow>)}</TableBody></Table>{customers.length ? null : <p className="admin-empty-state">Aucun client ne correspond aux filtres.</p>}</CardContent>
    </Card>
  </AdminShell>;
}
