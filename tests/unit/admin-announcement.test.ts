import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/admin-announcement";

describe("top announcement administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores both languages as a published global content entry", async () => {
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
    const form = new FormData();
    form.set("messageFr", "Livraison offerte dès 75 € en France");
    form.set("messageEn", "Free delivery in France from €75");

    await expect(action({
      request: new Request("http://localhost/admin/bandeau", { method: "POST", body: form }),
      params: {},
      context: {},
    } as never)).resolves.toEqual({ ok: true, message: "Bandeau supérieur enregistré." });

    expect(translationUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ locale: "fr-FR", title: "Livraison offerte dès 75 € en France", blocks: [] }),
      expect.objectContaining({ locale: "en-GB", title: "Free delivery in France from €75", blocks: [] }),
    ], { onConflict: "page_id,locale" });
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "announcement.updated" }));
  });
});
