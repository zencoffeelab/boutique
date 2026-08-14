import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { CartProvider } from "~/components/cart/cart-provider";
import { ProductCard } from "~/components/product-card";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { demoProducts } from "~/data/demo-catalog";

function renderCard(professional = false) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CartProvider>
        <QuoteCartProvider>
          <ProductCard
            product={demoProducts[0]}
            locale="fr-FR"
            audience={professional ? "professional" : "retail"}
            quickAdd={!professional}
            quoteAdd={professional}
          />
        </QuoteCartProvider>
      </CartProvider>
    </MemoryRouter>,
  );
}

function renderComposedCard() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CartProvider>
        <QuoteCartProvider>
          <ProductCard
            product={{
              ...demoProducts[0],
              thumbnailLabelUrl: "https://cdn.example.com/label.png",
              thumbnailBackgroundColor: "#95df73",
            }}
            locale="fr-FR"
          />
        </QuoteCartProvider>
      </CartProvider>
    </MemoryRouter>,
  );
}

function renderArchivedCard() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CartProvider>
        <QuoteCartProvider>
          <ProductCard
            product={{ ...demoProducts[0], status: "archived" }}
            locale="fr-FR"
          />
        </QuoteCartProvider>
      </CartProvider>
    </MemoryRouter>,
  );
}

function renderHoverCard() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CartProvider>
        <QuoteCartProvider>
          <ProductCard
            product={{ ...demoProducts[0], hoverImageUrl: "https://cdn.example.com/hover.webp" }}
            locale="fr-FR"
          />
        </QuoteCartProvider>
      </CartProvider>
    </MemoryRouter>,
  );
}

describe("product card", () => {
  it("keeps the extended link and moves the quick add action over the image", () => {
    const html = renderCard();
    expect(html).toContain('class="product-card__link"');
    expect(html).not.toContain("En savoir plus sur le café");
    expect(html.match(/href="\/boutique\//g)).toHaveLength(1);
    expect(html).toContain("Ajouter au panier");
    expect(html).toContain('class="product-card__media"');
    expect(html).toContain("product-card__image-actions");
    expect(html).not.toContain("Voir plus");
    expect(html.indexOf("product-card__image-actions")).toBeLessThan(html.indexOf("product-card__body"));
    expect(html.indexOf("taste-list")).toBeLessThan(html.indexOf("product-card__price"));
  });

  it("keeps the professional audience in the card destination", () => {
    const html = renderCard(true);
    expect(html).toContain("?audience=professional");
    expect(html).not.toContain("À partir de");
    expect(html).toContain("à partir de");
    expect(html.match(/à partir de/g)).toHaveLength(1);
  });

  it("composes the neutral pack, product label and detected background", () => {
    const html = renderComposedCard();
    expect(html).toContain("product-card__image--composed");
    expect(html).toContain("--product-thumbnail-color:#95df73");
    expect(html).toContain("/media/product-cards/zen-coffee-bag-resealable.webp");
    expect(html).toContain("https://cdn.example.com/label.png");
    expect(html).toContain("product-thumbnail-label");
    expect(html).toContain("product-thumbnail-label__image");
  });

  it("does not download the optional hover image before interaction", () => {
    const html = renderHoverCard();
    expect(html).not.toContain('class="product-card__hover-image"');
    expect(html).not.toContain('src="https://cdn.example.com/hover.webp"');
  });

  it("places the archived badge inside the product image and hides the price", () => {
    const html = renderArchivedCard();
    expect(html).toContain('<p class="product-card__archive-label">Archivé</p>');
    expect(html.indexOf("product-card__archive-label")).toBeGreaterThan(html.indexOf("product-card__image"));
    expect(html.indexOf("product-card__archive-label")).toBeLessThan(html.indexOf("product-card__body"));
    expect(html).not.toContain("À partir de");
  });
});
