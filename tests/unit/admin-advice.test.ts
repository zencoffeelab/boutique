import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action, removeAdviceLayoutItem } from "~/routes/admin-advice";

const articleId = "11111111-1111-4111-8111-111111111111";

describe("advice administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes only the selected publication slot", () => {
    const items = [
      { id: "title", compartment: "title" as const },
      { id: "intro-image", compartment: "image" as const, element: "introImage" as const },
      { id: "body", compartment: "textImage" as const, element: "bodyText" as const },
    ];

    expect(removeAdviceLayoutItem(items, items[1])).toEqual([items[0], items[2]]);
  });

  it("archives a deleted article and records its previous content in the audit log", async () => {
    const before = { id: articleId, slug: "guide-v60", advice_translations: [{ locale: "fr-FR", title: "Guide V60" }] };
    const updateEq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "advice_articles") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: before, error: null }) }) }),
          update,
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
    expect(update).toHaveBeenCalledWith({ status: "archived" });
    expect(updateEq).toHaveBeenCalledWith("id", articleId);
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
      body2Fr: richText,
      body2En: richText,
      seoTitleFr: "Guide complet du café",
      seoTitleEn: "Complete coffee guide",
      seoDescriptionFr: "Une description SEO suffisamment complète.",
      seoDescriptionEn: "A sufficiently complete SEO description.",
    }).forEach(([key, value]) => form.set(key, value));

    await expect(action({ request: new Request("http://localhost/admin/conseils", { method: "POST", body: form }), params: {}, context: {} } as never)).resolves.toEqual({ ok: true, message: "Conseil enregistré." });
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ blocks: expect.arrayContaining([
        expect.objectContaining({ type: "richText", content: expect.objectContaining({ type: "doc" }) }),
        expect.objectContaining({ type: "storyLayout", content: expect.objectContaining({ introImageFirst: false, bodyImageFirst: false }) }),
      ]) }),
    ]), { onConflict: "article_id,locale" });
  });

  it("persists a confirmed custom text emplacement with its submitted content", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "advice_articles") return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: articleId }, error: null }) }) }) };
        if (table === "advice_translations") return { upsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);
    const customId = "custom-text-test";
    const form = new FormData();
    Object.entries({ intent: "save_advice", id: "", slug: "guide-custom", status: "published", publishedAt: "2026-07-26T12:00", titleFr: "Guide complet", titleEn: "Complete guide", excerptFr: "Un extrait suffisamment détaillé.", excerptEn: "A sufficiently detailed excerpt.", bodyFr: "Texte de corps suffisamment long pour être enregistré.", bodyEn: "Body text sufficiently long to be saved.", seoTitleFr: "Guide complet du café", seoTitleEn: "Complete coffee guide", seoDescriptionFr: "Une description SEO suffisamment complète.", seoDescriptionEn: "A sufficiently complete SEO description.", layoutConfig: JSON.stringify({ slots: [{ text: "intro", image: "intro" }, { text: "body", image: "body" }, { text: "body2", image: "body2" }], customItems: [{ id: customId, type: "text" }] }) }).forEach(([key, value]) => form.set(key, value));
    form.set(`customTextFr-${customId}`, "Nouveau texte français publié.");
    form.set(`customTextEn-${customId}`, "New English text published.");

    await action({ request: new Request("http://localhost/admin/conseils", { method: "POST", body: form }), params: {}, context: {} } as never);
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ blocks: expect.arrayContaining([expect.objectContaining({ type: "storyLayout", content: expect.objectContaining({ layoutConfig: expect.objectContaining({ customItems: expect.arrayContaining([expect.objectContaining({ id: customId, textFr: "Nouveau texte français publié." })]) }) }) })]) })]), { onConflict: "article_id,locale" });
  });
});
