import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

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
  const sectionNavigation = page.getByRole("navigation", { name: "Sections de la fiche produit" });
  await expect(sectionNavigation).toBeVisible();
  const contentLink = sectionNavigation.getByRole("link", { name: "Contenu" });
  await expect(contentLink).toHaveAttribute("href", "#product-editor-form");
  await expect(contentLink).toHaveAttribute("aria-current", "location");
  await expect(sectionNavigation.getByRole("link")).toHaveCount(1);
});

test("product editor provides two editable editorial blocks", async ({
  page,
}) => {
  await page.goto("/admin/produits/ethiopia-aricha", { waitUntil: "networkidle" });
  const contentForm = page.locator("form#product-editor-form");
  await expect(contentForm.getByRole("heading", { name: "Contenu", exact: true })).toBeVisible();
  const contentTabs = contentForm.getByRole("tablist", { name: "Langue du contenu produit" });
  await expect(contentTabs.getByRole("tab", { name: "Français" })).toHaveAttribute("aria-selected", "true");
  await contentTabs.getByRole("tab", { name: "English" }).click();
  await expect(contentForm.locator('input[name="nameEn"]')).toBeVisible();
  await expect(contentForm.locator('input[name="nameFr"]')).toBeHidden();
  await expect(contentForm.locator('[name="bodyFr"], [name="bodyEn"]')).toHaveCount(0);
  await expect(contentForm.getByText("Contenu produit")).toHaveCount(0);
  await expect(contentForm).toHaveAttribute("enctype", "multipart/form-data");
  await expect(
    page.getByRole("heading", { name: "Blocs éditoriaux" }),
  ).toBeVisible();
  const sectionNavigation = page.getByRole("navigation", { name: "Sections de la fiche produit" });
  await expect(sectionNavigation).toBeVisible();
  await expect(sectionNavigation.getByRole("link")).toHaveCount(7);
  expect(await sectionNavigation.getByRole("link").evaluateAll((links) =>
    links.every((link) => {
      const target = link.getAttribute("href");
      return Boolean(target && document.querySelector(target));
    }),
  )).toBe(true);
  await expect(sectionNavigation.getByRole("link", { name: "Galerie" })).toHaveAttribute("href", "#product-gallery");
  await sectionNavigation.getByRole("link", { name: "Galerie" }).click();
  await expect(page).toHaveURL(/#product-gallery$/);
  await expect(sectionNavigation.getByRole("link", { name: "Galerie" })).toHaveAttribute("aria-current", "location");
  const gallerySection = page.locator("#product-gallery");
  await expect(gallerySection).toBeInViewport();
  const galleryItems = gallerySection.locator(".admin-media-item");
  expect(await galleryItems.count()).toBeGreaterThan(0);
  await expect(gallerySection.getByRole("button", { name: /Supprimer l’image \d+ de la galerie/ })).toHaveCount(await galleryItems.count());
  const firstDeleteMediaForm = galleryItems.first().locator('form:has(input[name="intent"][value="delete_media"])');
  await expect(firstDeleteMediaForm.locator('input[name="productId"]')).toHaveValue(/.+/);
  await expect(firstDeleteMediaForm.locator('input[name="mediaId"]')).toHaveValue(/.+/);
  await page.locator("#product-variants").evaluate((section) => section.scrollIntoView({ block: "start" }));
  await expect(sectionNavigation.getByRole("link", { name: "Variantes", exact: true })).toHaveAttribute("aria-current", "location");
  const variantsRegion = page.getByRole("region", { name: "Variantes du produit" });
  const editVariant = variantsRegion.getByRole("button", { name: /Modifier la variante/ }).first();
  await expect(editVariant).toHaveAttribute("aria-expanded", "false");
  await editVariant.click();
  await expect(editVariant).toHaveAttribute("aria-expanded", "true");
  const variantEditor = variantsRegion.locator("form.admin-variant-edit-form");
  await expect(variantEditor).toBeVisible();
  await expect(variantEditor.locator('input[name="sku"]')).not.toHaveValue("");
  await expect(variantEditor.locator('input[name="weightGrams"]')).toHaveValue(/\d+/);
  await expect(variantEditor.locator('input[name="stockOnHand"]')).toHaveAttribute("min", /\d+/);
  await expect(variantEditor.locator('input[name="retailPriceCents"]')).toHaveValue(/\d+/);
  await expect(variantEditor.locator('input[name="hsCode"]')).not.toHaveValue("");
  await expect(variantEditor.getByRole("button", { name: "Enregistrer la variante" })).toBeVisible();
  await variantEditor.getByRole("button", { name: "Annuler" }).click();
  await expect(variantEditor).toHaveCount(0);
  await expect(contentForm.locator("#product-editorial-blocks")).toBeVisible();
  await expect(page.locator(".admin-editorial-block")).toHaveCount(2);
  const firstBlockTabs = page.getByRole("tablist", { name: "Langue du bloc éditorial 1" });
  await firstBlockTabs.getByRole("tab", { name: "English" }).click();
  const firstEditorialBlock = page.locator(".admin-editorial-block").first();
  await expect(firstEditorialBlock.locator('input[name="editorial1TitleEn"]')).toBeVisible();
  await expect(firstEditorialBlock.locator('input[name="editorial1TitleFr"]')).toBeHidden();
  await expect(page.getByRole("button", { name: /Enregistrer le bloc/ })).toHaveCount(0);
  expect(await firstEditorialBlock.evaluate((block) => block.closest("form")?.id)).toBe("product-editor-form");
  await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toHaveAttribute("form", "product-editor-form");
  await expect(page.getByText("Texte à gauche · image à droite")).toBeVisible();
  await expect(page.getByText("Image à gauche · texte à droite")).toBeVisible();
});

test("every product image upload opens the crop and resize editor", async ({
  page,
}) => {
  await page.goto("/admin/produits/ethiopia-aricha");
  await expect(page.locator(".admin-image-input")).toHaveCount(5);

  const firstEditorialBlock = page.locator(".admin-editorial-block").first();
  await expect(firstEditorialBlock.locator(".admin-image-input")).toHaveAttribute("data-ready", "true");
  const fileInput = firstEditorialBlock.locator('input[type="file"]');
  await expect(fileInput).toHaveAttribute("name", "editorial1File");
  expect(await fileInput.evaluate((input) => input.closest("form")?.id)).toBe("product-editor-form");
  await fileInput.setInputFiles(resolve("public/media/product-cards/zen-coffee-bag-resealable.png"));

  const editor = page.getByRole("dialog", { name: "Recadrer et redimensionner" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Format de recadrage")).toHaveValue("75:83");
  await expect(editor.getByLabel("Format de recadrage")).toBeDisabled();
  await editor.getByLabel("Largeur finale (px)").fill("750");
  await editor.getByRole("button", { name: "Valider le recadrage" }).click();
  await expect(editor).toBeHidden();

  await expect(
    firstEditorialBlock.locator(".admin-image-input__summary small").filter({ hasText: "750 × 830 px" }),
  ).toBeVisible();
  expect(await fileInput.evaluate((input: HTMLInputElement) => ({
    name: input.files?.[0]?.name,
    type: input.files?.[0]?.type,
  }))).toEqual({
    name: "zen-coffee-bag-resealable-recadree.png",
    type: "image/png",
  });
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

test("the top announcement has a dedicated administration page", async ({ page }) => {
  await page.goto("/admin/bandeau");
  await expect(page.getByRole("heading", { name: "Bandeau supérieur" })).toBeVisible();
  await expect(page.getByLabel("Texte du bandeau")).toHaveValue("Livraison offerte dès 75 € en France");
  await expect(page.getByLabel("Announcement text")).toHaveValue("Free delivery in France from €75");
  await expect(page.locator(".admin-announcement-preview")).toHaveCount(2);
  await expect(
    page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Bandeau" }),
  ).toHaveAttribute("aria-current", "page");
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
