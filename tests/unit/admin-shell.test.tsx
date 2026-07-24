import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminShell } from "~/components/admin-shell";

describe("admin navigation", () => {
  it("renders the complete shared menu and marks the active section", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AdminShell active="editorial"><h1>FAQ</h1></AdminShell></MemoryRouter>);

    for (const label of ["Tableau de bord", "Commandes", "Produits", "Stocks", "Expédition", "Professionnels", "Pages", "FAQ &amp; Conseils", "Archives"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page" href="/admin/editorial"');
    expect(html).toContain('href="/admin/produits"');
    expect(html).not.toContain('href="/admin#catalogue"');
  });
});
