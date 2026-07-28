import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/admin-content";

describe("content page administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores both page languages as structured rich text", async () => {
    const translationUpsert = vi.fn(async () => ({ error: null }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "content_pages") return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }),
            }),
          }),
        };
        if (table === "content_page_translations") return { upsert: translationUpsert };
        if (table === "audit_log") return { insert: auditInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);
    const richText = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notre histoire" }] },
        { type: "paragraph", content: [{ type: "text", text: "Un contenu de page suffisamment long et mis en forme.", marks: [{ type: "bold" }] }] },
      ],
    });
    const form = new FormData();
    Object.entries({
      intent: "save_page",
      pageKey: "a-propos",
      status: "published",
      titleFr: "À propos",
      titleEn: "About us",
      seoTitleFr: "À propos de Zen Coffee Lab",
      seoTitleEn: "About Zen Coffee Lab",
      seoDescriptionFr: "Découvrez notre histoire et notre approche du café.",
      seoDescriptionEn: "Discover our story and our approach to coffee.",
      contentFr: richText,
      contentEn: richText,
    }).forEach(([key, value]) => form.set(key, value));

    await expect(action({
      request: new Request("http://localhost/admin/contenus", { method: "POST", body: form }),
      params: {},
      context: {},
    } as never)).resolves.toEqual({ ok: true, message: "Page enregistrée." });

    expect(translationUpsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        locale: "fr-FR",
        blocks: [expect.objectContaining({ type: "richText", content: expect.objectContaining({ type: "doc" }) })],
      }),
      expect.objectContaining({
        locale: "en-GB",
        blocks: [expect.objectContaining({ type: "richText", content: expect.objectContaining({ type: "doc" }) })],
      }),
    ]), { onConflict: "page_id,locale" });
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "content_page.updated" }));
  });
});
