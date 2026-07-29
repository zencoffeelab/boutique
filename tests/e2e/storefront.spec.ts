import { expect, test } from "@playwright/test";

test("public header stays visible while scrolling", async ({ page }) => {
  await page.goto("/");
  const header = page.locator(".site-header");
  await expect(header).toHaveCSS("position", "sticky");
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect
    .poll(async () => Math.round((await header.boundingBox())?.y ?? -1))
    .toBe(0);
});

test("public header identifies a signed-out visitor", async ({ page }) => {
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 0) <= 700) {
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".mobile-account-link")).toHaveAccessibleName(
      "Connexion",
    );
    await expect(
      page.locator(".mobile-account-link"),
    ).toHaveAttribute("href", "/mon-compte");
  } else {
    await expect(page.locator(".account-button")).toHaveAccessibleName(
      "Connexion",
    );
    await expect(page.locator(".account-button")).toHaveAttribute(
      "href",
      "/mon-compte",
    );
  }
});

test("a coffee can be added to the cart directly from the shop", async ({
  page,
}) => {
  await page.goto("/boutique");
  const firstProduct = page.locator(".product-card").first();
  await firstProduct
    .getByRole("button", { name: "Ajouter au panier", exact: true })
    .click();
  const firstFormat = firstProduct.getByRole("menuitem").first();
  await expect(firstFormat).toBeVisible();
  await firstFormat.click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".cart-drawer-line")).toHaveCount(1);
  await expect(page).toHaveURL(/\/boutique$/);
  await expect(page.getByRole("button", { name: "Panier (1)" })).toBeVisible();
});

test("product page shows the two alternating editorial blocks below origin details", async ({
  page,
}) => {
  await page.goto("/boutique/kenya-kaiguri-ab");
  const origin = page.locator(".origin-grid");
  const story = page.locator(".product-story");
  await expect(story.locator(".product-story-block")).toHaveCount(2);
  await expect(story.locator(".product-story-block").nth(1)).toHaveClass(
    /product-story-block--image-first/,
  );
  await expect(story.getByRole("heading")).toHaveCount(2);
  expect((await origin.boundingBox())!.y).toBeLessThan(
    (await story.boundingBox())!.y,
  );
});

test("product page recommends three similar coffees above the footer", async ({
  page,
}) => {
  await page.goto("/boutique/ethiopie-aricha-station");
  const relatedProducts = page.locator(".related-products");
  await expect(
    relatedProducts.getByRole("heading", { name: "Vous aimerez aussi" }),
  ).toBeVisible();
  await expect(relatedProducts.locator(".product-card")).toHaveCount(3);
  await expect(
    relatedProducts.getByRole("link", { name: /Tous les cafés/ }),
  ).toHaveAttribute("href", "/boutique");
});

