import { Clock3, ExternalLink, RefreshCw, Search, ShieldOff, ShieldCheck, Trash2, Users } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Form, Link, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { AdminMemberRoleForm } from "~/components/admin-member-role-form";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { professionalDecisionEmail } from "~/services/email-templates.server";
import { dispatchNotificationQueue, enqueueNotification } from "~/services/notifications.server";
import { generateProfessionalAccessLink, ProfessionalAccessError } from "~/services/professional-access.server";

const memberActionSchema = z.object({
  intent: z.enum(["suspend", "reactivate", "resend_access", "delete_member", "delete_application"]),
  userId: z.uuid().optional(),
  applicationId: z.uuid().optional(),
  note: z.string().trim().max(1_000).optional().default(""),
});

type ActionResponse = { ok?: boolean; message?: string; activationUrl?: string };
type ProfessionalApplication = {
  id: string; company_name: string; first_name: string; last_name: string; email: string; phone: string; comment?: string | null;
  business_type: string; monthly_volume: string; locale: "fr-FR" | "en-GB"; status: "pending" | "approved" | "rejected" | "suspended";
  decision_note: string | null; decided_at: string | null; invited_user_id: string | null; created_at: string;
};
const ADMIN_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function includesSearch(values: unknown[], query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("fr-FR");
  return values.some((value) => String(value ?? "").toLocaleLowerCase("fr-FR").includes(normalized));
}

