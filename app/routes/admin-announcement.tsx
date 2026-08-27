import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { requireAdmin } from "~/lib/auth.server";
import { dictionary } from "~/lib/i18n";
import { createServiceSupabase } from "~/lib/supabase.server";

const announcementSchema = z.object({
  messageFr: z.string().trim().min(3).max(160),
  messageEn: z.string().trim().min(3).max(160),
});

type AnnouncementTranslation = Readonly<{
  locale: "fr-FR" | "en-GB";
  title: string;
}>;

type AnnouncementPage = Readonly<{
  id: string;
  content_page_translations: AnnouncementTranslation[];
}>;

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { demo: true, page: null as AnnouncementPage | null };
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data, error } = await client
    .from("content_pages")
    .select("id,content_page_translations(locale,title)")
    .eq("page_key", "bandeau")
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  return { demo: false, page: data as AnnouncementPage | null };
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (admin.demo) return { ok: false, message: "Lecture seule en démonstration." };
  const parsed = announcementSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { ok: false, message: "Chaque texte doit contenir entre 3 et 160 caractères." };

  const client = createServiceSupabase();
  if (!client) return { ok: false, message: "Base indisponible." };
  const { data: page, error } = await client
    .from("content_pages")
    .upsert({ page_key: "bandeau", status: "published", updated_at: new Date().toISOString() }, { onConflict: "page_key" })
    .select("id")
    .single();
  if (error || !page) return { ok: false, message: error?.message ?? "Bandeau non créé." };

  const translations = [
    { locale: "fr-FR", title: parsed.data.messageFr, seo_title: "Bandeau supérieur", seo_description: parsed.data.messageFr },
    { locale: "en-GB", title: parsed.data.messageEn, seo_title: "Top announcement", seo_description: parsed.data.messageEn },
  ].map((translation) => ({ ...translation, page_id: page.id, blocks: [] }));
  const { error: translationError } = await client
    .from("content_page_translations")
    .upsert(translations, { onConflict: "page_id,locale" });
  if (translationError) return { ok: false, message: translationError.message };

  await client.from("audit_log").insert({
    actor_id: admin.id,
    action: "announcement.updated",
    entity_type: "content_page",
    entity_id: page.id,
    after_data: parsed.data,
  });
  return { ok: true, message: "Bandeau supérieur enregistré." };
}

export const meta: MetaFunction = () => [
  { title: "Bandeau | Administration Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

export default function AdminAnnouncement() {
  const { demo, page } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const messageFr = page?.content_page_translations.find((translation) => translation.locale === "fr-FR")?.title ?? dictionary["fr-FR"].freeShipping;
  const messageEn = page?.content_page_translations.find((translation) => translation.locale === "en-GB")?.title ?? dictionary["en-GB"].freeShipping;

  return <AdminShell active="content">
    <header className="admin-heading">
      <div>
        <p className="eyebrow">Contenu global</p>
        <h1>Bandeau supérieur</h1>
        <p className="admin-heading__description">Modifiez le message affiché tout en haut du site dans chaque langue.</p>
      </div>
    </header>
    {demo ? <p className="admin-notice">Connectez Supabase pour modifier le bandeau.</p> : null}
    {result?.message && !result.ok ? <p className="form-message form-error">{result.message}</p> : null}
    <nav className="admin-content-tabs" aria-label="Gestion des pages" role="tablist">
      <Link role="tab" to="/admin/contenus">Contenu</Link>
      <Link role="tab" to="/admin/contenus?tab=rangement">Rangement</Link>
      <Link role="tab" to="/admin/contenus?tab=construction">Site en construction</Link>
      <Link role="tab" aria-selected="true" className="is-active" to="/admin/bandeau">Bandeau</Link>
    </nav>
    <Form method="post" className="ui-card admin-announcement-form">
      <div className="admin-content-columns">
        <fieldset>
          <legend>Français</legend>
          <div className="field">
            <label>Texte du bandeau
              <input name="messageFr" defaultValue={messageFr} minLength={3} maxLength={160} required disabled={demo} />
            </label>
          </div>
          <div className="announcement admin-announcement-preview">{messageFr}</div>
        </fieldset>
        <fieldset>
          <legend>English</legend>
          <div className="field">
            <label>Announcement text
              <input name="messageEn" defaultValue={messageEn} minLength={3} maxLength={160} required disabled={demo} />
            </label>
          </div>
          <div className="announcement admin-announcement-preview">{messageEn}</div>
        </fieldset>
      </div>
      <button className="ui-button ui-button--default" type="submit" disabled={demo}>Enregistrer le bandeau</button>
    </Form>
  </AdminShell>;
}
