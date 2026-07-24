import { expect, test } from "@playwright/test";

test("dashboard and product management use distinct pages", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activité récente" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Produits et variantes" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Produits", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/produits$/);
  await expect(page.getByRole("heading", { name: "Produits", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Archives" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Catalogue actuel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Produits archivés" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Produits publiés et brouillons" }).getByRole("columnheader", { name: "Mise à jour rapide" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Produits archivés" })).toBeVisible();
});

test("product editor provides a save action at the top", async ({ page }) => {
  await page.goto("/admin/produits/nouveau");
  await expect(page.getByRole("heading", { name: "Nouveau café" })).toBeVisible();
  const topSave = page.getByRole("button", { name: "Enregistrer", exact: true });
  await expect(topSave).toBeVisible();
  await expect(topSave).toHaveAttribute("form", "product-editor-form");
  await expect(page.locator("form#product-editor-form")).toHaveCount(1);
});
