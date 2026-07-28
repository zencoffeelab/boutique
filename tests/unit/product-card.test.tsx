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

describe("product card", () => {
  it("keeps the extended link and explicit product actions", () => {
    const html = renderCard();
    expect(html).toContain('class="product-card__link"');
    expect(html).not.toContain("En savoir plus sur le café");
    expect(html.match(/href="\/boutique\//g)).toHaveLength(2);
    expect(html).toContain("Ajouter au panier");
    expect(html).toContain("Voir plus");
    expect(html).toContain("product-card__more-link");
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
    expect(html).toContain("/media/product-cards/zen-coffee-bag-neutral.png");
    expect(html).toContain("https://cdn.example.com/label.png");
    expect(html).toContain("product-thumbnail-label");
    expect(html).toContain("product-thumbnail-label__image");
  });

  it("places the archived badge inside the product image and hides the price", () => {
    const html = renderArchivedCard();
    expect(html).toContain('<p class="product-card__archive-label">Archivé</p>');
    expect(html.indexOf("product-card__archive-label")).toBeGreaterThan(html.indexOf("product-card__image"));
    expect(html.indexOf("product-card__archive-label")).toBeLessThan(html.indexOf("product-card__body"));
    expect(html).not.toContain("À partir de");
  });
});
