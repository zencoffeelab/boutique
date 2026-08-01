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
  mfa: { currentLevel: "aal1", nextLevel: "aal1", verifiedFactors: [] },
};

function renderDashboard(data: AccountDashboardData) {
  const router = createMemoryRouter([{ path: "*", element: <AccountDashboard data={data} /> }]);
  render(<RouterProvider router={router} />);
}

describe("account two-factor settings", () => {
  it("offers activation to every signed-in member", () => {
    renderDashboard(accountData);
    expect(screen.getByRole("heading", { name: "Double authentification" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Activer la double authentification" })).toBeEnabled();
  });

  it("shows the enabled factor and its disable action", () => {
    renderDashboard({ ...accountData, mfa: { currentLevel: "aal2", nextLevel: "aal2", verifiedFactors: [{ id: "factor-id", friendlyName: "Zen Coffee Lab", createdAt: "2026-08-01T10:00:00.000Z" }] } });
    expect(screen.getByText("Activée")).toBeVisible();
    expect(screen.getByRole("button", { name: "Désactiver la double authentification" })).toBeEnabled();
  });
});
