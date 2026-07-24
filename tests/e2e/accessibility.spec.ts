import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/", "/boutique", "/boutique/ethiopie-aricha-station", "/professionnel", "/admin", "/admin/produits", "/admin/commandes", "/admin/expedition", "/admin/contenus", "/admin/editorial"]) {
  test(`no serious accessibility violation on ${path}`, async ({ page }) => {
    await page.goto(path);
    const accept = page.getByRole("button", { name: "Accepter" }); if (await accept.isVisible()) await accept.click();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  });
}
