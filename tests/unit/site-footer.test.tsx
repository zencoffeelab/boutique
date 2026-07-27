import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "~/components/site-footer";

describe("site footer shop navigation", () => {
  it("links the shop and every available coffee in French", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <SiteFooter products={[{ slug: "cafe-test", name: "Café test" }]} />
      </MemoryRouter>,
    );

    expect(html).toContain(">Boutique</h2>");
    expect(html).toMatch(/href="\/boutique"[^>]*>Tous les cafés<\/a>/);
    expect(html).toMatch(/href="\/boutique\/cafe-test"[^>]*>Café test<\/a>/);
    expect(html).toMatch(/href="\/mentions-legales"[^>]*>Mentions légales<\/a>/);
    expect(html).toMatch(/href="\/politique-de-confidentialite"[^>]*>Politique de confidentialité<\/a>/);
    expect(html).not.toContain("Back-office");
  });

  it("uses the English shop routes on English pages", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/en"]}>
        <SiteFooter products={[{ slug: "test-coffee", name: "Test coffee" }]} />
      </MemoryRouter>,
    );

    expect(html).toContain(">Shop</h2>");
    expect(html).toMatch(/href="\/en\/shop"[^>]*>All coffees<\/a>/);
    expect(html).toMatch(/href="\/en\/shop\/test-coffee"[^>]*>Test coffee<\/a>/);
    expect(html).toMatch(/href="\/en\/legal-notice"[^>]*>Legal notice<\/a>/);
    expect(html).toMatch(/href="\/en\/privacy-policy"[^>]*>Privacy policy<\/a>/);
  });

  it("only exposes the back-office link to an authenticated administrator", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <SiteFooter admin />
      </MemoryRouter>,
    );

    expect(html).toMatch(/href="\/admin"[^>]*>Back-office<\/a>/);
  });
});
