import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/admin-advice";

const articleId = "11111111-1111-4111-8111-111111111111";

describe("advice administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes an article and records its previous content in the audit log", async () => {
    const before = { id: articleId, slug: "guide-v60", advice_translations: [{ locale: "fr-FR", title: "Guide V60" }] };
    const deleteEq = vi.fn(async () => ({ error: null }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "advice_articles") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: before, error: null }) }) }),
          delete: () => ({ eq: deleteEq }),
        };
        if (table === "audit_log") return { insert: auditInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);
    const form = new FormData();
    form.set("intent", "delete_advice");
    form.set("id", articleId);

    await expect(action({ request: new Request("http://localhost/admin/conseils", { method: "POST", body: form }), params: {}, context: {} } as never)).resolves.toEqual({ ok: true, message: "Conseil supprimé." });
    expect(deleteEq).toHaveBeenCalledWith("id", articleId);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "advice.deleted", entity_id: articleId, before_data: before }));
  });

  it("stores formatted advice as structured rich text", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "advice_articles") return {
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: articleId }, error: null }) }) }),
        };
        if (table === "advice_translations") return { upsert };
        if (table === "audit_log") return { insert: auditInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);
    const richText = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Guide complet" }] },
        { type: "paragraph", content: [{ type: "text", text: "Ce paragraphe contient assez de texte pour être enregistré.", marks: [{ type: "bold" }] }] },
      ],
    });
    const form = new FormData();
    Object.entries({
      intent: "save_advice",
      id: "",
      slug: "guide-complet",
      status: "published",
      publishedAt: "2026-07-26T12:00",
      titleFr: "Guide complet",
      titleEn: "Complete guide",
      excerptFr: "Un extrait suffisamment détaillé.",
      excerptEn: "A sufficiently detailed excerpt.",
      bodyFr: richText,
      bodyEn: richText,
      seoTitleFr: "Guide complet du café",
      seoTitleEn: "Complete coffee guide",
      seoDescriptionFr: "Une description SEO suffisamment complète.",
      seoDescriptionEn: "A sufficiently complete SEO description.",
    }).forEach(([key, value]) => form.set(key, value));

    await expect(action({ request: new Request("http://localhost/admin/conseils", { method: "POST", body: form }), params: {}, context: {} } as never)).resolves.toEqual({ ok: true, message: "Conseil enregistré." });
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ blocks: [expect.objectContaining({ type: "richText", content: expect.objectContaining({ type: "doc" }) })] }),
    ]), { onConflict: "article_id,locale" });
  });
});
