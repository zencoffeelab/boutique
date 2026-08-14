import { describe, expect, it } from "vitest";
import { buildEmailHtmlDocument, hasRemoteEmailContent } from "~/lib/email-html";

describe("email HTML rendering", () => {
  it("keeps email presentation while disabling active code", () => {
    const document = buildEmailHtmlDocument({
      html: '<html><head><style>.title{color:red}</style><script>alert(1)</script></head><body><table><tr><td class="title">Bonjour</td></tr></table></body></html>',
      messageId: "11111111-1111-4111-8111-111111111111",
      attachments: [],
      allowRemoteContent: false,
    });

    expect(document).toContain("<style>.title{color:red}</style>");
    expect(document).toContain("<table>");
    expect(document).not.toContain("alert(1)");
    expect(document).toContain("script-src 'none'");
    expect(document).toContain("img-src 'self' data: blob:");
  });

  it("maps embedded CID images to their protected attachment route", () => {
    const document = buildEmailHtmlDocument({
      html: '<img src="cid:logo%40example.com">',
      messageId: "11111111-1111-4111-8111-111111111111",
      attachments: [{ id: "22222222-2222-4222-8222-222222222222", contentId: "<logo@example.com>" }],
      allowRemoteContent: false,
    });

    expect(document).toContain('/admin/messagerie/11111111-1111-4111-8111-111111111111/pieces-jointes/22222222-2222-4222-8222-222222222222?inline=1');
    expect(document).not.toContain("cid:logo");
  });

  it("detects remote resources and only allows them on request", () => {
    const html = '<img src="https://images.example.com/newsletter.jpg">';
    expect(hasRemoteEmailContent(html)).toBe(true);
    expect(buildEmailHtmlDocument({ html, messageId: "message", attachments: [], allowRemoteContent: true })).toContain("img-src 'self' data: blob: http: https:");
  });
});
