import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "admin", demo: false })),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { loader } from "~/routes/api.admin-order-unread-count";

describe("administrator unread order count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paid orders that have not yet been viewed without caching it", async () => {
    const is = vi.fn(async () => ({ count: 4, error: null }));
    const not = vi.fn(() => ({ is }));
    const select = vi.fn(() => ({ not }));
    vi.mocked(createServiceSupabase).mockReturnValue({ from: vi.fn(() => ({ select })) } as never);

    const response = await loader({ request: new Request("http://localhost/api/admin/orders/unread-count"), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ unread: 4 });
    expect(not).toHaveBeenCalledWith("paid_at", "is", null);
    expect(is).toHaveBeenCalledWith("admin_viewed_at", null);
  });
});
