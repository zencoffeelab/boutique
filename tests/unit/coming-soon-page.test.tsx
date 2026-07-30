/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ComingSoonPage } from "~/components/coming-soon-page";

afterEach(cleanup);

describe("coming soon public page", () => {
  it("shows the brand, the configured message and a direct contact", () => {
    render(<ComingSoonPage title="Notre nouveau site arrive bientôt." message="Quelques jours encore." />);

    expect(screen.getByRole("img", { name: "Zen Coffee Lab" })).toHaveAttribute("src", "/media/logo-black.svg");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Notre nouveau site arrive bientôt.");
    expect(screen.getByText("Quelques jours encore.")).toBeVisible();
    expect(screen.getByRole("link", { name: "contact@zencoffeelab.com" })).toHaveAttribute("href", "mailto:contact@zencoffeelab.com");
  });
});
