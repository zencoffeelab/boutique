import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichTextContent } from "~/components/rich-text-content";
import {
  parseRichTextInput,
  storedBlocksToRichTextDocument,
} from "~/lib/rich-text";

describe("rich advice content", () => {
  it("converts the former paragraph blocks without losing their content", () => {
    const document = storedBlocksToRichTextDocument([
      { type: "paragraph", content: "Premier paragraphe" },
      { type: "paragraph", content: "Deuxième paragraphe" },
    ]);

    expect(document.content).toHaveLength(2);
    expect(renderToStaticMarkup(<RichTextContent content={document} />)).toContain("Deuxième paragraphe");
  });

  it("keeps supported formatting and removes unsafe links", () => {
    const document = parseRichTextInput(JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Bien préparer son café" }] },
        {
          type: "paragraph",
          content: [{
            type: "text",
            text: "Une explication assez longue pour être publiée.",
            marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:alert(1)" } }],
          }],
        },
      ],
    }));

    expect(document).not.toBeNull();
    const html = renderToStaticMarkup(<RichTextContent content={document!} />);
    expect(html).toContain("<h2>Bien préparer son café</h2>");
    expect(html).toContain("<strong>");
    expect(html).not.toContain("javascript:");
  });

  it("rejects empty documents", () => {
    expect(parseRichTextInput(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }))).toBeNull();
  });
});
