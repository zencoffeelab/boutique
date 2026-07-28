/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRouter, Form, RouterProvider } from "react-router";
import { AdminShell } from "~/components/admin-shell";

describe("admin modification confirmation", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  afterEach(cleanup);

  it("opens a modal after a successful back-office action", async () => {
    const router = createMemoryRouter([{
      path: "/",
      action: async () => ({ ok: true, message: "Produit enregistré." }),
      element: <AdminShell active="products">
        <Form method="post"><button type="submit">Enregistrer le produit</button></Form>
      </AdminShell>,
    }]);
    const user = userEvent.setup();
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("button", { name: "Enregistrer le produit" }));

    const dialog = await screen.findByRole("dialog") as HTMLDialogElement;
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("Modification confirmée");
    expect(dialog).toHaveTextContent("Produit enregistré.");

    dialog.close();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not open a modal when the action fails", async () => {
    const router = createMemoryRouter([{
      path: "/",
      action: async () => ({ ok: false, message: "Produit invalide." }),
      element: <AdminShell active="products">
        <Form method="post"><button type="submit">Enregistrer le produit</button></Form>
      </AdminShell>,
    }]);
    const user = userEvent.setup();
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("button", { name: "Enregistrer le produit" }));

    await waitFor(() => expect(router.state.navigation.state).toBe("idle"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the confirmation visible after a successful redirect", async () => {
    const router = createMemoryRouter([{
      path: "/admin/produits/:id",
      element: <AdminShell active="products"><p>Fiche produit</p></AdminShell>,
    }], { initialEntries: ["/admin/produits/cafe-test?confirmation=product-created"] });
    render(<RouterProvider router={router} />);

    const dialog = await screen.findByRole("dialog") as HTMLDialogElement;
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("Produit créé.");
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });
});
