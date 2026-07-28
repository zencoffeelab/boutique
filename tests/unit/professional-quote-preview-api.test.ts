import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({ getViewer: vi.fn() }));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { getViewer } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { loader } from "~/routes/api.professional-quote-preview";

describe("professional quote preview API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects anonymous preview requests", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    const response = await loader({ request: new Request("https://example.test/api/professional-quotes/quote-1/preview"), params: { id: "quote-1" }, context: {} } as never);
    expect(response.status).toBe(401);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it("limits the quote lookup to the connected professional", async () => {
    vi.mocked(getViewer).mockResolvedValue({ user: { id: "pro-user" }, profile: { professional_status: "approved" } } as never);
    const quote = {
      id: "quote-1", quote_number: "ZCL-D-2026-001001", status: "pending_payment", total_weight_kg: 10,
      subtotal_before_discount_cents: 67_500, discount_cents: 6_750, total_cents: 60_750,
      valid_until: "2026-08-26T10:00:00.000Z", created_at: "2026-07-27T10:00:00.000Z",
      professional_quote_lines: [{ id: "line-1", product_name: "Kenya", variant_label: "1000g", kilograms: 10, discount_percent: 10, discounted_price_cents_per_kg: 6_075, line_total_cents: 60_750, created_at: "2026-07-27T10:00:00.000Z" }],
    };
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: quote, error: null }) };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    vi.mocked(createServiceSupabase).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as never);

    const response = await loader({ request: new Request("https://example.test/api/professional-quotes/quote-1/preview"), params: { id: "quote-1" }, context: {} } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("id", "quote-1");
    expect(query.eq).toHaveBeenCalledWith("profile_id", "pro-user");
    expect(payload.quote.lines[0]).toMatchObject({ product_name: "Kenya", kilograms: 10 });
    expect(payload.quote).not.toHaveProperty("professional_quote_lines");
  });
});