export function buildProfessionalMembers(
  profiles: Array<{ id: string; role: "customer" | "admin"; professional_status: string | null; first_name: string | null; last_name: string | null; phone: string | null; created_at: string }>,
  applications: ProfessionalApplication[],
  users: Array<{ id: string; email?: string; last_sign_in_at?: string; email_confirmed_at?: string }>,
) {
  const applicationByUser = new Map<string, ProfessionalApplication>();
  for (const application of applications) {
    if (application.invited_user_id && !applicationByUser.has(application.invited_user_id)) applicationByUser.set(application.invited_user_id, application);
  }
  const usersById = new Map(users.map((user) => [user.id, user]));
  return profiles.map((profile) => {
    const application = applicationByUser.get(profile.id);
    const user = usersById.get(profile.id);
    return {
      id: profile.id,
      role: profile.role,
      firstName: profile.first_name ?? application?.first_name ?? "",
      lastName: profile.last_name ?? application?.last_name ?? "",
      company: application?.company_name ?? "",
      email: user?.email ?? application?.email ?? "",
      phone: profile.phone ?? application?.phone ?? "",
      locale: application?.locale ?? "fr-FR",
      status: profile.professional_status as "approved" | "suspended",
      approvedAt: application?.decided_at ?? profile.created_at,
      lastSignInAt: user?.last_sign_in_at ?? null,
      emailConfirmed: Boolean(user?.email_confirmed_at),
    };
  }).toSorted((left, right) => left.company.localeCompare(right.company, "fr") || left.lastName.localeCompare(right.lastName, "fr"));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const requestedStatus = url.searchParams.get("memberStatus");
  const memberStatus = requestedStatus === "approved" || requestedStatus === "suspended" ? requestedStatus : "all";
  if (admin.demo) return { demo: true, adminId: admin.id, query, memberStatus, summary: { pending: 0, members: 0, suspended: 0 }, pending: [], history: [], members: [] };

  const client = createServiceSupabase();
  if (!client) throw new Response("Base de données indisponible.", { status: 503 });
  const [applicationResult, profileResult, userResult] = await Promise.all([
    client.from("professional_applications").select("id,company_name,first_name,last_name,email,phone,comment,business_type,monthly_volume,locale,status,decision_note,decided_at,invited_user_id,created_at").order("created_at", { ascending: false }).limit(500),
    client.from("profiles").select("id,role,professional_status,first_name,last_name,phone,created_at,updated_at").in("professional_status", ["approved", "suspended"]).limit(1_000),
    client.auth.admin.listUsers({ page: 1, perPage: 1_000 }),
  ]);
  if (applicationResult.error) throw new Response(applicationResult.error.message, { status: 500 });
  if (profileResult.error) throw new Response(profileResult.error.message, { status: 500 });
  if (userResult.error) throw new Response(userResult.error.message, { status: 500 });

  const applications = (applicationResult.data ?? []) as ProfessionalApplication[];
  const allMembers = buildProfessionalMembers(profileResult.data ?? [], applications, userResult.data.users);

  const applicationMatches = (application: ProfessionalApplication) => includesSearch([application.company_name, application.first_name, application.last_name, application.email, application.phone], query);
  const memberMatches = (member: (typeof allMembers)[number]) => includesSearch([member.company, member.firstName, member.lastName, member.email, member.phone], query) && (memberStatus === "all" || member.status === memberStatus);
  return {
    demo: false,
    adminId: admin.id,
    query,
    memberStatus,
    summary: {
      pending: applications.filter((application) => application.status === "pending").length,
      members: allMembers.length,
      suspended: allMembers.filter((member) => member.status === "suspended").length,
    },
    pending: applications.filter((application) => application.status === "pending" && applicationMatches(application)),
    history: applications.filter((application) => application.status !== "pending" && applicationMatches(application)),
    members: allMembers.filter(memberMatches),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return Response.json({ ok: false, message: "Les mutations sont désactivées en mode démonstration." }, { status: 403 });
  const parsed = memberActionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.json({ ok: false, message: "Action invalide." }, { status: 422 });
  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Base de données indisponible." }, { status: 503 });

  if (parsed.data.intent === "delete_application") {
    if (!parsed.data.applicationId) return Response.json({ ok: false, message: "Demande invalide." }, { status: 422 });
    const { data: application, error: applicationError } = await client.from("professional_applications").select("id,status,email").eq("id", parsed.data.applicationId).maybeSingle();
    if (applicationError) return Response.json({ ok: false, message: applicationError.message }, { status: 500 });
    if (!application || application.status !== "pending") return Response.json({ ok: false, message: "Cette demande n est plus en attente." }, { status: 409 });
    const { error: deleteError } = await client.from("professional_applications").delete().eq("id", application.id).eq("status", "pending");
    if (deleteError) return Response.json({ ok: false, message: deleteError.message }, { status: 500 });
    await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "professional_application.deleted", entity_type: "professional_application", entity_id: application.id, before_data: { status: application.status, email: application.email } });
    return Response.json({ ok: true, message: "La demande a ete supprimee. Une nouvelle demande peut utiliser cette adresse e-mail." });
  }

  if (!parsed.data.userId) return Response.json({ ok: false, message: "Membre invalide." }, { status: 422 });
  const { data: profile, error: profileError } = await client.from("profiles").select("id,role,professional_status,first_name,last_name,password_setup_required").eq("id", parsed.data.userId).maybeSingle();
  if (profileError) return Response.json({ ok: false, message: profileError.message }, { status: 500 });
  if (!profile || !["approved", "suspended"].includes(profile.professional_status ?? "")) return Response.json({ ok: false, message: "Compte professionnel introuvable." }, { status: 404 });

  if (parsed.data.intent === "delete_member") {
    if (profile.role === "admin" || profile.id === admin.id) return Response.json({ ok: false, message: "Un compte administrateur ne peut pas etre supprime depuis cet espace." }, { status: 409 });
    const { data: authUser, error: authUserError } = await client.auth.admin.getUserById(profile.id);
    if (authUserError) return Response.json({ ok: false, message: authUserError.message }, { status: 500 });
    const email = authUser.user?.email;
    if (!email) return Response.json({ ok: false, message: "Aucune adresse e-mail n est associee a ce compte." }, { status: 409 });
    const references = await Promise.all([
      client.from("orders").update({ profile_id: null }).eq("profile_id", profile.id),
      client.from("stock_movements").update({ actor_id: null }).eq("actor_id", profile.id),
      client.from("audit_log").update({ actor_id: null }).eq("actor_id", profile.id),
      client.from("professional_applications").delete().eq("invited_user_id", profile.id),
      client.from("professional_applications").delete().eq("email", email),
    ]);
    const referenceError = references.find((result) => result.error)?.error;
    if (referenceError) return Response.json({ ok: false, message: referenceError.message }, { status: 500 });
    const { error: deleteError } = await client.auth.admin.deleteUser(profile.id);
    if (deleteError) return Response.json({ ok: false, message: deleteError.message }, { status: 500 });
    await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "professional_member.deleted", entity_type: "profile", entity_id: profile.id, before_data: { email, professional_status: profile.professional_status } });
    return Response.json({ ok: true, message: "Le compte professionnel et ses demandes ont ete supprimes. Cette adresse e-mail peut etre reutilisee." });
  }

  if (parsed.data.intent === "suspend" || parsed.data.intent === "reactivate") {
    const nextStatus = parsed.data.intent === "suspend" ? "suspended" : "approved";
    if (profile.professional_status === nextStatus) return Response.json({ ok: true, message: nextStatus === "approved" ? "Ce compte est déjà actif." : "Ce compte est déjà suspendu." });
    const { error } = await client.from("profiles").update({ professional_status: nextStatus, updated_at: new Date().toISOString() }).eq("id", profile.id).eq("professional_status", profile.professional_status);
    if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
    await client.from("audit_log").insert({
      actor_id: admin.id === "demo-admin" ? null : admin.id,
      action: `professional_member.${nextStatus}`,
      entity_type: "profile",
      entity_id: profile.id,
      before_data: { professional_status: profile.professional_status },
      after_data: { professional_status: nextStatus, note: parsed.data.note },
    });
    return Response.json({ ok: true, message: nextStatus === "approved" ? "Accès professionnel réactivé." : "Accès professionnel suspendu immédiatement." });
  }

  if (profile.professional_status !== "approved") return Response.json({ ok: false, message: "Réactivez le compte avant de régénérer son accès." }, { status: 409 });

  const [{ data: authData, error: authError }, { data: application }] = await Promise.all([
    client.auth.admin.getUserById(profile.id),
    client.from("professional_applications").select("id,email,locale,company_name").eq("invited_user_id", profile.id).eq("status", "approved").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const email = authData.user?.email ?? application?.email;
  if (authError || !email) return Response.json({ ok: false, message: authError?.message ?? "Aucune adresse e-mail n’est associée à ce compte." }, { status: 404 });
  let activationUrl: string;
  let requiresPasswordSetup = profile.password_setup_required === true;
  try {
    const access = await generateProfessionalAccessLink(client, { email, locale: application?.locale ?? "fr-FR", siteUrl: env().VITE_SITE_URL, forcePasswordSetup: requiresPasswordSetup });
    activationUrl = access.url;
    requiresPasswordSetup = access.requiresPasswordSetup;
  } catch (cause) {
    return Response.json({ ok: false, message: cause instanceof Error ? cause.message : "Le lien d’accès n’a pas pu être créé." }, { status: cause instanceof ProfessionalAccessError ? cause.status : 502 });
  }
  const { error: passwordGateError } = await client.from("profiles").update({ password_setup_required: requiresPasswordSetup, updated_at: new Date().toISOString() }).eq("id", profile.id);
  if (passwordGateError) return Response.json({ ok: false, message: passwordGateError.message }, { status: 500 });

  const emailConfigured = Boolean(env().RESEND_API_KEY);
  let emailQueued = false;
  try {
    const locale = application?.locale ?? "fr-FR";
    const content = professionalDecisionEmail({ locale, approved: true, activationUrl, accessLabel: requiresPasswordSetup ? (locale === "en-GB" ? "Choose a new password" : "Choisir un nouveau mot de passe") : (locale === "en-GB" ? "Sign in" : "Connexion"), temporaryAccessLink: requiresPasswordSetup });
    const queued = await enqueueNotification({
      kind: "invitation", to: email, locale, ...content,
      payload: { applicationId: application?.id, invitedUserId: profile.id, regeneratedBy: admin.id },
    });
    emailQueued = queued.queued;
    if (emailConfigured && emailQueued) dispatchNotificationQueue(context, "professional_member_notification_failed", 10);
  } catch (cause) {
    console.error("professional_member_access_queue_failed", { message: cause instanceof Error ? cause.message : String(cause) });
  }
  await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "professional_member.access_regenerated", entity_type: "profile", entity_id: profile.id, after_data: { emailQueued, emailConfigured } });
  return Response.json(emailConfigured && emailQueued
    ? { ok: true, message: `Un nouvel e-mail d’accès est en cours d’envoi à ${email}.` }
    : { ok: true, message: "Le lien a été régénéré. Transmettez-le au professionnel.", activationUrl });
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ formAction, defaultShouldRevalidate }) => formAction?.includes("/api/admin/pro-applications/") ? false : defaultShouldRevalidate;

