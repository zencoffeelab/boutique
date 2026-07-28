/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfessionalQuoteAdd } from "~/components/professional-quote/professional-quote-add";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { demoProducts } from "~/data/demo-catalog";

afterEach(cleanup);

describe("professional quote quantity selector", () => {
  it("increments and decrements the compact quantity field", async () => {
    const user = userEvent.setup();
    render(<QuoteCartProvider><ProfessionalQuoteAdd product={demoProducts[0]} locale="fr-FR" /></QuoteCartProvider>);

    const input = screen.getByRole("spinbutton", { name: "Quantité (kg)" });
    const decrease = screen.getByRole("button", { name: "Diminuer la quantité" });
    const increase = screen.getByRole("button", { name: "Augmenter la quantité" });

    expect(input).toHaveValue(1);
    expect(screen.queryByText("Quantité (kg)")).not.toBeInTheDocument();
    expect(screen.getByText("à partir de")).toBeInTheDocument();
    expect(document.querySelector(".quantity-stepper__unit")).toHaveTextContent("kg");
    expect(screen.queryByText("–10 % à partir de 10 kg")).not.toBeInTheDocument();
    expect(decrease).toBeDisabled();
    await user.click(increase);
    expect(input).toHaveValue(2);
    expect(decrease).toBeEnabled();
    await user.click(decrease);
    expect(input).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Ajouter au devis" })).toBeInTheDocument();
  });
});
