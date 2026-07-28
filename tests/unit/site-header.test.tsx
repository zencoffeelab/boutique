import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { CartProvider } from "~/components/cart/cart-provider";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { SiteHeader } from "~/components/site-header";

function renderHeader(signedIn: boolean, professional = false, accountInitials: string | null = null, initialPath = "/") {
  const router = createMemoryRouter([{
    path: "*",
    element: <CartProvider><QuoteCartProvider><SiteHeader signedIn={signedIn} professional={professional} accountInitials={accountInitials} /></QuoteCartProvider></CartProvider>,
  }], { initialEntries: [initialPath] });
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("public account navigation", () => {
  it("shows an explicit sign-in label to guests", () => {
    const html = renderHeader(false);
    expect(html).toContain('aria-label="Connexion"');
    expect(html).toContain("Connexion");
    expect(html).not.toContain("account-avatar");
  });

  it("shows the account label and user initials when a session exists", () => {
    const html = renderHeader(true, false, "JD");
    expect(html).toContain('aria-label="Mon compte"');
    expect(html).toContain("Mon compte");
    expect(html).toContain('class="account-avatar"');
    expect(html).toContain(">JD<");
    expect(html.indexOf("Mon compte")).toBeLessThan(html.indexOf(">JD<"));
  });

  it("shows a separate quote basket only to approved professionals", () => {
    const professionalHeader = renderHeader(true, true, "JD");
    expect(professionalHeader).toContain("Panier de devis");
    expect(professionalHeader.lastIndexOf("Mon compte")).toBeGreaterThan(professionalHeader.lastIndexOf("Panier (0)"));
    expect(renderHeader(true, false)).not.toContain("Panier de devis");
  });

  it("shows the active language with its flag in a dropdown", () => {
    const frenchHtml = renderHeader(false);
    const englishHtml = renderHeader(false, false, null, "/en/shop");
    expect(frenchHtml).toContain('aria-label="Langue active : Français"');
    expect(frenchHtml).toContain('aria-haspopup="menu"');
    expect(frenchHtml).toContain("🇫🇷");
    expect(frenchHtml).toContain(">FR<");
    expect(englishHtml).toContain('aria-label="Active language: English"');
    expect(englishHtml).toContain("🇬🇧");
    expect(englishHtml).toContain(">EN<");
    expect(englishHtml).toContain("language-selector__chevron");
  });
});
