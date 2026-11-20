import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { loader } from "~/routes/api.admin-mail-unread-count";

describe("administrator unread mail count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the number of unread inbound messages without caching it", async () => {
    const or = vi.fn(async () => ({ count: 4, error: null }));
    const secondEq = vi.fn(() => ({ or }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const spamLabel = { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: async () => ({ data: { id: "spam-label" }, error: null }) })) })) };
    vi.mocked(createServiceSupabase).mockReturnValue({
      from: vi.fn((table: string) => table === "admin_mail_labels" ? spamLabel : { select }),
    } as never);

    const response = await loader({ request: new Request("http://localhost/api/admin/mail/unread-count"), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ unread: 4 });
    expect(firstEq).toHaveBeenCalledWith("direction", "inbound");
    expect(secondEq).toHaveBeenCalledWith("is_read", false);
    expect(or).toHaveBeenCalledWith("label_id.is.null,label_id.neq.spam-label");
  });
});
