import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminShell, successfulAdminMessage } from "~/components/admin-shell";

describe("admin navigation", () => {
  it("renders the complete shared menu and marks the active section", () => {
    const router = createMemoryRouter([{ path: "/", element: <AdminShell active="advice"><h1>Conseils</h1></AdminShell> }]);
    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    for (const label of ["Tableau de bord", "Commandes", "Produits", "Expédition", "Clients", "Professionnels", "Pages", "Bandeau", "FAQ", "Conseils", "Modifications"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("Archives");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page" href="/admin/conseils"');
    expect(html).toContain('href="/admin/faq"');
    expect(html).toContain('href="/admin/clients"');
    expect(html).toContain('href="/admin/produits"');
    expect(html).toContain('href="/admin/modifications"');
    expect(html).toContain('href="/admin/bandeau"');
    expect(html).not.toContain('href="/admin/produits#catalogue"');
    expect(html).not.toContain('href="/admin#catalogue"');
    expect(html).toContain('action="/mon-compte"');
    expect(html).toContain('name="intent" value="logout"');
    expect(html).toContain("Se déconnecter");
  });

  it("only accepts successful mutation results as confirmations", () => {
    expect(successfulAdminMessage({ ok: true, message: "Produit enregistré." })).toBe("Produit enregistré.");
    expect(successfulAdminMessage({ ok: true })).toBe("La modification a bien été enregistrée.");
    expect(successfulAdminMessage({ ok: false, message: "Produit invalide." })).toBeNull();
    expect(successfulAdminMessage(undefined)).toBeNull();
  });
});
