/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { CartProvider } from "~/components/cart/cart-provider";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { SiteHeader } from "~/components/site-header";

const accountData = {
  locale: "fr-FR" as const,
  viewer: {
    user: { id: "user-1", email: "jeanne@example.com" },
    profile: { role: "customer", professional_status: null, first_name: "Jeanne", last_name: "Dupont" },
  },
  orders: [],
  addresses: [],
  professionalQuotes: [],
  setPassword: false,
  authError: null,
  next: "/mon-compte",
  mfa: null,
};

beforeEach(() => {
  window.localStorage.clear();
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

afterEach(cleanup);

describe("account sidebar", () => {
  it("opens from My account and switches sections with the top tab bar", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      {
        path: "/",
        element: <CartProvider><QuoteCartProvider><SiteHeader signedIn professional={false} accountInitials="JD" /></QuoteCartProvider></CartProvider>,
      },
      { path: "/mon-compte", loader: () => accountData, element: <div /> },
    ]);
    render(<RouterProvider router={router} />);

    await user.click(screen.getAllByRole("button", { name: "Mon compte" }).at(-1)!);
    expect(await screen.findByRole("tab", { name: "Commandes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Vos commandes" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Adresses" }));
    expect(screen.getByRole("tab", { name: "Adresses" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Vos adresses" })).toBeVisible();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Paramètres" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Paramètres & sécurité" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Voir la page complète/ })).toHaveAttribute("href", "/mon-compte");
    expect(screen.getByRole("button", { name: /Se déconnecter/ })).toBeVisible();
  });
});
