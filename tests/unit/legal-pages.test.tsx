import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { alternatePath } from "~/lib/i18n";
import { EnglishLegalDocument, FrenchLegalNotice, FrenchPrivacyPolicy } from "~/routes/legal";

describe("legal pages", () => {
  it("renders the source legal notice as structured sections", () => {
    const html = renderToStaticMarkup(<MemoryRouter><FrenchLegalNotice /></MemoryRouter>);
    expect(html).toContain("1. Éditeur du site");
    expect(html).toContain("84886706500056");
    expect(html).toContain("2. Hébergement du site");
    expect(html).toContain("7. Droit applicable");
    expect(html).toContain('href="/politique-de-confidentialite"');
  });

  it("renders the privacy policy with its lists and useful contacts", () => {
    const html = renderToStaticMarkup(<MemoryRouter><FrenchPrivacyPolicy /></MemoryRouter>);
    expect(html).toContain("1. Collecte des données");
    expect(html).toContain("9. Modifications");
    expect(html).toContain("02/04/2026");
    expect(html).toContain('href="mailto:contact@zencoffeelab.com"');
    expect(html).toContain('href="https://www.cnil.fr"');
  });

  it("maps both legal routes to their real translated counterparts", () => {
    expect(alternatePath("/mentions-legales")).toBe("/en/legal-notice");
    expect(alternatePath("/en/legal-notice")).toBe("/mentions-legales");
    expect(alternatePath("/politique-de-confidentialite")).toBe("/en/privacy-policy");
    expect(alternatePath("/en/privacy-policy")).toBe("/politique-de-confidentialite");
    expect(alternatePath("/blog/guide-filtre")).toBe("/en/blog/guide-filtre");
    expect(alternatePath("/en/blog/guide-filtre")).toBe("/blog/guide-filtre");
  });

  it("renders duplicated English legal notice content only once on the public page", () => {
    const source = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "1. Website Publisher" }] },
        { type: "paragraph", content: [{ type: "text", text: "Zen Coffee Lab" }] },
        { type: "paragraph", content: [{ type: "text", text: "2. Website Hosting" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hosting details" }] },
        { type: "paragraph", content: [{ type: "text", text: "1. Website Publisher" }] },
        { type: "paragraph", content: [{ type: "text", text: "Zen Coffee Lab" }] },
        { type: "paragraph", content: [{ type: "text", text: "2. Website Hosting" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hosting details" }] },
      ],
    };
    const html = renderToStaticMarkup(<EnglishLegalDocument blocks={[{ type: "richText", content: source }]} titles={{ "1": "Website Publisher", "2": "Website Hosting" }} label="Legal notice" />);
    expect(html.match(/Zen Coffee Lab/g)).toHaveLength(1);
    expect(html.match(/Hosting details/g)).toHaveLength(1);
  });
});
