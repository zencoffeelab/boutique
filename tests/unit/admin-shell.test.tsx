import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminShell } from "~/components/admin-shell";

describe("admin navigation", () => {
  it("renders the complete shared menu and marks the active section", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AdminShell active="advice"><h1>Conseils</h1></AdminShell></MemoryRouter>);

    for (const label of ["Tableau de bord", "Commandes", "Produits", "Stocks", "Expédition", "Clients", "Professionnels", "Pages", "FAQ", "Conseils", "Modifications"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("Archives");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page" href="/admin/conseils"');
    expect(html).toContain('href="/admin/faq"');
    expect(html).toContain('href="/admin/clients"');
    expect(html).toContain('href="/admin/produits"');
    expect(html).toContain('href="/admin/modifications"');
    expect(html).not.toContain('href="/admin#catalogue"');
  });
});
