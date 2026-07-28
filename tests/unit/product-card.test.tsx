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

describe("product card", () => {
  it("uses one extended link and reveals the coffee detail wording", () => {
    const html = renderCard();
    expect(html).toContain('class="product-card__link"');
    expect(html).toContain("En savoir plus sur le café");
    expect(html.match(/href="\/boutique\//g)).toHaveLength(1);
    expect(html).toContain("Ajouter au panier");
  });

  it("keeps the professional audience in the card destination", () => {
    const html = renderCard(true);
    expect(html).toContain("?audience=professional");
    expect(html).not.toContain("À partir de");
    expect(html).toContain("à partir de");
    expect(html.match(/à partir de/g)).toHaveLength(1);
  });
});
