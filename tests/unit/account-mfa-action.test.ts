import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/supabase.server", () => ({
  createRequestSupabase: vi.fn(),
  createServiceSupabase: vi.fn(() => null),
}));

import { createRequestSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/account";

describe("account two-factor actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a regular member start optional TOTP enrollment", async () => {
    const enroll = vi.fn(async () => ({
      data: { id: "33333333-3333-4333-8333-333333333333", totp: { qr_code: "data:image/svg+xml;base64,qr", secret: "SECRET" } },
      error: null,
    }));
    const client = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "member-id" } } })),
        mfa: {
          listFactors: vi.fn(async () => ({ data: { totp: [], all: [] }, error: null })),
          enroll,
          unenroll: vi.fn(),
        },
      },
    };
    vi.mocked(createRequestSupabase).mockReturnValue({ client, responseHeaders: new Headers() } as never);
    const form = new FormData();
    form.set("intent", "mfa_enroll");

    const response = await action({ request: new Request("http://localhost/mon-compte", { method: "POST", body: form }), params: {}, context: {} } as never) as Response;

    expect(enroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "Zen Coffee Lab" });
    await expect(response.json()).resolves.toMatchObject({ ok: true, scope: "mfa", mfaEnrollment: { secret: "SECRET" } });
  });
});
