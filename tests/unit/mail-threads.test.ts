import { describe, expect, it } from "vitest";
import { groupMailThreads, splitQuotedMailHistory } from "../../app/lib/mail-threads";
import { decodeEmailEntities } from "../../app/lib/email-text";

describe("decodeEmailEntities", () => {
  it("decodes decimal, hexadecimal and common named entities from plain-text emails", () => {
    expect(decodeEmailEntities("caf&#233;s, d&#xE9;gustation &amp; th&#233; &agrave; emporter")).toBe("cafés, dégustation & thé à emporter");
  });

  it("leaves malformed or unsafe code points untouched", () => {
    expect(decodeEmailEntities("&#xD800; &unknown; &#nope;")).toBe("&#xD800; &unknown; &#nope;");
  });
});

describe("groupMailThreads", () => {
  it("groups legacy replies through In-Reply-To when parent_id is absent", () => {
    const threads = groupMailThreads([
      { id: "initial", created_at: "2026-10-01T10:00:00.000Z", message_id_header: "<initial@example.com>" },
      { id: "reply", created_at: "2026-10-01T11:00:00.000Z", in_reply_to_header: "<initial@example.com>" },
      { id: "follow-up", created_at: "2026-10-01T12:00:00.000Z", references_header: "<initial@example.com> <reply@example.com>" },
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages.map((message) => message.id)).toEqual(["initial", "reply", "follow-up"]);
  });
});

describe("splitQuotedMailHistory", () => {
  it("separates the new reply from the quoted conversation", () => {
    expect(splitQuotedMailHistory("Merci pour votre réponse.\n\nLe dim. 4 oct. 2026 à 19:28, Zen Coffee Lab <contact@zencoffeelab.com> a écrit :\n> Tester\n> ce nouveau service")).toEqual({
      body: "Merci pour votre réponse.",
      quotedHistory: "Le dim. 4 oct. 2026 à 19:28, Zen Coffee Lab <contact@zencoffeelab.com> a écrit :\n> Tester\n> ce nouveau service",
    });
  });

  it("recognizes a reply marker even when the email client wraps it", () => {
    expect(splitQuotedMailHistory("Bien reçu.\n\nLe dim. 4 oct. 2026 à 19:36, Zen Coffee Lab <contact@zencoffeelab.com> a\nécrit :\nTester\nce nouveau service")).toEqual({
      body: "Bien reçu.",
      quotedHistory: "Le dim. 4 oct. 2026 à 19:36, Zen Coffee Lab <contact@zencoffeelab.com> a\nécrit :\nTester\nce nouveau service",
    });
  });
});
