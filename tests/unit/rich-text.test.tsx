import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentBlocks } from "~/components/content-blocks";
import { RichTextContent } from "~/components/rich-text-content";
import { TermsConditionsDocument } from "~/routes/legal";
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

  it("renders formatted CMS page blocks on the storefront", () => {
    const html = renderToStaticMarkup(<ContentBlocks blocks={[{
      type: "richText",
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Le terroir" }] },
          { type: "paragraph", content: [{ type: "text", text: "Une identité préservée.", marks: [{ type: "italic" }] }] },
        ],
      },
    }]} />);

    expect(html).toContain("<h2>Le terroir</h2>");
    expect(html).toContain("<em>Une identité préservée.</em>");
  });

  it("renders an editorial footer in its dedicated centering container", () => {
    const html = renderToStaticMarkup(<ContentBlocks
      blocks={[{ type: "paragraph", content: "Une identité préservée." }]}
      footer={<a href="/a-propos">En savoir plus</a>}
    />);

    expect(html).toContain('class="cms-content__footer"');
    expect(html).toContain('href="/a-propos">En savoir plus</a>');
  });

  it("adds an optional page-specific class to editorial content", () => {
    const html = renderToStaticMarkup(<ContentBlocks
      blocks={[{ type: "paragraph", content: "Contenu légal." }]}
      className="terms-document"
    />);

    expect(html).toContain('class="article-body cms-content terms-document"');
  });

  it("splits CGV articles into the legal-document section layout", () => {
    const html = renderToStaticMarkup(<TermsConditionsDocument blocks={[{
      type: "richText",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ARTICLE 1.\nIdentification de l’entreprise\nZen Coffee Lab\n—\nARTICLE 2. Objet\nLes présentes CGV s’appliquent." }] }] },
    }]} />);

    expect(html).toContain('class="article-body rich-text-content legal-document terms-document"');
    expect(html).toContain("Article 1. Identification de l’entreprise");
    expect(html).toContain("Article 2. Objet");
    expect(html).not.toContain("—");
  });

  it("translates English CGV article titles", () => {
    const html = renderToStaticMarkup(<TermsConditionsDocument english blocks={[{
      type: "richText",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ARTICLE 2. Purpose\nThese terms apply." }] }] },
    }]} />);

    expect(html).toContain("Article 2. Purpose");
    expect(html).not.toContain("Objet");
  });
});
