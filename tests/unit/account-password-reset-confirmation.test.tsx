/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AccountDashboard, type AccountDashboardData } from "~/components/account/account-dashboard";

afterEach(cleanup);

const accountData: AccountDashboardData = {
  locale: "fr-FR",
  viewer: { user: { id: "member", email: "membre@example.com" }, profile: { role: "customer", professional_status: null, first_name: "Camille", last_name: "Martin" } },
  orders: [],
  addresses: [],
  professionalQuotes: [],
  setPassword: false,
  next: "/mon-compte",
  mfa: null,
};

describe("account password reset confirmation", () => {
  it("shows the email confirmation next to the account security actions", () => {
    const message = "Demande confirmée. Consultez votre boîte de réception : le lien de modification du mot de passe a été envoyé.";
    const router = createMemoryRouter([{
      path: "*",
      element: <AccountDashboard
        data={accountData}
        result={{ ok: true, scope: "password_reset", message }}
      />,
    }]);

    render(<RouterProvider router={router} />);

    const confirmation = screen.getByRole("status");
    expect(confirmation).toHaveClass("account-password-reset-feedback", "is-success");
    expect(confirmation).toHaveTextContent("E-mail envoyé");
    expect(confirmation).toHaveTextContent(message);
    expect(screen.getAllByText(message)).toHaveLength(1);
  });
});
