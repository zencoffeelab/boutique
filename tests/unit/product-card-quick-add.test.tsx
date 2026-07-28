/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { CartProvider, useCart } from "~/components/cart/cart-provider";
import { ProductCard } from "~/components/product-card";
import { demoProducts } from "~/data/demo-catalog";

function CartCount() {
  const { itemCount } = useCart();
  return <output aria-label="Articles dans le panier">{itemCount}</output>;
}

afterEach(cleanup);
beforeEach(() => window.localStorage.removeItem("zcl:cart:v1"));

describe("product card price menu", () => {
  it("opens from the cart button and adds the selected format", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CartProvider>
          <ProductCard product={demoProducts[0]} locale="fr-FR" audience="retail" quickAdd />
          <CartCount />
        </CartProvider>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Ajouter au panier" });
    expect(trigger).toHaveClass("button--ghost");
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "Poids" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(options.length).toBeGreaterThan(1);
    expect(menu).toHaveTextContent("€");

    await user.click(options[0]);
    expect(screen.getByLabelText("Articles dans le panier")).toHaveTextContent("1");
    expect(screen.queryByRole("menu", { name: "Poids" })).not.toBeInTheDocument();
  });
});
