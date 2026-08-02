import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() =>
  vi.fn(async () => ({ id: "admin-1", role: "admin", demo: false })),
);

vi.mock("~/lib/auth.server", () => ({
  getAudience: vi.fn(async () => "retail"),
  requireAdmin,
}));
vi.mock("~/lib/catalog.server", () => ({
  getAdminProducts: vi.fn(),
  getProducts: vi.fn(),
  hasPurchasableVariant: vi.fn(() => true),
}));

import { demoProducts } from "~/data/demo-catalog";
import { getAdminProducts, getProducts } from "~/lib/catalog.server";
import { loader } from "~/routes/product";

describe("archived product pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads an archived coffee as a readable, non-purchasable page", async () => {
    const archived = { ...demoProducts[0], slug: "ancien-lot", status: "archived" as const };
    vi.mocked(getProducts).mockResolvedValue([archived]);

    const result = await loader({
      request: new Request("http://localhost/boutique/ancien-lot"),
      params: { slug: "ancien-lot" },
      context: {},
    } as never);

    expect(getProducts).toHaveBeenCalledWith({ audience: "retail" });
    expect(result).toMatchObject({
      product: archived,
      archived: true,
      preview: false,
      audience: "retail",
      relatedProducts: [],
    });
  });

  it("loads a draft only through a protected administrator preview", async () => {
    const draft = {
      ...demoProducts[0],
      id: "draft-product-id",
      slug: "cafe-en-brouillon",
      status: "draft" as const,
    };
    vi.mocked(getAdminProducts).mockResolvedValue([draft]);

    const result = await loader({
      request: new Request(
        `http://localhost/boutique/cafe-en-brouillon?preview=${draft.id}`,
      ),
      params: { slug: "cafe-en-brouillon" },
      context: {},
    } as never);

    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(getAdminProducts).toHaveBeenCalledOnce();
    expect(getProducts).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      product: draft,
      archived: false,
      preview: true,
      audience: "retail",
    });
  });

  it("keeps a draft inaccessible from its public URL", async () => {
    const draft = {
      ...demoProducts[0],
      slug: "cafe-en-brouillon",
      status: "draft" as const,
    };
    vi.mocked(getProducts).mockResolvedValue([draft]);

    await expect(
      loader({
        request: new Request("http://localhost/boutique/cafe-en-brouillon"),
        params: { slug: "cafe-en-brouillon" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("keeps returning a 404 for an unknown coffee", async () => {
    vi.mocked(getProducts).mockResolvedValue([]);

    await expect(loader({
      request: new Request("http://localhost/boutique/inconnu"),
      params: { slug: "inconnu" },
      context: {},
    } as never)).rejects.toMatchObject({ status: 404 });
  });
});
