import { expect, test } from "@playwright/test";

test("French guest can add a coffee and reach checkout", async ({ page }) => {
  const consoleErrors: string[] = []; page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); }); page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/boutique");
  await expect(page.getByRole("heading", { name: "La boutique café" })).toBeVisible();
  await page.locator(".product-card h3 a").first().click();
  await page.getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByRole("link", { name: /Panier \(1\)/ }).click();
  await expect(page.getByRole("heading", { name: "Votre panier" })).toBeVisible();
  await page.getByRole("link", { name: "Passer la commande" }).click();
  await expect(page.getByRole("heading", { name: "Livraison & paiement" })).toBeVisible();
  await page.getByLabel("Prénom").fill("Ada");
  await page.getByLabel("Nom", { exact: true }).fill("Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Téléphone").fill("0600000000");
  await page.getByLabel("Adresse", { exact: true }).fill("1 rue du Café");
  await page.getByLabel("Code postal").fill("37000");
  await page.getByLabel("Ville").fill("Tours");
  const quoteResponse = page.waitForResponse((response) => response.url().endsWith("/api/shipping/quote") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Calculer la livraison" }).click();
  await expect((await quoteResponse).status()).toBe(200);
  await expect(page.locator(".rate-option").getByText("Mondial Relay", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Payer en toute sécurité" }).click();
  await expect(page.getByRole("heading", { name: "Merci." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Panier \(0\)/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("English URLs, language switch and professional form are accessible", async ({ page }) => {
  const consoleErrors: string[] = []; page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); }); page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: /Coffee with clarity/ })).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu" }); if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Professionals" }).click();
  await expect(page.getByLabel("Company name")).toBeVisible();
  await page.getByRole("link", { name: "FR" }).click();
  await expect(page).toHaveURL(/\/professionnel$/);
  expect(consoleErrors).toEqual([]);
});

test("Zone 2 checkout offers Mondial Relay only after pickup-point selection", async ({ page }) => {
  await page.goto("/boutique");
  await page.locator(".product-card h3 a").first().click();
  await page.getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByRole("link", { name: /Panier \(1\)/ }).click();
  await page.getByRole("link", { name: "Passer la commande" }).click();
  await page.getByLabel("Prénom").fill("Ada");
  await page.getByLabel("Nom", { exact: true }).fill("Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Téléphone").fill("0600000000");
  await page.getByLabel("Adresse", { exact: true }).fill("1 Hauptstrasse");
  await page.getByLabel("Code postal").fill("10115");
  await page.getByLabel("Ville").fill("Berlin");
  await page.getByLabel("Pays").selectOption("DE");
  await expect(page.getByRole("heading", { name: /Préférence de livraison/ })).toBeVisible();
  await page.getByLabel("Point relais").check();
  await page.getByRole("button", { name: "Rechercher les points relais" }).click();
  await page.locator(".pickup-option input").first().check();
  await page.getByRole("button", { name: "Calculer la livraison" }).click();
  await expect(page.locator(".rate-option__details > strong")).toHaveText("Mondial Relay");
});
