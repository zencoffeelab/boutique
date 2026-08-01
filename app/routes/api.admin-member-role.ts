import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

const roleChangeSchema = z.object({
  role: z.enum(["customer", "admin"]),
});

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return Response.json({ ok: false, message: "Les mutations sont désactivées en mode démonstration." }, { status: 403 });
  const memberId = z.uuid().safeParse(params.id);
  const parsed = roleChangeSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!memberId.success || !parsed.success) return Response.json({ ok: false, message: "Modification de droits invalide." }, { status: 422 });
  if (memberId.data === admin.id && parsed.data.role !== "admin") {
    return Response.json({ ok: false, message: "Vous ne pouvez pas retirer vos propres droits administrateur." }, { status: 409 });
  }

  const client = createServiceSupabase();
  if (!client) return Response.json({ ok: false, message: "Base de données indisponible." }, { status: 503 });
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,role,first_name,last_name")
    .eq("id", memberId.data)
    .maybeSingle();
  if (profileError) return Response.json({ ok: false, message: profileError.message }, { status: 500 });
  if (!profile) return Response.json({ ok: false, message: "Membre introuvable." }, { status: 404 });
  if (profile.role === parsed.data.role) return Response.json({ ok: true, message: parsed.data.role === "admin" ? "Ce membre est déjà administrateur." : "Ce membre possède déjà des droits standards." });

  if (profile.role === "admin" && parsed.data.role === "customer") {
    const { count, error: countError } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if (countError) return Response.json({ ok: false, message: countError.message }, { status: 500 });
    if ((count ?? 0) <= 1) return Response.json({ ok: false, message: "Le dernier administrateur ne peut pas perdre ses droits." }, { status: 409 });
  }

  const { data: updated, error: updateError } = await client
    .from("profiles")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
    .eq("id", profile.id)
    .eq("role", profile.role)
    .select("id")
    .maybeSingle();
  if (updateError) return Response.json({ ok: false, message: updateError.message }, { status: 500 });
  if (!updated) return Response.json({ ok: false, message: "Les droits ont changé entre-temps. Rechargez la page." }, { status: 409 });

  await client.from("audit_log").insert({
    actor_id: admin.id,
    action: parsed.data.role === "admin" ? "member.promoted_admin" : "member.demoted_admin",
    entity_type: "profile",
    entity_id: profile.id,
    before_data: { role: profile.role },
    after_data: { role: parsed.data.role },
  });
  return Response.json({
    ok: true,
    message: parsed.data.role === "admin" ? "Le membre est maintenant administrateur." : "Les droits administrateur ont été retirés.",
  });
}
