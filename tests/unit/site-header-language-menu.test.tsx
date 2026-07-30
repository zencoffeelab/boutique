/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { CartProvider } from "~/components/cart/cart-provider";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { SiteHeader } from "~/components/site-header";

beforeEach(() => window.localStorage.removeItem("zcl:cart:v1"));
afterEach(cleanup);

describe("custom language menu", () => {
  it("opens, closes with Escape and keeps the current URL parameters", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/boutique?origine=kenya"]}>
        <CartProvider><QuoteCartProvider><SiteHeader signedIn={false} professional={false} accountInitials={null} /></QuoteCartProvider></CartProvider>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Langue active : Français" });
    expect(trigger.querySelector('[data-language-flag="fr-FR"] svg')).toBeInTheDocument();
    await user.click(trigger);
    const languageMenu = screen.getByRole("menu", { name: "Choisir la langue" });
    expect(languageMenu).toBeInTheDocument();
    expect(languageMenu.querySelectorAll("[data-language-flag] svg")).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "English (EN)" })).toHaveAttribute("href", "/en/shop?origine=kenya");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Choisir la langue" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "English (EN)" }));
    expect(screen.getByRole("button", { name: "Active language: English" })).toHaveTextContent("EN");
  });
});
