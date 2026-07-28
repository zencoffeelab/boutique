import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth.server", () => ({ getAudience: vi.fn(async () => "retail") }));
vi.mock("~/lib/catalog.server", () => ({
  getProducts: vi.fn(),
  hasPurchasableVariant: vi.fn(() => true),
}));

import { demoProducts } from "~/data/demo-catalog";
import { getProducts } from "~/lib/catalog.server";
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
    expect(result).toMatchObject({ product: archived, archived: true, audience: "retail", relatedProducts: [] });
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