test("French guest can add a coffee and reach checkout", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("net::ERR_CONNECTION_RESET")
    )
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/boutique");
  await expect(
    page.getByRole("heading", { name: "La boutique café" }),
  ).toBeVisible();
  await page.locator(".product-card__link").first().click();
  await expect(page).toHaveURL(/\/boutique\/[^/]+$/);
  await page
    .locator(".purchase-panel")
    .getByRole("button", { name: /Ajouter au panier/ })
    .click();
  await page.getByRole("button", { name: /Panier \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Supprimer/ })).toBeVisible();
  await drawer.getByRole("link", { name: "Passer la commande" }).click();
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Livraison & paiement" }),
  ).toBeVisible();
  await page.getByLabel("Prénom").fill("Ada");
  await page.getByLabel("Nom", { exact: true }).fill("Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Téléphone").fill("0600000000");
  await page.getByLabel("Adresse", { exact: true }).fill("1 rue du Café");
  await page.getByLabel("Code postal").fill("37000");
  await page.getByLabel("Ville").fill("Tours");
  const accountChoice = page.getByRole("checkbox", { name: /Créer mon compte client/ });
  await expect(accountChoice).toBeVisible();
  await accountChoice.check();
  await expect(page.getByLabel("Choisissez un mot de passe")).toBeVisible();
  await accountChoice.uncheck();
  const quoteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/shipping/quote") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Calculer la livraison" }).click();
  await expect((await quoteResponse).status()).toBe(200);
  await expect(
    page.locator(".rate-option").getByText("FedEx", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".rate-option").getByText("Mondial Relay", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Payer en toute sécurité" }).click();
  await expect(page.getByRole("heading", { name: "Merci." })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Panier \(0\)/ }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("cart drawer removes an item without leaving the current page", async ({
  page,
}) => {
  await page.goto("/boutique");
  await page.locator(".product-card__link").first().click();
  await expect(page).toHaveURL(/\/boutique\/[^/]+$/);
  await page
    .locator(".purchase-panel")
    .getByRole("button", { name: /Ajouter au panier/ })
    .click();
  await page.getByRole("button", { name: /Panier \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await drawer.getByRole("button", { name: /Supprimer/ }).click();
  await expect(
    drawer.getByText("Votre panier attend un bon café."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Panier (0)" })).toBeVisible();
});

test("contact page provides a complete contact form", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "Écrivez-nous" })).toBeVisible();
  await expect(page.getByLabel("Nom *")).toBeVisible();
  await expect(page.getByLabel("Email *")).toBeVisible();
  await expect(page.getByLabel("Sujet *")).toBeVisible();
  await expect(page.getByLabel("Votre message *")).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer mon message" })).toBeVisible();
  await expect(page.getByRole("link", { name: "contact@zencoffeelab.com" })).toBeVisible();
});

test("English URLs, language switch and professional form are accessible", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("net::ERR_CONNECTION_RESET")
    )
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/en");
  await expect(
    page.getByRole("heading", { name: /Coffee with clarity/ }),
  ).toBeVisible();
  await page.goto("/en/professional");
  await expect(
    page.locator("#main-content").getByRole("link", { name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByText("Approved professionals")).toHaveCount(0);
  await expect(
    page.locator(
      ".professional-application-layout > .professional-application-steps",
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      ".professional-application-layout > form.professional-application-form",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Company name")).toBeVisible();
  await page
    .getByRole("button", { name: "Active language: English" })
    .click();
  await page.getByRole("menuitem", { name: "Français (FR)" }).click();
  await expect(page).toHaveURL(/\/professionnel$/);
  expect(consoleErrors).toEqual([]);
});

test("Zone 2 checkout offers Mondial Relay only after pickup-point selection", async ({
  page,
}) => {
  await page.goto("/boutique");
  await page.locator(".product-card__link").first().click();
  await expect(page).toHaveURL(/\/boutique\/[^/]+$/);
  await page
    .locator(".purchase-panel")
    .getByRole("button", { name: /Ajouter au panier/ })
    .click();
  await page.getByRole("button", { name: /Panier \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Votre panier" });
  await drawer.getByRole("link", { name: "Passer la commande" }).click();
  await expect(drawer).toBeHidden();
  await page.getByLabel("Prénom").fill("Ada");
  await page.getByLabel("Nom", { exact: true }).fill("Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Téléphone").fill("0600000000");
  await page.getByLabel("Adresse", { exact: true }).fill("1 Hauptstrasse");
  await page.getByLabel("Code postal").fill("10115");
  await page.getByLabel("Ville").fill("Berlin");
  await page.getByLabel("Pays").selectOption("DE");
  await expect(
    page.getByRole("heading", { name: /Préférence de livraison/ }),
  ).toBeVisible();
  await page.getByLabel("Point relais").check();
  await page
    .getByRole("button", { name: "Rechercher les points relais" })
    .click();
  await page.locator(".pickup-option input").first().check();
  await page.getByRole("button", { name: "Calculer la livraison" }).click();
  await expect(page.locator(".rate-option__details > strong")).toHaveText(
    "Mondial Relay",
  );
});
