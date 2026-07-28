import { describe, expect, it } from "vitest";
import { dominantLabelColor } from "~/lib/image-color";

describe("label dominant color", () => {
  it("ignores the white paper and keeps the colored label panel", () => {
    const pixels = new Uint8ClampedArray([
      ...Array.from({ length: 20 }, () => [255, 255, 255, 255]).flat(),
      ...Array.from({ length: 5 }, () => [149, 223, 115, 255]).flat(),
    ]);
    expect(dominantLabelColor(pixels)).toBe("#95df73");
  });

  it("uses the neutral catalogue background when no visible color exists", () => {
    expect(dominantLabelColor(new Uint8ClampedArray([0, 0, 0, 0]))).toBe("#d9ddd3");
  });
});
