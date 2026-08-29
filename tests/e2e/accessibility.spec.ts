import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of [
  "/",
  "/boutique",
  "/boutique/ethiopie-aricha-station",
  "/professionnel",
  "/contact",
  "/admin",
  "/admin/produits",
  "/admin/produits/ethiopia-aricha",
  "/admin/commandes",
  "/admin/expedition",
  "/admin/clients",
  "/admin/contenus",
  "/admin/faq",
  "/admin/conseils",
]) {
  test(`no serious accessibility violation on ${path}`, async ({ page }) => {
    await page.goto(path);
    const accept = page.getByRole("button", { name: "Accepter" });
    if (await accept.isVisible()) await accept.click();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      serious,
      serious
        .map((violation) => `${violation.id}: ${violation.help}`)
        .join("\n"),
    ).toEqual([]);
  });
}

test("no serious accessibility violation in the cart drawer", async ({
  page,
}) => {
  await page.goto("/boutique", { waitUntil: "networkidle" });
  const cartButton = page.locator("button.cart-button");
  await expect(cartButton).toHaveAttribute("aria-expanded", "false");
  await cartButton.click();
  await expect(cartButton).toHaveAttribute("aria-expanded", "true");
  const drawer = page.locator("#cart-drawer");
  await expect(drawer).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include("#cart-drawer")
    .analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious,
    serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n"),
  ).toEqual([]);
});
