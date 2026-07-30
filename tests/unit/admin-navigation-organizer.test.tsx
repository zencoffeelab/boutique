/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AdminNavigationOrganizer } from "~/components/admin-navigation-organizer";
import { defaultSiteNavigation, type SiteNavigationConfiguration } from "~/lib/site-navigation";

afterEach(cleanup);

function storedConfiguration(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[name="configuration"]');
  return JSON.parse(input?.value ?? "null") as SiteNavigationConfiguration;
}

function renderOrganizer(demo: boolean) {
  const router = createMemoryRouter([{
    path: "*",
    element: <AdminNavigationOrganizer initialConfiguration={defaultSiteNavigation} demo={demo} />,
  }]);
  return render(<RouterProvider router={router} />);
}

describe("admin navigation organizer", () => {
  it("reorders the menu and renames footer columns without drag and drop", async () => {
    const user = userEvent.setup();
    const { container } = renderOrganizer(false);

    const menu = screen.getByRole("list", { name: "Pages du menu principal" });
    await user.click(within(menu).getByRole("button", { name: "Descendre Boutique" }));
    const frenchTitles = screen.getAllByLabelText("Nom français");
    await user.clear(frenchTitles[0]);
    await user.type(frenchTitles[0], "Découvrir");

    const configuration = storedConfiguration(container);
    expect(configuration.menu.slice(0, 2)).toEqual(["professional", "shop"]);
    expect(configuration.footerColumns[0].titles["fr-FR"]).toBe("Découvrir");
    expect(screen.getByRole("button", { name: /Enregistrer le rangement/ })).toBeEnabled();
  });

  it("keeps all editing controls disabled in demonstration mode", () => {
    renderOrganizer(true);

    expect(screen.getByRole("button", { name: /Enregistrer le rangement/ })).toBeDisabled();
    expect(screen.getAllByLabelText("Nom français")[0]).toBeDisabled();
  });
});
