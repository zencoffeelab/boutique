import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { CartProvider } from "~/components/cart/cart-provider";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { SiteHeader } from "~/components/site-header";

function renderHeader(signedIn: boolean, professional = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <CartProvider><QuoteCartProvider><SiteHeader signedIn={signedIn} professional={professional} /></QuoteCartProvider></CartProvider>
    </MemoryRouter>,
  );
}

describe("public account navigation", () => {
  it("shows the sign-in icon to guests", () => {
    const html = renderHeader(false);
    expect(html).toContain('aria-label="Se connecter"');
    expect(html).toContain("lucide-log-in");
    expect(html).not.toContain("lucide-user-round-check");
  });

  it("shows the authenticated account icon when a session exists", () => {
    const html = renderHeader(true);
    expect(html).toContain('aria-label="Mon compte — connecté"');
    expect(html).toContain("lucide-user-round-check");
    expect(html).not.toContain("lucide-log-in");
  });

  it("shows a separate quote basket only to approved professionals", () => {
    expect(renderHeader(true, true)).toContain("Panier de devis");
    expect(renderHeader(true, false)).not.toContain("Panier de devis");
  });
});
