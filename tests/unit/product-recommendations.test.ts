import { describe, expect, it } from "vitest";
import { demoProducts } from "~/data/demo-catalog";
import type { Product } from "~/domain/types";
import { getRelatedProducts } from "~/lib/product-recommendations";

function withFrenchMetadata(
  product: Product,
  overrides: Partial<
    Product["translations"]["fr-FR"] & { altitudeMeters: number }
  >,
): Product {
  const { altitudeMeters, ...translationOverrides } = overrides;
  return {
    ...product,
    altitudeMeters: altitudeMeters ?? product.altitudeMeters,
    translations: {
      ...product.translations,
      "fr-FR": {
        ...product.translations["fr-FR"],
        ...translationOverrides,
      },
    },
  };
}

describe("product recommendations", () => {
  it("excludes the current coffee and limits the result to three products", () => {
    const current = demoProducts[0];
    const related = getRelatedProducts(
      current,
      demoProducts,
      "fr-FR",
    );

    expect(related).toHaveLength(3);
    expect(related).not.toContainEqual(current);
  });

  it("prioritizes matching metadata over altitude alone", () => {
    const current = demoProducts[0];
    const metadataMatch = withFrenchMetadata(demoProducts[1], {
      producer: current.translations["fr-FR"].producer,
      region: current.translations["fr-FR"].region,
      variety: current.translations["fr-FR"].variety,
      process: current.translations["fr-FR"].process,
      altitudeMeters: current.altitudeMeters + 900,
    });
    const altitudeMatch = withFrenchMetadata(demoProducts[2], {
      producer: "Autre producteur",
      region: "Autre région",
      variety: "Autre variété",
      process: "Autre traitement",
      altitudeMeters: current.altitudeMeters,
    });

    expect(
      getRelatedProducts(
        current,
        [current, altitudeMatch, metadataMatch],
        "fr-FR",
        2,
      ).map((product) => product.id),
    ).toEqual([metadataMatch.id, altitudeMatch.id]);
  });

  it("never recommends an archived coffee", () => {
    const current = demoProducts[0];
    const archived = { ...demoProducts[1], status: "archived" as const };

    expect(
      getRelatedProducts(current, [current, archived], "fr-FR"),
    ).toEqual([]);
  });
});
