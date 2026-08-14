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
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([{ id: "22222222-2222-4222-8222-222222222222" }]), { status: 200, headers: { "Content-Type": "application/json" } });
    });
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

    const request = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      direction: "inbound",
      sender_address: "alice@example.com",
      subject: "Une question café",
      text_body: "Bonjour Zen Coffee Lab",
      message_id_header: "<incoming-test@example.com>",
    });
    vi.unstubAllGlobals();
  });

  it("stores inline images with their content identifier", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("admin_mail_labels")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("admin_mail_messages") && init?.method === "POST") return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response("[]", { status: 201, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const raw = [
      "Message-ID: <inline-test@example.com>",
      "From: Alice Example <alice@example.com>",
      "To: contact@zencoffeelab.com",
      "Subject: Logo intégré",
      "Content-Type: multipart/related; boundary=mail-boundary",
      "",
      "--mail-boundary",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>Bonjour</p><img src="cid:logo@example.com">',
      "--mail-boundary",
      "Content-Type: image/png; name=logo.png",
      "Content-Disposition: inline; filename=logo.png",
      "Content-ID: <logo@example.com>",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--mail-boundary--",
      "",
    ].join("\r\n");

    await persistIncomingEmail({
      from: "alice@example.com",
      to: "contact@zencoffeelab.com",
      raw: new Blob([raw]).stream(),
      rawSize: raw.length,
      forward: vi.fn(),
      setReject: vi.fn(),
    }, {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });

    const attachmentInsert = fetchMock.mock.calls.find(([input, init]) => String(input).includes("admin_mail_attachments") && (init as RequestInit | undefined)?.method === "POST");
    expect(attachmentInsert).toBeDefined();
    expect(JSON.parse(String((attachmentInsert?.[1] as RequestInit).body))).toEqual([expect.objectContaining({
      content_id: "logo@example.com",
      disposition: "inline",
      mime_type: "image/png",
    })]);
    vi.unstubAllGlobals();
  });
});
