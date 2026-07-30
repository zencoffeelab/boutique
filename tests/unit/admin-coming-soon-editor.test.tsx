/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AdminComingSoonEditor } from "~/components/admin-coming-soon-editor";
import { defaultComingSoonSettings } from "~/lib/coming-soon";

afterEach(cleanup);

function renderEditor(demo = false) {
  const router = createMemoryRouter([{
    path: "*",
    element: <AdminComingSoonEditor initialSettings={defaultComingSoonSettings} demo={demo} />,
  }]);
  return render(<RouterProvider router={router} />);
}

describe("coming soon administration", () => {
  it("previews edits in French and English before activation", async () => {
    const user = userEvent.setup();
    renderEditor();

    const frenchTitle = screen.getByLabelText("Titre");
    await user.clear(frenchTitle);
    await user.type(frenchTitle, "Nous revenons bientôt");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Nous revenons bientôt");

    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Our new website is coming soon.");

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Activé")).toBeVisible();
  });

  it("keeps publication controls disabled in demonstration mode", () => {
    renderEditor(true);

    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Enregistrer le mode construction/ })).toBeDisabled();
  });
});
