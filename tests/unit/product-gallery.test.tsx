import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoProducts } from "~/data/demo-catalog";
import { ProductGallery } from "~/routes/product";

describe("product gallery", () => {
  it("adds the composed pack before the gallery without replacing existing images", () => {
    const firstMedia = demoProducts[0].media[0];
    const product = {
      ...demoProducts[0],
      thumbnailLabelUrl: "https://cdn.example.com/label.png",
      thumbnailBackgroundColor: "#95df73",
      media: [
        { ...firstMedia, url: "https://cdn.example.com/gallery-first.jpg" },
        { ...firstMedia, id: "gallery-second", url: "https://cdn.example.com/gallery-second.jpg" },
      ],
    };

    const html = renderToStaticMarkup(<ProductGallery product={product} locale="fr-FR" />);

    expect(html).toContain("product-gallery__composed");
    expect(html).toContain("https://cdn.example.com/label.png");
    expect(html).toContain("https://cdn.example.com/gallery-first.jpg");
    expect(html).toContain("https://cdn.example.com/gallery-second.jpg");
    expect(html.indexOf("product-gallery__composed")).toBeLessThan(html.indexOf("gallery-first.jpg"));
    expect(html.indexOf("gallery-first.jpg")).toBeLessThan(html.indexOf("gallery-second.jpg"));
  });

  it("displays the hover image on the detailed product gallery", () => {
    const product = {
      ...demoProducts[0],
      hoverImageUrl: "https://cdn.example.com/hover.webp",
    };

    const html = renderToStaticMarkup(<ProductGallery product={product} locale="fr-FR" />);

    expect(html).toContain('class="product-gallery__hover-image"');
    expect(html).toContain('src="https://cdn.example.com/hover.webp"');
  });
});
