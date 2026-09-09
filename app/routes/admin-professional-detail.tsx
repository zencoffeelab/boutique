import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatMoney } from "~/domain/money";
import { SHIPPING_COUNTRY_CODES } from "~/domain/shipping-countries";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const idSchema = z.uuid();
const professionalIdentitySchema = z.object({
  intent: z.literal("update_professional_identity"),
  applicationId: z.uuid(),
  countryCode: z.enum(SHIPPING_COUNTRY_CODES),
  companyName: z.string().trim().min(2).max(160),
  companyRegistrationNumber: z.string().trim().min(2).max(80),
  vatNumber: z.string().trim().max(40).default(""),
  businessType: z.enum(["Coffee shop", "Restaurant", "Revendeur", "Distributeur", "Autre"]),
  monthlyVolume: z.enum(["1-10 kg", "11-50 kg", "51-100 kg", "100+ kg"]),
});
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
type Address = { firstName?: string; lastName?: string; line1?: string; postalCode?: string; city?: string; countryCode?: string };
type Application = { id: string; invited_user_id: string | null; company_name: string; country_code: string | null; first_name: string; last_name: string; email: string; phone: string | null; company_registration_number: string | null; vat_number: string | null; electronic_billing_address: string | null; billing_address: Address | null; delivery_address: Address | null; business_type: string; monthly_volume: string; comment: string | null; status: string; decision_note: string | null; decided_at: string | null; created_at: string };
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
  const applicationColumns = "id,invited_user_id,company_name,country_code,first_name,last_name,email,phone,company_registration_number,vat_number,electronic_billing_address,billing_address,delivery_address,business_type,monthly_volume,comment,status,decision_note,decided_at,created_at";
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

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Les modifications sont désactivées en mode démonstration." };
  const memberId = idSchema.safeParse(params.id);
  const parsed = professionalIdentitySchema.safeParse(Object.fromEntries(await request.formData()));
  if (!memberId.success || !parsed.success) return { ok: false, message: "Informations d’identité invalides." };
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base de données indisponible." };
  const { data: application, error: applicationError } = await client.from("professional_applications").select("id,invited_user_id,country_code,company_name,company_registration_number,vat_number,business_type,monthly_volume").eq("id", parsed.data.applicationId).maybeSingle();
  if (applicationError) return { ok: false, message: applicationError.message };
  if (!application || application.invited_user_id !== memberId.data) return { ok: false, message: "Compte professionnel introuvable." };
  const before = { countryCode: application.country_code, companyName: application.company_name, companyRegistrationNumber: application.company_registration_number, vatNumber: application.vat_number, businessType: application.business_type, monthlyVolume: application.monthly_volume };
  const { error } = await client.from("professional_applications").update({ country_code: parsed.data.countryCode, company_name: parsed.data.companyName, company_registration_number: parsed.data.companyRegistrationNumber, vat_number: parsed.data.vatNumber, business_type: parsed.data.businessType, monthly_volume: parsed.data.monthlyVolume, updated_at: new Date().toISOString() }).eq("id", application.id).eq("invited_user_id", memberId.data);
  if (error) return { ok: false, message: error.message };
  await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "professional_member.identity_updated", entity_type: "professional_application", entity_id: application.id, before_data: before, after_data: parsed.data });
  return { ok: true, message: "Identité professionnelle enregistrée." };
}

