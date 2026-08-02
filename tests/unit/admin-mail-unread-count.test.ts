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
    const secondEq = vi.fn(async () => ({ count: 4, error: null }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    vi.mocked(createServiceSupabase).mockReturnValue({ from: vi.fn(() => ({ select })) } as never);

    const response = await loader({ request: new Request("http://localhost/api/admin/mail/unread-count"), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ unread: 4 });
    expect(firstEq).toHaveBeenCalledWith("direction", "inbound");
    expect(secondEq).toHaveBeenCalledWith("is_read", false);
  });
});
