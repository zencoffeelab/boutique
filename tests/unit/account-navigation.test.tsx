import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AccountLanguageSwitch, accountWelcomeDestination, AccountNavigation, customerLoginDestination, MfaLoginGate } from "~/routes/account";
import { accountShippingCountryOptions } from "~/components/account/account-dashboard";
import { SHIPPING_COUNTRY_CODES } from "~/domain/shipping-countries";

describe("account anchor navigation", () => {
  it("offers the other storefront language from the private-space welcome screen", () => {
    const frenchHtml = renderToStaticMarkup(<MemoryRouter><AccountLanguageSwitch english={false} /></MemoryRouter>);
    const englishHtml = renderToStaticMarkup(<MemoryRouter><AccountLanguageSwitch english /></MemoryRouter>);

    expect(frenchHtml).toContain('href="/en/my-account"');
    expect(frenchHtml).toContain("English");
    expect(englishHtml).toContain('href="/mon-compte"');
    expect(englishHtml).toContain("Français");
  });

  it("opens the account drawer only after the first login", () => {
    expect(accountWelcomeDestination("fr-FR")).toBe("/?account=welcome");
    expect(accountWelcomeDestination("en-GB")).toBe("/en?account=welcome");
    expect(customerLoginDestination("fr-FR", "/mon-compte", "/mon-compte", true)).toBe("/?account=welcome");
    expect(customerLoginDestination("fr-FR", "/mon-compte", "/mon-compte", false)).toBe("/");
    expect(customerLoginDestination("en-GB", "/en/my-account", "/en/my-account", false)).toBe("/en");
    expect(customerLoginDestination("fr-FR", "/mon-compte", "/professionnel", true)).toBe("/professionnel");
  });

  it("lists exactly the countries currently available for delivery in the address form", () => {
    const countries = accountShippingCountryOptions("fr-FR");

    expect(countries).toHaveLength(SHIPPING_COUNTRY_CODES.length);
    expect(countries).toContain("FR");
    expect(countries).not.toContain("US");
  });

  it("links every customer section and exposes the current counts", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AccountNavigation english={false} orderCount={3} addressCount={2} quoteCount={0} professional={false} /></MemoryRouter>);

    expect(html).toContain('aria-label="Sections de mon compte"');
    expect(html).toContain('href="#account-orders"');
    expect(html).toContain('href="#account-addresses"');
    expect(html).toContain('href="#account-settings"');
    expect(html).toContain(">3<");
    expect(html).toContain(">2<");
    expect(html).not.toContain("Boutique pro");
  });

  it("adds the professional shop without replacing the anchor menu", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AccountNavigation english professional orderCount={0} addressCount={0} quoteCount={4} /></MemoryRouter>);
    expect(html).toContain('href="#account-professional-quotes"');
    expect(html).toContain("Professional shop");
    expect(html).toContain(">4<");
    expect(html).toContain('href="#account-orders"');
  });
});

describe("two-factor login", () => {
  it("shows the optional 2FA code directly below validated credentials", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        action: async () => null,
        element: <MfaLoginGate
          email="admin@example.com"
          english={false}
          next="/admin"
          mfa={{ currentLevel: "aal1", nextLevel: "aal2", verifiedFactors: [{ id: "37ff307f-c5b4-4d16-9924-c460f2d94ca4", friendlyName: "Authenticator", createdAt: "2026-07-27" }] }}
        />,
      },
    ]);
    const html = renderToStaticMarkup(
      <RouterProvider router={router} />,
    );

    expect(html).toContain("admin@example.com");
    expect(html).toContain("Mot de passe validé");
    expect(html).toContain("Code à six chiffres");
    expect(html.indexOf("Mot de passe validé")).toBeLessThan(html.indexOf("Code à six chiffres"));
    expect(html).toContain("qu’une seule fois pour cette session");
    expect(html).toContain("Vérifier et continuer");
    expect(html).toContain('name="next" value="/admin"');
  });
});
