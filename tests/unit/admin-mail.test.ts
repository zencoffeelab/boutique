import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: sendEmail };
  },
}));
vi.mock("~/lib/auth.server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "admin", demo: false })),
}));
vi.mock("~/lib/env.server", () => ({
  env: () => ({ RESEND_API_KEY: "resend-key", CONTACT_FROM_EMAIL: "Zen Coffee Lab <contact@zencoffeelab.com>" }),
}));
vi.mock("~/lib/supabase.server", () => ({ createServiceSupabase: vi.fn() }));

import { createServiceSupabase } from "~/lib/supabase.server";
import { action } from "~/routes/admin-mail";

describe("administrator mailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmail.mockResolvedValue({ data: { id: "resend-message-id" }, error: null });
  });

  it("sends from the contact address and archives the outgoing message", async () => {
    const archivedInsert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }) }) }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "admin_mail_messages") return { insert: archivedInsert };
        if (table === "audit_log") return { insert: auditInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createServiceSupabase).mockReturnValue(client as never);
    const form = new FormData();
    form.set("intent", "send_mail");
    form.set("recipient", "client@example.com");
    form.set("subject", "Votre café");
    form.set("body", "Bonjour, voici notre réponse.");
    form.set("composeToken", "33333333-3333-4333-8333-333333333333");
    form.set("replyToId", "");

    let response: Response | undefined;
    try {
      await action({ request: new Request("http://localhost/admin/messagerie", { method: "POST", body: form }), params: {}, context: {} } as never);
    } catch (cause) {
      response = cause as Response;
    }

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain("view=sent");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "Zen Coffee Lab <contact@zencoffeelab.com>",
      to: "client@example.com",
      replyTo: "contact@zencoffeelab.com",
      subject: "Votre café",
    }), { idempotencyKey: "admin-mail/33333333-3333-4333-8333-333333333333" });
    expect(archivedInsert).toHaveBeenCalledWith(expect.objectContaining({ direction: "outbound", provider_id: "resend-message-id" }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "admin_mail.sent" }));
  });
});
