import { expect, test } from "@playwright/test";

test("public header stays visible while scrolling", async ({ page }) => {
  await page.goto("/");
  const header = page.locator(".site-header");
  await expect(header).toHaveCSS("position", "sticky");
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(async () => Math.round((await header.boundingBox())?.y ?? -1)).toBe(0);
});

test("public header identifies a signed-out visitor", async ({ page }) => {
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 0) <= 700) {
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".mobile-account-link")).toHaveAccessibleName("Se connecter");
    await expect(page.locator(".mobile-account-link .lucide-log-in")).toBeVisible();
  } else {
    await expect(page.locator(".account-button")).toHaveAccessibleName("Se connecter");
    await expect(page.locator(".account-button .lucide-log-in")).toBeVisible();
  }
});

test("a coffee can be added to the cart directly from the shop", async ({ page }) => {
  await page.goto("/boutique");
  const firstProduct = page.locator(".product-card").first();
  await expect(firstProduct.getByRole("combobox", { name: "Poids" })).toBeVisible();
  await firstProduct.getByRole("button", { name: "Ajouter au panier" }).click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".cart-drawer-line")).toHaveCount(1);
  await expect(page).toHaveURL(/\/boutique$/);
  await expect(page.getByRole("button", { name: "Panier (1)" })).toBeVisible();
});

test("French guest can add a coffee and reach checkout", async ({ page }) => {
  const consoleErrors: string[] = []; page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("net::ERR_CONNECTION_RESET")) consoleErrors.push(message.text()); }); page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/boutique");
  await expect(page.getByRole("heading", { name: "La boutique café" })).toBeVisible();
  await page.locator(".product-card h3 a").first().click();
  await expect(page).toHaveURL(/\/boutique\/[^/]+$/);
  await page.locator(".purchase-panel").getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByRole("button", { name: /Panier \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Supprimer/ })).toBeVisible();
  await drawer.getByRole("link", { name: "Passer la commande" }).click();
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
  await expect(page.locator(".rate-option").getByText("FedEx", { exact: true })).toBeVisible();
  await expect(page.locator(".rate-option").getByText("Mondial Relay", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Payer en toute sécurité" }).click();
  await expect(page.getByRole("heading", { name: "Merci." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Panier \(0\)/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("cart drawer removes an item without leaving the current page", async ({ page }) => {
  await page.goto("/boutique");
  await page.locator(".product-card h3 a").first().click();
  await expect(page).toHaveURL(/\/boutique\/[^/]+$/);
  await page.locator(".purchase-panel").getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByRole("button", { name: /Panier \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await drawer.getByRole("button", { name: /Supprimer/ }).click();
  await expect(drawer.getByText("Votre panier attend un bon café.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Panier (0)" })).toBeVisible();
});

test("English URLs, language switch and professional form are accessible", async ({ page }) => {
  const consoleErrors: string[] = []; page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("net::ERR_CONNECTION_RESET")) consoleErrors.push(message.text()); }); page.on("pageerror", (error) => consoleErrors.push(error.message));
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
  await expect(page).toHaveURL(/\/boutique\/[^/]+$/);
  await page.locator(".purchase-panel").getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByRole("button", { name: /Panier \(1\)/ }).click();
  await page.getByRole("dialog", { name: "Votre panier" }).getByRole("link", { name: "Passer la commande" }).click();
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
