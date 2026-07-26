import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AccountNavigation } from "~/routes/account";

describe("account anchor navigation", () => {
  it("links every customer section and exposes the current counts", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AccountNavigation english={false} orderCount={3} addressCount={2} professional={false} /></MemoryRouter>);

    expect(html).toContain('aria-label="Sections de mon compte"');
    expect(html).toContain('href="#account-orders"');
    expect(html).toContain('href="#account-addresses"');
    expect(html).toContain('href="#account-settings"');
    expect(html).toContain(">3<");
    expect(html).toContain(">2<");
    expect(html).not.toContain("Boutique pro");
  });

  it("adds the professional shop without replacing the anchor menu", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AccountNavigation english professional orderCount={0} addressCount={0} /></MemoryRouter>);
    expect(html).toContain('href="/en/professional"');
    expect(html).toContain("Professional shop");
    expect(html).toContain('href="#account-orders"');
  });
});