export const meta: MetaFunction = () => [{ title: "Professionnels | Administration Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function formatDate(value: string | null) {
  return value ? ADMIN_DATE_FORMATTER.format(new Date(value)) : "Jamais";
}

function statusLabel(status: string) {
  return ({ approved: "Validée", rejected: "Refusée", suspended: "Suspendue", pending: "En attente" } as Record<string, string>)[status] ?? status;
}

function ActivationLink({ url }: { url: string }) {
  return <div className="admin-activation-link">
    <label>Lien d’activation à transmettre<input aria-label="Lien d’activation à transmettre" readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>
    <a className="ui-button ui-button--ghost ui-button--sm" href={url} target="_blank" rel="noreferrer">Ouvrir <ExternalLink aria-hidden="true" /></a>
  </div>;
}

function ProfessionalDecision({ application }: { application: ProfessionalApplication }) {
  const fetcher = useFetcher<ActionResponse>();
  const deleteFetcher = useFetcher<ActionResponse>();
  const handled = Boolean(fetcher.data?.ok);
  return <article className="admin-application admin-professional-request">
    <div><strong>{application.company_name}</strong><p>{application.first_name} {application.last_name} · {application.business_type} · {application.monthly_volume}</p><p><a href={`mailto:${application.email}`}>{application.email}</a> · <a href={`tel:${application.phone}`}>{application.phone}</a></p>{application.comment ? <p><strong>Commentaire :</strong> {application.comment}</p> : null}<small>Demande reçue le {formatDate(application.created_at)}</small></div>
    <fetcher.Form method="post" action={`/api/admin/pro-applications/${application.id}/decision`}>
      <label className="admin-application__note">Note facultative<input name="note" maxLength={1_000} placeholder="Visible dans l’e-mail en cas de refus" /></label>
      <button className="ui-button ui-button--default ui-button--sm" name="decision" value="approved" disabled={fetcher.state !== "idle" || handled}>Approuver et créer l’accès</button>
      <button className="ui-button ui-button--ghost ui-button--sm" name="decision" value="rejected" disabled={fetcher.state !== "idle" || handled}>Refuser</button>
    </fetcher.Form>
    <deleteFetcher.Form method="post" onSubmit={(event) => { if (!window.confirm("Supprimer cette demande définitivement ? L adresse e-mail pourra ensuite être réutilisée.")) event.preventDefault(); }}>
      <input type="hidden" name="applicationId" value={application.id} />
      <button className="ui-button ui-button--ghost ui-button--sm" name="intent" value="delete_application" disabled={deleteFetcher.state !== "idle"}><Trash2 aria-hidden="true" /> Supprimer</button>
    </deleteFetcher.Form>
    {fetcher.data?.message ? <small className={fetcher.data.ok ? "form-message" : "form-message form-error"} role="status">{fetcher.data.message}</small> : null}
    {deleteFetcher.data?.message ? <small className={deleteFetcher.data.ok ? "form-message" : "form-message form-error"} role="status">{deleteFetcher.data.message}</small> : null}
    {fetcher.data?.activationUrl ? <ActivationLink url={fetcher.data.activationUrl} /> : null}
  </article>;
}

function MemberActions({ member }: { member: { id: string; email: string; status: "approved" | "suspended" } }) {
  const fetcher = useFetcher<ActionResponse>();
  const busy = fetcher.state !== "idle";
  return <div className="admin-member-actions">
    <fetcher.Form method="post" onSubmit={(event) => { if (member.status === "approved" && !window.confirm("Suspendre immédiatement l’accès professionnel de ce membre ?")) event.preventDefault(); }}>
      <input type="hidden" name="userId" value={member.id} />
      <button className={`ui-button ui-button--sm ${member.status === "approved" ? "ui-button--danger" : "ui-button--outline"}`} name="intent" value={member.status === "approved" ? "suspend" : "reactivate"} disabled={busy}>{member.status === "approved" ? <><ShieldOff aria-hidden="true" /> Suspendre</> : <><ShieldCheck aria-hidden="true" /> Réactiver</>}</button>
      {member.status === "approved" ? <button className="ui-button ui-button--ghost ui-button--sm" name="intent" value="resend_access" disabled={busy}><RefreshCw aria-hidden="true" /> Régénérer l’accès</button> : null}
      <button className="ui-button ui-button--ghost ui-button--sm" name="intent" value="delete_member" disabled={busy} onClick={(event) => { if (!window.confirm("Supprimer définitivement ce compte professionnel et ses demandes ? L adresse e-mail pourra ensuite être réutilisée.")) event.preventDefault(); }}><Trash2 aria-hidden="true" /> Supprimer</button>
    </fetcher.Form>
    <Link className="text-link" to={`/admin/commandes?q=${encodeURIComponent(member.email)}`}>Voir les commandes</Link>
    {fetcher.data?.message ? <small className={fetcher.data.ok ? undefined : "form-error"} role="status">{fetcher.data.message}</small> : null}
    {fetcher.data?.activationUrl ? <ActivationLink url={fetcher.data.activationUrl} /> : null}
  </div>;
}

export default function AdminProfessionals() {
  const { demo, adminId, query, memberStatus, summary, pending, history, members } = useLoaderData<typeof loader>();
  return <AdminShell active="professionals">
    <header className="admin-heading"><div><p className="eyebrow">Comptes & accès</p><h1>Professionnels</h1></div><Link className="ui-button ui-button--outline ui-button--sm" to="/professionnel">Voir la page pro</Link></header>
    {demo ? <p className="admin-notice">Connectez Supabase pour consulter et administrer les comptes professionnels.</p> : null}
    <section className="stats-grid" aria-label="Indicateurs professionnels">
      <Card><CardContent><Clock3 aria-hidden="true" /><p className="stat-label">Demandes en attente</p><p className="stat-value">{summary.pending}</p></CardContent></Card>
      <Card><CardContent><Users aria-hidden="true" /><p className="stat-label">Membres professionnels</p><p className="stat-value">{summary.members}</p></CardContent></Card>
      <Card><CardContent><ShieldOff aria-hidden="true" /><p className="stat-label">Accès suspendus</p><p className="stat-value">{summary.suspended}</p></CardContent></Card>
    </section>
    <Form method="get" className="admin-filter admin-professional-filter" role="search">
      <label className="sr-only" htmlFor="professional-search">Rechercher</label><input id="professional-search" name="q" type="search" defaultValue={query} placeholder="Entreprise, nom, e-mail ou téléphone" />
      <label className="sr-only" htmlFor="member-status">Statut des membres</label><select id="member-status" name="memberStatus" defaultValue={memberStatus}><option value="all">Tous les membres</option><option value="approved">Actifs</option><option value="suspended">Suspendus</option></select>
      <button className="ui-button ui-button--default" type="submit"><Search aria-hidden="true" /> Rechercher</button>
    </Form>

    <Card className="admin-professional-section">
      <CardHeader><p className="eyebrow">À traiter</p><h2>Demandes en attente</h2></CardHeader>
      <CardContent>{pending.length ? pending.map((application) => <ProfessionalDecision key={application.id} application={application} />) : <p>Aucune demande en attente.</p>}</CardContent>
    </Card>

    <Card className="admin-professional-section">
      <CardHeader><p className="eyebrow">Comptes validés</p><h2>Membres professionnels</h2></CardHeader>
      <CardContent style={{ padding: 0 }}><Table><TableHeader><TableRow><TableHead>Membre</TableHead><TableHead>Statut</TableHead><TableHead>Validation</TableHead><TableHead>Dernière connexion</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.id}>
        <TableCell><strong>{member.company || `${member.firstName} ${member.lastName}`}</strong><br /><small>{member.firstName} {member.lastName} · <a href={`mailto:${member.email}`}>{member.email}</a>{member.phone ? <> · {member.phone}</> : null}</small></TableCell>
        <TableCell><Badge className={`admin-pro-status admin-pro-status--${member.status}`}>{member.status === "approved" ? "Actif" : "Suspendu"}</Badge>{member.role === "admin" ? <><br /><Badge className="admin-member-role-badge">Administrateur</Badge></> : null}<br /><small>{member.emailConfirmed ? "E-mail confirmé" : "Activation en attente"}</small></TableCell>
        <TableCell>{formatDate(member.approvedAt)}</TableCell><TableCell>{formatDate(member.lastSignInAt)}</TableCell><TableCell><MemberActions member={member} /><AdminMemberRoleForm memberId={member.id} role={member.role} currentAdminId={adminId} memberLabel={member.company || `${member.firstName} ${member.lastName}` || member.email} /></TableCell>
      </TableRow>)}</TableBody></Table>{members.length ? null : <p className="admin-empty-state">Aucun membre ne correspond aux filtres.</p>}</CardContent>
    </Card>

    <Card className="admin-professional-section">
      <CardHeader><p className="eyebrow">Traçabilité</p><h2>Historique des demandes</h2></CardHeader>
      <CardContent style={{ padding: 0 }}><Table><TableHeader><TableRow><TableHead>Entreprise</TableHead><TableHead>Contact</TableHead><TableHead>Décision</TableHead><TableHead>Date</TableHead><TableHead>Note</TableHead></TableRow></TableHeader><TableBody>{history.map((application) => <TableRow key={application.id}>
        <TableCell><strong>{application.company_name}</strong><br /><small>{application.business_type} · {application.monthly_volume}</small></TableCell>
        <TableCell>{application.first_name} {application.last_name}<br /><small>{application.email}</small></TableCell>
        <TableCell><Badge className={`admin-pro-status admin-pro-status--${application.status}`}>{statusLabel(application.status)}</Badge></TableCell>
        <TableCell>{formatDate(application.decided_at)}</TableCell><TableCell>{application.decision_note || "—"}</TableCell>
      </TableRow>)}</TableBody></Table>{history.length ? null : <p className="admin-empty-state">Aucune demande traitée ne correspond à la recherche.</p>}</CardContent>
    </Card>
  </AdminShell>;
}
