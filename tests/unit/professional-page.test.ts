import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

vi.mock("~/lib/auth.server", () => ({ getViewer: vi.fn() }));
vi.mock("~/lib/catalog.server", () => ({ getProducts: vi.fn() }));
vi.mock("~/lib/content.server", () => ({ getContentPage: vi.fn() }));

import { getViewer } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { loader, ProfessionalApplicationSuccess } from "~/routes/professional";

describe("professional page modes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only professional coffees for an approved signed-in member", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      user: { id: "pro-user" },
      profile: { professional_status: "approved" },
      responseHeaders: new Headers(),
    } as never);
    vi.mocked(getProducts).mockResolvedValue([]);

    const result = await loader({ request: new Request("https://example.test/professionnel"), params: {}, context: {} } as never);

    expect(result).toMatchObject({ approved: true, signedIn: true, accountEmail: null, professionalStatus: "approved", products: [], content: null });
    expect(getProducts).toHaveBeenCalledWith({ status: "published", audience: "professional" });
    expect(getContentPage).not.toHaveBeenCalled();
  });

  it("loads the introduction and application content for a visitor", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    vi.mocked(getContentPage).mockResolvedValue({ title: "Professionnels", blocks: [] } as never);

    const result = await loader({ request: new Request("https://example.test/professionnel"), params: {}, context: {} } as never);

    expect(result).toMatchObject({ approved: false, signedIn: false, accountEmail: null, professionalStatus: null, products: [], content: { title: "Professionnels" } });
    expect(getProducts).not.toHaveBeenCalled();
    expect(getContentPage).toHaveBeenCalledWith("professionnel", "fr-FR");
  });

  it("reuses the email of a signed-in retail customer", async () => {
    vi.mocked(getViewer).mockResolvedValue({ user: { id: "retail-user", email: "client@example.com" }, profile: { professional_status: null }, responseHeaders: new Headers() } as never);
    vi.mocked(getContentPage).mockResolvedValue({ title: "Professionnels", blocks: [] } as never);
    const result = await loader({ request: new Request("https://example.test/professionnel"), params: {}, context: {} } as never);
    expect(result).toMatchObject({ approved: false, signedIn: true, accountEmail: "client@example.com" });
  });

  it("shows a dedicated acknowledgement after a successful application", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ProfessionalApplicationSuccess, {
          english: false,
          signedIn: true,
          accountPath: "/mon-compte",
        }),
      ),
    );
    expect(html).toContain("votre demande a bien été prise en compte");
    expect(html).toContain('role="status"');
    expect(html).toContain('href="/mon-compte"');
    expect(html).toContain("Voir mon compte");
  });
});
