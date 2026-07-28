/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ProfessionalQuotePreview } from "~/components/professional-quote/quote-preview-modal";

describe("professional quote HTML preview", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
  });
  afterEach(cleanup);

  it("loads and displays the quote without opening the PDF", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <ProfessionalQuotePreview quoteId="quote-1" locale="fr-FR" /> },
      {
        path: "/api/professional-quotes/:id/preview",
        loader: async () => ({ ok: true, quote: {
          id: "quote-1", quote_number: "ZCL-D-2026-001001", status: "pending_payment", total_weight_kg: 10,
          subtotal_before_discount_cents: 67_500, discount_cents: 6_750, total_cents: 60_750,
          valid_until: "2099-08-26T10:00:00.000Z", created_at: "2026-07-27T10:00:00.000Z",
          lines: [{ id: "line-1", product_name: "Kenya Kaiguri AB", variant_label: "1000g", kilograms: 10, discount_percent: 10, discounted_price_cents_per_kg: 6_075, line_total_cents: 60_750 }],
        } }),
      },
    ]);
    const user = userEvent.setup();
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("button", { name: "Voir le devis" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(await screen.findByText("Kenya Kaiguri AB")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("ZCL-D-2026-001001");
    expect(dialog).toHaveTextContent("10 %");
    expect(dialog).toHaveTextContent("607,50 €");
    expect(screen.getByRole("link", { name: "Télécharger le PDF" })).toHaveAttribute("href", "/api/professional-quotes/quote-1/pdf");
    expect(screen.getByRole("link", { name: "Régler le devis" })).toHaveAttribute("href", "/devis/quote-1/paiement");
  });
});
