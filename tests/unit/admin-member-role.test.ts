import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/api.admin-member-role";

const targetId = "22222222-2222-4222-8222-222222222222";

function roleRequest(role: "customer" | "admin") {
  const form = new FormData();
  form.set("role", role);
  return new Request(`http://localhost/api/admin/members/${targetId}/role`, { method: "POST", body: form });
}

describe("administrator rights management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("promotes a member and records the change", async () => {
    const auditInsert = vi.fn(async () => ({ error: null }));
    const updateMaybeSingle = vi.fn(async () => ({ data: { id: targetId }, error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "audit_log") return { insert: auditInsert };
        if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: targetId, role: "customer", first_name: "Ada", last_name: "Lovelace" }, error: null }) }) }),
          update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateMaybeSingle }) }) }) }),
        };
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);

    const response = await action({ request: roleRequest("admin"), params: { id: targetId }, context: {} } as never) as Response;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, message: "Le membre est maintenant administrateur." });
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "member.promoted_admin", before_data: { role: "customer" }, after_data: { role: "admin" } }));
  });

  it("protects the current administrator from self-demotion", async () => {
    const form = new FormData();
    form.set("role", "customer");
    const request = new Request("http://localhost/api/admin/members/self/role", { method: "POST", body: form });

    const response = await action({ request, params: { id: "11111111-1111-4111-8111-111111111111" }, context: {} } as never) as Response;

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, message: expect.stringContaining("propres droits") });
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it("does not demote the final administrator", async () => {
    const countQuery = { eq: vi.fn(async () => ({ count: 1, error: null })) };
    const client = {
      from: vi.fn((table: string) => {
        if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
        return {
          select: (_columns: string, options?: { head?: boolean }) => options?.head
            ? countQuery
            : { eq: () => ({ maybeSingle: async () => ({ data: { id: targetId, role: "admin", first_name: "Grace", last_name: "Hopper" }, error: null }) }) },
        };
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);

    const response = await action({ request: roleRequest("customer"), params: { id: targetId }, context: {} } as never) as Response;

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, message: expect.stringContaining("dernier administrateur") });
  });
});
