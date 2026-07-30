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

test("global brand surfaces and language flags use the updated artwork", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".announcement")).toHaveCSS("background-color", "rgb(86, 99, 79)");
  await expect(page.locator('.language-selector__trigger [data-language-flag="fr-FR"] svg')).toBeVisible();
  await expect(page.locator(".site-footer")).toHaveCSS("background-color", "rgb(86, 99, 79)");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg?v=3");
});

test("home hero is vertical, centered and uses a full-width 70vh image without a media title", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".hero");
  const copy = hero.locator(".hero__copy");
  const media = hero.locator(".hero__media");
  const viewport = page.viewportSize();

  await expect(copy).toHaveCSS("text-align", "center");
  await expect(copy).toHaveCSS("align-items", "center");
  await expect(copy.getByText(/Des cafés traçables/)).toHaveCount(0);
  await expect(hero.locator(".hero__media-title")).toHaveCount(0);
  await expect(media.locator("img")).toHaveAttribute("src", "/media/home-hero-coffee-cherries.jpg");
  await expect(hero.locator(".hero__stamp")).toHaveCount(0);

  const mediaBox = await media.boundingBox();
  expect(mediaBox).not.toBeNull();
  expect(mediaBox!.width).toBeCloseTo(viewport!.width, 0);
  expect(mediaBox!.height).toBeCloseTo(viewport!.height * 0.7, 0);
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

test("shop cards reveal quick add over the image and place prices below plain tasting notes", async ({
  page,
}) => {
  await page.goto("/boutique");
  const card = page.locator(".product-card").first();
  const image = card.locator(".product-card__image");
  const imageActions = card.locator(".product-card__image-actions");
  const notes = card.locator(".taste-list");
  const price = card.locator(".product-card__price");

  await expect(card.getByRole("link", { name: "Voir plus" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Ajouter au panier", exact: true })).toBeAttached();
  const imageBox = await image.boundingBox();
  const actionBox = await imageActions.boundingBox();
  expect(imageBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThan(imageBox!.y);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(imageBox!.y + imageBox!.height);

  if ((page.viewportSize()?.width ?? 0) > 700) {
    await expect(imageActions).toHaveCSS("opacity", "0");
    await card.hover();
    await expect(imageActions).toHaveCSS("opacity", "1");
  } else {
    await expect(imageActions).toHaveCSS("opacity", "1");
  }

  await expect(notes.locator("li").first()).toHaveCSS("border-top-width", "0px");
  if (await notes.locator("li").count() > 1) {
    expect(await notes.locator("li").nth(1).evaluate((note) => getComputedStyle(note, "::before").content)).toBe('"—"');
  }
  expect((await price.boundingBox())!.y).toBeGreaterThan((await notes.boundingBox())!.y);
});

test("product page shows compact origins, prominent notes and alternating editorial blocks", async ({
  page,
}) => {
  await page.goto("/boutique/kenya-kaiguri-ab");
  const detail = page.locator(".product-detail");
  await expect(detail.locator(".product-info__description")).toHaveCSS("font-size", "16.8px");
  const origin = page.locator(".origin-grid");
  const tastingNotes = page.locator(".product-tasting-notes");
  const story = page.locator(".product-story");
  await expect(detail.locator(".stock-note")).toHaveCount(0);
  await expect(detail.getByText(/unités disponibles/)).toHaveCount(0);
  await expect(detail.locator(".product-info").locator(".origin-grid")).toHaveCount(1);
  await expect(origin.locator("div")).toHaveCount(5);
  await expect(tastingNotes.getByRole("heading", { name: "Notes de dégustation" })).toBeVisible();
  expect(await tastingNotes.locator("li").count()).toBeGreaterThan(0);
  await expect(page.getByText("De la graine à la tasse")).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) > 980) {
    const viewportWidth = page.viewportSize()?.width ?? 0;
    expect((await detail.boundingBox())!.width).toBeCloseTo(Math.min(viewportWidth - 32, 1320), 0);
  }
  await expect(story.locator(".product-story-block")).toHaveCount(2);
  await expect(story.locator(".product-story-block").nth(1)).toHaveClass(
    /product-story-block--image-first/,
  );
  await expect(story.getByRole("heading")).toHaveCount(2);
  const firstBlock = story.locator(".product-story-block").first();
  const firstCopy = firstBlock.locator(".product-story-block__copy");
  const firstMedia = firstBlock.locator(".product-story-block__media");
  const firstImage = firstMedia.locator("img");
  await expect(firstCopy).toHaveCSS("overflow-y", "visible");
  await expect(firstImage).toHaveAttribute("width", "750");
  await expect(firstImage).toHaveAttribute("height", "830");
  expect(await firstMedia.evaluate((media) => {
    const image = media.querySelector("img");
    if (!image) return false;
    const style = getComputedStyle(media);
    const expectedWidth = media.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const expectedHeight = media.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const imageBox = image.getBoundingClientRect();
    return Math.abs(imageBox.width - expectedWidth) < 1 && Math.abs(imageBox.height - expectedHeight) < 1;
  })).toBe(true);
  if ((page.viewportSize()?.width ?? 0) > 980) {
    const copyHeight = (await firstCopy.boundingBox())?.height ?? 0;
    const mediaHeight = (await firstMedia.boundingBox())?.height ?? 0;
    expect(Math.abs(copyHeight - mediaHeight)).toBeLessThan(1);
  }
  expect((await origin.boundingBox())!.y).toBeLessThan(
    (await tastingNotes.boundingBox())!.y,
  );
  expect((await tastingNotes.boundingBox())!.y).toBeLessThan(
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
