/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { CartDrawer } from "~/components/cart/cart-drawer";
import { CartProvider, useCart } from "~/components/cart/cart-provider";

const coffee = {
  productId: "kenya-kaiguri",
  variantId: "kenya-kaiguri-200g",
  audience: "retail" as const,
  preview: {
    productSlug: "kenya-kaiguri-ab",
    productNames: { "fr-FR": "Kenya — Kaiguri AB", "en-GB": "Kenya — Kaiguri AB" },
    variantLabel: "200g",
    unitPriceCents: 1_500,
    imageUrl: "/media/kenya.jpg",
  },
};

function AddCoffee({ openCart = false }: { openCart?: boolean }) {
  const { addItem, drawerOpen, openDrawer, closeDrawer } = useCart();
  return <>
    <button type="button" onClick={() => { addItem(coffee); if (openCart) openDrawer(); }}>Ajouter le café test</button>
    {openCart ? <CartDrawer open={drawerOpen} locale="fr-FR" onClose={closeDrawer} /> : null}
  </>;
}

beforeEach(() => {
  window.localStorage.removeItem("zcl:cart:v1");
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});
afterEach(cleanup);

describe("cart addition confirmation", () => {
  it("shows a temporary toast when the cart remains closed", async () => {
    const user = userEvent.setup();
    render(<CartProvider locale="fr-FR"><AddCoffee /></CartProvider>);
    await user.click(screen.getByRole("button", { name: "Ajouter le café test" }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Ajouté au panier");
    expect(status).toHaveTextContent("Kenya — Kaiguri AB · 200g");
    await user.click(within(status).getByRole("button", { name: "Fermer la confirmation" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the confirmation inside the open cart drawer", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CartProvider locale="fr-FR"><AddCoffee openCart /></CartProvider></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Ajouter le café test" }));

    const dialog = screen.getByRole("dialog");
    const status = within(dialog).getByRole("status");
    expect(status).toHaveTextContent("Ajouté au panier");
    expect(status).toHaveTextContent("Kenya — Kaiguri AB · 200g");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
