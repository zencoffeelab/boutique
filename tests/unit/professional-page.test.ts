import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({ getViewer: vi.fn() }));
vi.mock("~/lib/catalog.server", () => ({ getProducts: vi.fn() }));
vi.mock("~/lib/content.server", () => ({ getContentPage: vi.fn() }));

import { getViewer } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { loader } from "~/routes/professional";

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

    expect(result).toMatchObject({ approved: true, signedIn: true, professionalStatus: "approved", products: [], content: null });
    expect(getProducts).toHaveBeenCalledWith({ status: "published", audience: "professional", availableOnly: true });
    expect(getContentPage).not.toHaveBeenCalled();
  });

  it("loads the introduction and application content for a visitor", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    vi.mocked(getContentPage).mockResolvedValue({ title: "Professionnels", blocks: [] } as never);

    const result = await loader({ request: new Request("https://example.test/professionnel"), params: {}, context: {} } as never);

    expect(result).toMatchObject({ approved: false, signedIn: false, professionalStatus: null, products: [], content: { title: "Professionnels" } });
    expect(getProducts).not.toHaveBeenCalled();
    expect(getContentPage).toHaveBeenCalledWith("professionnel", "fr-FR");
  });
});
