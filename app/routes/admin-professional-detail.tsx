import { ArrowLeft, Mail, ShoppingCart, UserRound } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { z } from "zod";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney } from "~/domain/money";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const idSchema = z.uuid();
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
type Address = { firstName?: string; lastName?: string; line1?: string; postalCode?: string; city?: string; countryCode?: string };
type Application = { id: string; company_name: string; country_code: string | null; first_name: string; last_name: string; email: string; phone: string | null; company_registration_number: string | null; vat_number: string | null; electronic_billing_address: string | null; billing_address: Address | null; delivery_address: Address | null; business_type: string; monthly_volume: string; comment: string | null; status: string; decision_note: string | null; decided_at: string | null; created_at: string };
type MailMessage = { id: string; direction: "inbound" | "outbound"; sender_name: string | null; sender_address: string; recipients: unknown; subject: string; text_body: string | null; created_at: string; received_at: string | null; sent_at: string | null };

function uniqueById<T extends { id: string }>(items: T[]) { return [...new Map(items.map((item) => [item.id, item])).values()]; }
function formatDate(value: string | null) { return value ? dateFormatter.format(new Date(value)) : "—"; }
function formatAddress(address: Address | null) { if (!address?.line1) return "Non renseignée"; const recipient = [address.firstName, address.lastName].filter(Boolean).join(" "); return [recipient, address.line1, [address.postalCode, address.city].filter(Boolean).join(" "), address.countryCode].filter(Boolean).join(" · "); }
function statusLabel(status: string) { return ({ approved: "Validée", rejected: "Refusée", suspended: "Suspendue", pending: "En attente" } as Record<string, string>)[status] ?? status; }
function hasRecipient(message: MailMessage, email: string) { return Array.isArray(message.recipients) && message.recipients.some((recipient) => recipient && typeof recipient === "object" && "address" in recipient && typeof recipient.address === "string" && recipient.address.toLocaleLowerCase("en-US") === email); }

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const memberId = idSchema.safeParse(params.id);
  if (!memberId.success) throw new Response("Compte professionnel introuvable.", { status: 404 });
  const client = createServiceSupabase();
  if (!client) throw new Response("Base de données indisponible.", { status: 503 });
  const [profileResult, authResult] = await Promise.all([client.from("profiles").select("id,role,professional_status,first_name,last_name,phone,created_at,updated_at").eq("id", memberId.data).maybeSingle(), client.auth.admin.getUserById(memberId.data)]);
  if (profileResult.error) throw new Response(profileResult.error.message, { status: 500 });
  if (authResult.error) throw new Response(authResult.error.message, { status: 500 });
  const profile = profileResult.data;
  const email = authResult.data.user?.email?.toLocaleLowerCase("en-US");
  if (!profile || !email || !["approved", "suspended"].includes(profile.professional_status ?? "")) throw new Response("Compte professionnel introuvable.", { status: 404 });
  const applicationColumns = "id,company_name,country_code,first_name,last_name,email,phone,company_registration_number,vat_number,electronic_billing_address,billing_address,delivery_address,business_type,monthly_volume,comment,status,decision_note,decided_at,created_at";
  const orderColumns = "id,order_number,status,total_cents,created_at,paid_at,order_lines(product_name,variant_label,quantity,line_total_cents)";
  const mailColumns = "id,direction,sender_name,sender_address,recipients,subject,text_body,created_at,received_at,sent_at";
  const [memberApplications, emailApplications, profileOrders, emailOrders, receivedMessages, sentMessages] = await Promise.all([
    client.from("professional_applications").select(applicationColumns).eq("invited_user_id", profile.id).order("created_at", { ascending: false }).limit(100),
    client.from("professional_applications").select(applicationColumns).eq("email", email).order("created_at", { ascending: false }).limit(100),
    client.from("orders").select(orderColumns).eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(100),
    client.from("orders").select(orderColumns).eq("email", email).order("created_at", { ascending: false }).limit(100),
    client.from("admin_mail_messages").select(mailColumns).eq("sender_address", email).order("created_at", { ascending: false }).limit(100),
    client.from("admin_mail_messages").select(mailColumns).eq("direction", "outbound").order("created_at", { ascending: false }).limit(500),
  ]);
  const error = memberApplications.error ?? emailApplications.error ?? profileOrders.error ?? emailOrders.error ?? receivedMessages.error ?? sentMessages.error;
  if (error) throw new Response(error.message, { status: 500 });
  const applications = uniqueById([...(memberApplications.data ?? []), ...(emailApplications.data ?? [])] as Application[]).toSorted((left, right) => right.created_at.localeCompare(left.created_at));
  const orders = uniqueById([...(profileOrders.data ?? []), ...(emailOrders.data ?? [])]).toSorted((left, right) => right.created_at.localeCompare(left.created_at));
  const messages = uniqueById([...(receivedMessages.data ?? []), ...(sentMessages.data ?? []).filter((message) => hasRecipient(message as MailMessage, email))] as MailMessage[]).toSorted((left, right) => right.created_at.localeCompare(left.created_at));
  return { profile, email, applications, orders, messages };
}

