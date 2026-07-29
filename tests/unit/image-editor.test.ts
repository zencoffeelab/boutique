import { describe, expect, it } from "vitest";
import {
  calculateImageCrop,
  imageAspectRatio,
  resizedImageDimensions,
} from "~/lib/image-editor";

describe("image editor geometry", () => {
  it("keeps the source ratio for the original format", () => {
    expect(imageAspectRatio("original", 2400, 1600)).toBe(1.5);
  });

  it("applies the editorial 75:83 ratio", () => {
    expect(imageAspectRatio("75:83", 2400, 1600)).toBe(75 / 83);
    expect(resizedImageDimensions({ requestedWidth: 1500, ratio: 75 / 83 })).toEqual({
      width: 1500,
      height: 1660,
      maximumWidth: 2891,
    });
  });

  it("centres a square crop inside a landscape image", () => {
    const crop = calculateImageCrop({
      sourceWidth: 2400,
      sourceHeight: 1600,
      aspect: "1:1",
      zoom: 1,
      positionX: 0,
      positionY: 0,
    });
    expect(crop).toMatchObject({ x: 400, y: 0, width: 1600, height: 1600, ratio: 1 });
  });

  it("moves and zooms the crop without leaving the source image", () => {
    const crop = calculateImageCrop({
      sourceWidth: 2000,
      sourceHeight: 1000,
      aspect: "1:1",
      zoom: 2,
      positionX: 100,
      positionY: -100,
    });
    expect(crop).toMatchObject({ x: 1500, y: 0, width: 500, height: 500 });
  });

  it("limits portrait output so neither dimension exceeds the maximum", () => {
    expect(resizedImageDimensions({ requestedWidth: 3200, ratio: 3 / 4 })).toEqual({
      width: 2400,
      height: 3200,
      maximumWidth: 2400,
    });
  });
});
