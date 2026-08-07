import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/catalog.server", () => ({ getArticles: vi.fn(), getProducts: vi.fn() }));

import { demoArticles } from "~/data/demo-catalog";
import { getArticles, getProducts } from "~/lib/catalog.server";
import { loader } from "~/routes/advice-detail";

describe("advice detail recommendations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suggests up to three other articles without repeating the current one", async () => {
    const current = demoArticles[0];
    const articles = [
      current,
      demoArticles[1],
      { ...demoArticles[1], slug: "mouture" },
      { ...demoArticles[1], slug: "temperature" },
      { ...demoArticles[1], slug: "temps-extraction" },
    ];
    vi.mocked(getArticles).mockResolvedValue(articles);
    vi.mocked(getProducts).mockResolvedValue([]);

    const result = await loader({
      request: new Request(`http://localhost/conseils/${current.slug}`),
      params: { slug: current.slug },
      context: {},
    } as never);

    expect(result.article.slug).toBe(current.slug);
    expect(result.relatedArticles.map((article) => article.slug)).toEqual([
      demoArticles[1].slug,
      "mouture",
      "temperature",
    ]);
    expect(result.relatedArticles).toHaveLength(3);
  });
});
