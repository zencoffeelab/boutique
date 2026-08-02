import { describe, expect, it, vi } from "vitest";
import emailForwarder, { persistIncomingEmail } from "../../workers/email-forwarder";

describe("email mailbox worker", () => {
  it("rejects mail instead of silently dropping it when storage is unavailable", async () => {
    const setReject = vi.fn();

    await emailForwarder.email(
      { forward: vi.fn(), setReject },
      {},
    );

    expect(setReject).toHaveBeenCalledOnce();
  });

  it("parses and stores an incoming message for the administrator mailbox", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const raw = [
      "Message-ID: <incoming-test@example.com>",
      "Date: Sat, 1 Aug 2026 20:00:00 +0200",
      "From: Alice Example <alice@example.com>",
      "To: contact@zencoffeelab.com",
      "Subject: Une question café",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Bonjour Zen Coffee Lab",
    ].join("\r\n");

    await expect(persistIncomingEmail({
      from: "alice@example.com",
      to: "contact@zencoffeelab.com",
      raw: new Blob([raw]).stream(),
      rawSize: raw.length,
      forward: vi.fn(),
      setReject: vi.fn(),
    }, {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    })).resolves.toBe("11111111-1111-4111-8111-111111111111");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      direction: "inbound",
      sender_address: "alice@example.com",
      subject: "Une question café",
      text_body: "Bonjour Zen Coffee Lab",
      message_id_header: "<incoming-test@example.com>",
    });
    vi.unstubAllGlobals();
  });
});
