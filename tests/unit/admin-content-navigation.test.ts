import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/admin-content";

describe("site navigation administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the menu and the three footer columns in both languages", async () => {
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
    const configuration = {
      menu: ["contact", "shop"],
      footerColumns: [
        { id: "discover", titles: { "fr-FR": "Découvrir", "en-GB": "Discover" }, items: ["about"] },
        { id: "help", titles: { "fr-FR": "Aide", "en-GB": "Help" }, items: ["contact"] },
        { id: "coffee", titles: { "fr-FR": "Cafés", "en-GB": "Coffee" }, items: ["shop", "available-products"] },
      ],
    };
    const form = new FormData();
    form.set("intent", "save_navigation");
    form.set("configuration", JSON.stringify(configuration));

    await expect(action({
      request: new Request("http://localhost/admin/contenus?tab=rangement", { method: "POST", body: form }),
      params: {},
      context: {},
    } as never)).resolves.toEqual({ ok: true, message: "Rangement du menu et du footer enregistré." });

    expect(translationUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ locale: "fr-FR", blocks: [{ type: "siteNavigation", content: configuration }] }),
      expect.objectContaining({ locale: "en-GB", blocks: [{ type: "siteNavigation", content: configuration }] }),
    ], { onConflict: "page_id,locale" });
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "site_navigation.updated", after_data: configuration }));
  });
});
