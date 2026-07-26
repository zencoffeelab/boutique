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

test("site changes have a dedicated back-office history", async ({ page }) => {
  await page.goto("/admin/modifications");
  await expect(page.getByRole("heading", { name: "Journal des modifications", exact: true })).toBeVisible();
  await expect(page.getByText("modifications recensées")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Éditeur enrichi pour les conseils" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paiement Stripe sécurisé sur Cloudflare" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Modifications" }),
  ).toHaveAttribute("aria-current", "page");
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
  const contentForm = page.locator("form#product-editor-form");
  await expect(contentForm.getByRole("heading", { name: "Contenu", exact: true })).toBeVisible();
  const contentTabs = contentForm.getByRole("tablist", { name: "Langue du contenu produit" });
  await expect(contentTabs.getByRole("tab", { name: "Français" })).toHaveAttribute("aria-selected", "true");
  await contentTabs.getByRole("tab", { name: "English" }).click();
  await expect(contentForm.locator('input[name="nameEn"]')).toBeVisible();
  await expect(contentForm.locator('input[name="nameFr"]')).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Blocs éditoriaux" }),
  ).toBeVisible();
  expect(await contentForm.evaluate((form) => {
    const editorialSection = document.querySelector(".admin-editorial-section");
    return editorialSection ? Boolean(form.compareDocumentPosition(editorialSection) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
  })).toBe(true);
  await expect(page.locator("form.admin-editorial-block")).toHaveCount(2);
  const firstBlockTabs = page.getByRole("tablist", { name: "Langue du bloc éditorial 1" });
  await firstBlockTabs.getByRole("tab", { name: "English" }).click();
  await expect(page.locator('form.admin-editorial-block').first().locator('input[name="titleEn"]')).toBeVisible();
  await expect(page.locator('form.admin-editorial-block').first().locator('input[name="titleFr"]')).toBeHidden();
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
  const richTextToolbar = page.getByRole("toolbar", { name: "Mise en forme — Paragraphes" });
  await expect(richTextToolbar).toBeVisible();
  await expect(richTextToolbar.getByRole("button", { name: "Gras" })).toBeVisible();
  await expect(richTextToolbar.getByRole("button", { name: "Liste à puces" })).toBeVisible();
  await expect(richTextToolbar.getByRole("button", { name: "Ajouter ou modifier un lien" })).toBeVisible();
});

test("retail customers have a dedicated administration page", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membres particuliers" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Clients", exact: true })).toHaveAttribute("aria-current", "page");
});

test("legacy editorial URL redirects to the FAQ page", async ({ page }) => {
  await page.goto("/admin/editorial");
  await expect(page).toHaveURL(/\/admin\/faq$/);
});