export const meta: MetaFunction = () => [{ title: "Fiche professionnelle | Administration Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

export default function AdminProfessionalDetail() {
  const { profile, email, applications, orders, messages } = useLoaderData<typeof loader>();
  const latestApplication = applications[0];
  return <AdminShell active="professionals">
    <header className="admin-heading admin-professional-detail__heading"><div><p className="eyebrow">Fiche compte professionnel</p><h1>{latestApplication?.company_name || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || email}</h1><p>{profile.first_name} {profile.last_name} · <a href={`mailto:${email}`}>{email}</a>{profile.phone ? <> · <a href={`tel:${profile.phone}`}>{profile.phone}</a></> : null}</p></div><Link className="ui-button ui-button--outline ui-button--sm" to="/admin/professionnels"><ArrowLeft aria-hidden="true" /> Professionnels</Link></header>
    <section className="admin-professional-detail__grid">
      <Card><CardHeader><UserRound aria-hidden="true" /><h2>Informations</h2></CardHeader><CardContent>{latestApplication ? <dl className="admin-professional-detail__list"><div><dt>Statut</dt><dd><Badge className={`admin-pro-status admin-pro-status--${profile.professional_status}`}>{profile.professional_status === "approved" ? "Actif" : "Suspendu"}</Badge></dd></div><div><dt>Pays</dt><dd>{latestApplication.country_code || "—"}</dd></div><div><dt>{latestApplication.country_code === "FR" ? "SIRET" : "Company registration number"}</dt><dd>{latestApplication.company_registration_number || "—"}</dd></div><div><dt>TVA intracommunautaire</dt><dd>{latestApplication.vat_number || "—"}</dd></div><div><dt>Facturation électronique</dt><dd>{latestApplication.electronic_billing_address || "—"}</dd></div><div><dt>Adresse de facturation</dt><dd>{formatAddress(latestApplication.billing_address)}</dd></div><div><dt>Adresse de livraison</dt><dd>{formatAddress(latestApplication.delivery_address)}</dd></div></dl> : <p>Aucune demande professionnelle n’est rattachée à ce compte.</p>}</CardContent></Card>
      <Card><CardHeader><ShoppingCart aria-hidden="true" /><h2>Commandes</h2></CardHeader><CardContent><p className="admin-professional-detail__count">{orders.length} commande{orders.length > 1 ? "s" : ""}</p><Link className="text-link" to={`/admin/commandes?q=${encodeURIComponent(email)}`}>Ouvrir toutes les commandes</Link></CardContent></Card>
      <Card><CardHeader><Mail aria-hidden="true" /><h2>Mails échangés</h2></CardHeader><CardContent><p className="admin-professional-detail__count">{messages.length} message{messages.length > 1 ? "s" : ""}</p><Link className="text-link" to={`/admin/messagerie?q=${encodeURIComponent(email)}`}>Ouvrir la messagerie</Link></CardContent></Card>
    </section>
    <Card className="admin-professional-section"><CardHeader><p className="eyebrow">Besoins et demandes</p><h2>Historique des demandes</h2></CardHeader><CardContent>{applications.length ? <div className="admin-professional-detail__timeline">{applications.map((application) => <article key={application.id}><div><Badge className={`admin-pro-status admin-pro-status--${application.status}`}>{statusLabel(application.status)}</Badge><time dateTime={application.created_at}>{formatDate(application.created_at)}</time></div><strong>{application.business_type} · {application.monthly_volume}</strong>{application.comment ? <p>{application.comment}</p> : null}{application.decision_note ? <small>Note de décision : {application.decision_note}</small> : null}</article>)}</div> : <p>Aucune demande enregistrée.</p>}</CardContent></Card>
    <Card className="admin-professional-section"><CardHeader><p className="eyebrow">Achats</p><h2>Commandes du compte</h2></CardHeader><CardContent style={{ padding: 0 }}>{orders.length ? <Table><TableHeader><TableRow><TableHead>Commande</TableHead><TableHead>Date</TableHead><TableHead>Articles</TableHead><TableHead>Statut</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell><strong>{order.order_number}</strong></TableCell><TableCell>{formatDate(order.paid_at ?? order.created_at)}</TableCell><TableCell><small>{(order.order_lines ?? []).map((line) => `${line.product_name} · ${line.variant_label} ×${line.quantity}`).join(", ") || "—"}</small></TableCell><TableCell>{order.status}</TableCell><TableCell><strong>{formatMoney(order.total_cents, "fr-FR")}</strong></TableCell></TableRow>)}</TableBody></Table> : <p className="admin-empty-state">Aucune commande pour ce compte.</p>}</CardContent></Card>
    <Card className="admin-professional-section"><CardHeader><p className="eyebrow">Correspondance</p><h2>Mails échangés</h2></CardHeader><CardContent>{messages.length ? <div className="admin-professional-detail__timeline">{messages.map((message) => <article key={message.id}><div><Badge className={`admin-pro-status admin-pro-status--${message.direction === "outbound" ? "approved" : "pending"}`}>{message.direction === "outbound" ? "Envoyé" : "Reçu"}</Badge><time dateTime={message.sent_at ?? message.received_at ?? message.created_at}>{formatDate(message.sent_at ?? message.received_at ?? message.created_at)}</time></div><Link to={`/admin/messagerie?view=${message.direction === "outbound" ? "sent" : "inbox"}&q=${encodeURIComponent(email)}&message=${message.id}`}><strong>{message.subject}</strong></Link><p>{message.text_body?.slice(0, 220) || "Aperçu indisponible"}</p></article>)}</div> : <p>Aucun e-mail lié à cette adresse.</p>}</CardContent></Card>
  </AdminShell>;
}
