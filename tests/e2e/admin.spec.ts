import { expect, test } from "@playwright/test";

test("dashboard and product management use distinct pages", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Activité récente" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Produits et variantes" }),
  ).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Administration" })
    .getByRole("link", { name: "Produits", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/produits$/);
  await expect(
    page.getByRole("heading", { name: "Produits", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Administration" })
      .getByRole("link", { name: "Archives" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Catalogue actuel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Produits archivés" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Produits publiés et brouillons" })
      .getByRole("columnheader", { name: "Mise à jour rapide" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Produits archivés" }),
  ).toBeVisible();
});

test("product editor provides a save action at the top", async ({ page }) => {
  await page.goto("/admin/produits/nouveau");
  await expect(
    page.getByRole("heading", { name: "Nouveau café" }),
  ).toBeVisible();
  const topSave = page.getByRole("button", {
    name: "Enregistrer",
    exact: true,
  });
  await expect(topSave).toBeVisible();
  await expect(topSave).toHaveAttribute("form", "product-editor-form");
  await expect(page.locator("form#product-editor-form")).toHaveCount(1);
});

test("product editor provides two editable editorial blocks", async ({
  page,
}) => {
  await page.goto("/admin/produits/ethiopia-aricha");
  await expect(
    page.getByRole("heading", { name: "Blocs éditoriaux" }),
  ).toBeVisible();
  await expect(page.locator("form.admin-editorial-block")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Enregistrer le bloc 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enregistrer le bloc 2" }),
  ).toBeVisible();
  await expect(page.getByText("Texte à gauche · image à droite")).toBeVisible();
  await expect(page.getByText("Image à gauche · texte à droite")).toBeVisible();
});

test("FAQ and advice management use separate pages", async ({ page }) => {
  await page.goto("/admin/faq");
  await expect(
    page.getByRole("heading", { name: "FAQ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nouveau conseil" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Administration" })
    .getByRole("link", { name: "Conseils", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/conseils$/);
  await expect(
    page.getByRole("heading", { name: "Conseils", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nouvelle question" }),
  ).toHaveCount(0);
});

test("legacy editorial URL redirects to the FAQ page", async ({ page }) => {
  await page.goto("/admin/editorial");
  await expect(page).toHaveURL(/\/admin\/faq$/);
});
