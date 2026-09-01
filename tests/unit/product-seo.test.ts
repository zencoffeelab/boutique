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

  it("declares the required return policy fields on every retail offer", () => {
    for (const product of demoProducts.filter((product) => product.status === "published")) {
      const structuredData = productStructuredData(product, "fr-FR");
      const offers = structuredData.offers as Array<{ hasMerchantReturnPolicy: Record<string, unknown> }>;
      expect(offers).not.toHaveLength(0);
      for (const offer of offers) {
        expect(offer.hasMerchantReturnPolicy).toMatchObject({
          "@type": "MerchantReturnPolicy",
          returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
        });
        expect(offer.hasMerchantReturnPolicy.applicableCountry).toEqual(expect.arrayContaining(["FR", "DE", "GB"]));
      }
    }
  });
});
