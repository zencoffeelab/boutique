import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/admin-content";

describe("coming soon administration action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes the localized page and records the change", async () => {
    const pageUpsert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }),
      }),
    }));
    const translationUpsert = vi.fn(async () => ({ error: null }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "content_pages") return { upsert: pageUpsert };
        if (table === "content_page_translations") return { upsert: translationUpsert };
        if (table === "audit_log") return { insert: auditInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);
    const form = new FormData();
    form.set("intent", "save_coming_soon");
    form.set("active", "true");
    form.set("titleFr", "Nous revenons bientôt");
    form.set("messageFr", "Zen Coffee Lab prépare son nouveau site.");
    form.set("titleEn", "We will be back soon");
    form.set("messageEn", "Zen Coffee Lab is preparing its new website.");

    await expect(action({
      request: new Request("http://localhost/admin/contenus?tab=construction", { method: "POST", body: form }),
      params: {},
      context: {},
    } as never)).resolves.toEqual({ ok: true, message: "Mode Site en construction activé." });

    expect(pageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ page_key: "coming-soon", status: "published" }),
      { onConflict: "page_key" },
    );
    expect(translationUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ locale: "fr-FR", title: "Nous revenons bientôt" }),
      expect.objectContaining({ locale: "en-GB", title: "We will be back soon" }),
    ], { onConflict: "page_id,locale" });
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "coming_soon.updated" }));
  });
});
