import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { CartProvider } from "~/components/cart/cart-provider";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { SiteHeader } from "~/components/site-header";
import type { SiteNavigationConfiguration } from "~/lib/site-navigation";

function renderHeader(signedIn: boolean, professional = false, accountInitials: string | null = null, initialPath = "/", navigation?: SiteNavigationConfiguration) {
  const router = createMemoryRouter([{
    path: "*",
    element: <CartProvider><QuoteCartProvider><SiteHeader signedIn={signedIn} professional={professional} accountInitials={accountInitials} navigation={navigation} /></QuoteCartProvider></CartProvider>,
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

  it("uses a compact account icon in the header when a session exists", () => {
    const html = renderHeader(true, false, "JD");
    expect(html).toContain('aria-label="Mon compte"');
    expect(html).toContain('class="lucide lucide-user-round"');
    expect(html).toContain('class="account-avatar"');
    expect(html).toContain(">JD<");
  });

  it("places the basket after the account action", () => {
    const professionalHeader = renderHeader(true, true, "JD");
    expect(professionalHeader.lastIndexOf('lucide-shopping-basket')).toBeGreaterThan(professionalHeader.lastIndexOf('lucide-user-round'));
    const standardHeader = renderHeader(true, false, "JD");
    expect(standardHeader.lastIndexOf('lucide-shopping-basket')).toBeGreaterThan(standardHeader.lastIndexOf('lucide-user-round'));
  });

  it("shows the active language with an SVG flag in a dropdown", () => {
    const frenchHtml = renderHeader(false);
    const englishHtml = renderHeader(false, false, null, "/en/shop");
    expect(frenchHtml).toContain('aria-label="Langue active : Français"');
    expect(frenchHtml).toContain('aria-haspopup="menu"');
    expect(frenchHtml).toContain('data-language-flag="fr-FR"');
    expect(frenchHtml).toContain('viewBox="0 0 30 20"');
    expect(frenchHtml).not.toContain("🇫🇷");
    expect(frenchHtml).toContain(">FR<");
    expect(englishHtml).toContain('aria-label="Active language: English"');
    expect(englishHtml).toContain('data-language-flag="en-GB"');
    expect(englishHtml).toContain('fill="#012169"');
    expect(englishHtml).not.toContain("🇬🇧");
    expect(englishHtml).toContain(">EN<");
    expect(englishHtml).toContain("language-selector__chevron");
  });

  it("opens the private-space drawer when arriving from a standard login", () => {
    const html = renderHeader(true, false, "AL", "/?account=welcome");

    expect(html).toContain('aria-controls="account-drawer"');
    expect(html).toContain('aria-expanded="true"');
  });

  it("uses the configured menu order and only its selected pages", () => {
    const navigation: SiteNavigationConfiguration = {
      menu: ["contact", "shop"],
      footerColumns: [],
    };
    const html = renderHeader(false, false, null, "/", navigation);

    expect(html.indexOf('href="/contact"')).toBeLessThan(html.indexOf('href="/boutique"'));
    expect(html).not.toContain('href="/professionnel"');
    expect(html).not.toContain('href="/conseils"');
  });
});