export const meta: MetaFunction = () => [{ title: "Fiche professionnelle | Administration Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

export default function AdminProfessionalDetail() {
  const { profile, email, applications, orders, messages } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const latestApplication = applications[0];
  const editableApplication = applications.find((application) => application.invited_user_id === profile.id);
  const [activeTab, setActiveTab] = useState<"information" | "needs" | "orders" | "messages">("information");
  return <AdminShell active="professionals">
    <header className="admin-heading admin-professional-detail__heading"><div className="admin-professional-detail__identity"><p className="eyebrow">Fiche compte professionnel</p><h1>{latestApplication?.company_name || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || email}</h1><p><strong>{profile.first_name} {profile.last_name}</strong><span aria-hidden="true">·</span><a href={`mailto:${email}`}>{email}</a>{profile.phone ? <><span aria-hidden="true">·</span><a href={`tel:${profile.phone}`}>{profile.phone}</a></> : null}</p></div><Link className="ui-button ui-button--outline ui-button--sm" to="/admin/professionnels"><ArrowLeft aria-hidden="true" /> Professionnels</Link></header>
    <nav className="admin-professional-detail__tabs" aria-label="Sections de la fiche professionnelle" role="tablist">
      <button type="button" role="tab" aria-selected={activeTab === "information"} className={activeTab === "information" ? "is-active" : ""} onClick={() => setActiveTab("information")}>Informations</button>
      <button type="button" role="tab" aria-selected={activeTab === "needs"} className={activeTab === "needs" ? "is-active" : ""} onClick={() => setActiveTab("needs")}>Besoins <span>{applications.length}</span></button>
      <button type="button" role="tab" aria-selected={activeTab === "orders"} className={activeTab === "orders" ? "is-active" : ""} onClick={() => setActiveTab("orders")}>Commandes <span>{orders.length}</span></button>
      <button type="button" role="tab" aria-selected={activeTab === "messages"} className={activeTab === "messages" ? "is-active" : ""} onClick={() => setActiveTab("messages")}>Mails <span>{messages.length}</span></button>
    </nav>
    {activeTab === "information" ? <section className="admin-professional-detail__grid" role="tabpanel">
      <Card className="admin-professional-detail__information"><CardHeader><p className="eyebrow">Compte</p><h2>Informations administratives</h2></CardHeader><CardContent>{latestApplication ? <dl className="admin-professional-detail__list"><div><dt>Statut</dt><dd><Badge className={`admin-pro-status admin-pro-status--${profile.professional_status}`}>{profile.professional_status === "approved" ? "Actif" : "Suspendu"}</Badge></dd></div><div><dt>Pays</dt><dd>{latestApplication.country_code || "—"}</dd></div><div><dt>{latestApplication.country_code === "FR" ? "SIRET" : "Company registration number"}</dt><dd>{latestApplication.company_registration_number || "—"}</dd></div><div><dt>TVA intracommunautaire</dt><dd>{latestApplication.vat_number || "—"}</dd></div><div className="admin-professional-detail__list-wide"><dt>Facturation électronique</dt><dd>{latestApplication.electronic_billing_address || "—"}</dd></div><div className="admin-professional-detail__list-wide"><dt>Adresse de facturation</dt><dd>{formatAddress(latestApplication.billing_address)}</dd></div><div className="admin-professional-detail__list-wide"><dt>Adresse de livraison</dt><dd>{formatAddress(latestApplication.delivery_address)}</dd></div></dl> : <p>Aucune demande professionnelle n’est rattachée à ce compte.</p>}</CardContent></Card>
      {editableApplication ? <Card className="admin-professional-detail__information"><CardHeader><p className="eyebrow">Administration</p><h2>Modifier l’identité professionnelle</h2></CardHeader><CardContent><Form method="post" className="admin-professional-identity-form"><input type="hidden" name="intent" value="update_professional_identity" /><input type="hidden" name="applicationId" value={editableApplication.id} />{result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}<div className="form-grid admin-professional-identity-form__grid"><div className="field"><label>Pays<select name="countryCode" defaultValue={editableApplication.country_code ?? "FR"} required>{SHIPPING_COUNTRY_CODES.map((countryCode) => <option key={countryCode} value={countryCode}>{countryCode}</option>)}</select></label></div><div className="field"><label>{editableApplication.country_code === "FR" ? "SIRET" : "Company registration number"}<input name="companyRegistrationNumber" defaultValue={editableApplication.company_registration_number ?? ""} minLength={2} maxLength={80} required /></label></div><div className="field"><label>Raison sociale<input name="companyName" defaultValue={editableApplication.company_name} minLength={2} maxLength={160} required /></label></div><div className="field"><label>N° de TVA intracommunautaire<input name="vatNumber" defaultValue={editableApplication.vat_number ?? ""} maxLength={40} /></label></div><div className="field"><label>Activité<select name="businessType" defaultValue={editableApplication.business_type} required><option>Coffee shop</option><option>Restaurant</option><option>Revendeur</option><option>Distributeur</option><option>Autre</option></select></label></div><div className="field"><label>Volume mensuel<select name="monthlyVolume" defaultValue={editableApplication.monthly_volume} required><option>1-10 kg</option><option>11-50 kg</option><option>51-100 kg</option><option>100+ kg</option></select></label></div></div><button className="button button--dark" type="submit">Enregistrer l’identité</button></Form></CardContent></Card> : null}
    </section> : null}
    {activeTab === "needs" ? <Card className="admin-professional-section admin-professional-detail__panel" role="tabpanel"><CardHeader><p className="eyebrow">Besoins et demandes</p><h2>Historique des demandes</h2></CardHeader><CardContent>{applications.length ? <div className="admin-professional-detail__timeline">{applications.map((application) => <article key={application.id}><div><Badge className={`admin-pro-status admin-pro-status--${application.status}`}>{statusLabel(application.status)}</Badge><time dateTime={application.created_at}>{formatDate(application.created_at)}</time></div><strong>{application.business_type} · {application.monthly_volume}</strong>{application.comment ? <p>{application.comment}</p> : null}{application.decision_note ? <small>Note de décision : {application.decision_note}</small> : null}</article>)}</div> : <p>Aucune demande enregistrée.</p>}</CardContent></Card> : null}
    {activeTab === "orders" ? <Card className="admin-professional-section admin-professional-detail__panel" role="tabpanel"><CardHeader><p className="eyebrow">Achats</p><h2>Commandes du compte</h2></CardHeader><CardContent style={{ padding: 0 }}>{orders.length ? <Table><TableHeader><TableRow><TableHead>Commande</TableHead><TableHead>Date</TableHead><TableHead>Articles</TableHead><TableHead>Statut</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell><strong>{order.order_number}</strong></TableCell><TableCell>{formatDate(order.paid_at ?? order.created_at)}</TableCell><TableCell><small>{(order.order_lines ?? []).map((line) => `${line.product_name} · ${line.variant_label} ×${line.quantity}`).join(", ") || "—"}</small></TableCell><TableCell>{order.status}</TableCell><TableCell><strong>{formatMoney(order.total_cents, "fr-FR")}</strong></TableCell></TableRow>)}</TableBody></Table> : <p className="admin-empty-state">Aucune commande pour ce compte.</p>}</CardContent></Card> : null}
    {activeTab === "messages" ? <Card className="admin-professional-section admin-professional-detail__panel" role="tabpanel"><CardHeader><p className="eyebrow">Correspondance</p><h2>Mails échangés</h2></CardHeader><CardContent>{messages.length ? <div className="admin-professional-detail__timeline">{messages.map((message) => <article key={message.id}><div><Badge className={`admin-pro-status admin-pro-status--${message.direction === "outbound" ? "approved" : "pending"}`}>{message.direction === "outbound" ? "Envoyé" : "Reçu"}</Badge><time dateTime={message.sent_at ?? message.received_at ?? message.created_at}>{formatDate(message.sent_at ?? message.received_at ?? message.created_at)}</time></div><Link className="admin-professional-detail__message-link" to={`/admin/messagerie?view=${message.direction === "outbound" ? "sent" : "inbox"}&q=${encodeURIComponent(email)}&message=${message.id}`}><strong>{message.subject}</strong></Link><p>{message.text_body?.slice(0, 220) || "Aperçu indisponible"}</p></article>)}</div> : <p>Aucun e-mail lié à cette adresse.</p>}</CardContent></Card> : null}
  </AdminShell>;
}
