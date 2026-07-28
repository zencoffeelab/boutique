import { describe, expect, it } from "vitest";
import { demoProducts } from "~/data/demo-catalog";
import { productStructuredData } from "~/lib/seo";

describe("product structured data", () => {
  it("removes commercial offers from archived coffee pages", () => {
    const archived = { ...demoProducts[0], status: "archived" as const };
    expect(productStructuredData(archived, "fr-FR")).not.toHaveProperty("offers");
  });

  it("keeps offers on published coffee pages", () => {
    expect(productStructuredData(demoProducts[0], "fr-FR")).toHaveProperty("offers");
  });
});
