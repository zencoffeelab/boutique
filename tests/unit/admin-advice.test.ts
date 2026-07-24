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
});
