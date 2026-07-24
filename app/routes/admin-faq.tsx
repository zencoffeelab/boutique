import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

type FaqItem = {
  id: string;
  position: number;
  active: boolean;
  question_fr: string;
  answer_fr: string;
  question_en: string;
  answer_en: string;
};

const faqSchema = z.object({
  intent: z.literal("save_faq"),
  id: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  position: z.coerce.number().int().nonnegative(),
  active: z.string().optional().transform(Boolean),
  questionFr: z.string().trim().min(5),
  answerFr: z.string().trim().min(10),
  questionEn: z.string().trim().min(5),
  answerEn: z.string().trim().min(10),
});
const deleteFaqSchema = z.object({ intent: z.literal("delete_faq"), id: z.uuid() });

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, faq: [] as FaqItem[] };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data: faq, error } = await client.from("faq_items").select("*").order("position");
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, faq: (faq ?? []) as FaqItem[] };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const form = Object.fromEntries(await request.formData());
  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };

  if (form.intent === "delete_faq") {
    const parsed = deleteFaqSchema.safeParse(form);
    if (!parsed.success) return { ok: false, message: "FAQ invalide." };
    const { data: before, error: readError } = await client.from("faq_items").select("*").eq("id", parsed.data.id).maybeSingle();
    if (readError) return { ok: false, message: readError.message };
    if (!before) return { ok: false, message: "FAQ introuvable." };
    const { error } = await client.from("faq_items").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, message: error.message };
    await client.from("audit_log").insert({ actor_id: admin.id, action: "faq.deleted", entity_type: "faq_item", entity_id: parsed.data.id, before_data: before });
    return { ok: true, message: "FAQ supprimée." };
  }

  const parsed = faqSchema.safeParse(form);
  if (!parsed.success) return { ok: false, message: "Les quatre textes de FAQ sont requis." };
  const values = { position: parsed.data.position, active: parsed.data.active, question_fr: parsed.data.questionFr, answer_fr: parsed.data.answerFr, question_en: parsed.data.questionEn, answer_en: parsed.data.answerEn };
  const mutation = parsed.data.id
    ? await client.from("faq_items").update(values).eq("id", parsed.data.id).select("id").single()
    : await client.from("faq_items").insert(values).select("id").single();
  if (mutation.error || !mutation.data) return { ok: false, message: mutation.error?.message ?? "FAQ non enregistrée." };
  await client.from("audit_log").insert({ actor_id: admin.id, action: parsed.data.id ? "faq.updated" : "faq.created", entity_type: "faq_item", entity_id: mutation.data.id, after_data: parsed.data });
  return { ok: true, message: "FAQ enregistrée." };
}

export const meta: MetaFunction = () => [{ title: "FAQ | Administration Zen Coffee Lab" }, { name: "robots", content: "noindex,nofollow" }];

function FaqForm({ item, demo }: { item?: FaqItem; demo: boolean }) {
  return <Form method="post" className="form-grid">
    <input type="hidden" name="intent" value="save_faq" />
    <input type="hidden" name="id" value={item?.id ?? ""} />
    <div className="field"><label>Position<input name="position" type="number" min="0" defaultValue={item?.position ?? 0} /></label></div>
    <label><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Visible</label>
    <div className="field field--wide"><label>Question FR<input name="questionFr" defaultValue={item?.question_fr ?? ""} required /></label></div>
    <div className="field field--wide"><label>Réponse FR<textarea name="answerFr" defaultValue={item?.answer_fr ?? ""} required /></label></div>
    <div className="field field--wide"><label>Question EN<input name="questionEn" defaultValue={item?.question_en ?? ""} required /></label></div>
    <div className="field field--wide"><label>Réponse EN<textarea name="answerEn" defaultValue={item?.answer_en ?? ""} required /></label></div>
    <button className="ui-button ui-button--default" type="submit" disabled={demo}>{item ? "Enregistrer" : <><Plus aria-hidden="true" /> Ajouter</>}</button>
  </Form>;
}

export default function AdminFaq() {
  const { demo, faq } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <AdminShell active="faq">
    <header className="admin-heading"><div><p className="eyebrow">Mini-CMS</p><h1>FAQ</h1><p className="admin-heading__description">Gérez les questions fréquentes affichées sur le site en français et en anglais.</p></div></header>
    {demo ? <p className="admin-notice">Connectez Supabase pour modifier les FAQ.</p> : null}
    {result?.message ? <p className={result.ok ? "form-message" : "form-message form-error"} role="status">{result.message}</p> : null}
    <div className="admin-content-list">
      {faq.map((item) => <details className="ui-card admin-content-page" key={item.id}>
        <summary><strong>{item.question_fr}</strong><span className="ui-badge">{item.active ? "visible" : "masquée"}</span></summary>
        <FaqForm item={item} demo={demo} />
        <Form method="post" className="admin-delete-form" onSubmit={(event) => { if (!window.confirm(`Supprimer définitivement la FAQ « ${item.question_fr} » ?`)) event.preventDefault(); }}>
          <input type="hidden" name="intent" value="delete_faq" /><input type="hidden" name="id" value={item.id} />
          <button className="ui-button ui-button--danger ui-button--sm" type="submit" disabled={demo}><Trash2 aria-hidden="true" /> Supprimer la FAQ</button>
        </Form>
      </details>)}
      {faq.length === 0 ? <p className="ui-card admin-empty-state">Aucune question enregistrée.</p> : null}
    </div>
    <section className="ui-card admin-editor" aria-labelledby="new-faq-title"><h2 id="new-faq-title">Nouvelle question</h2><FaqForm demo={demo} /></section>
  </AdminShell>;
}
