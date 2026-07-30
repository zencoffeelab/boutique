import { describe, expect, it } from "vitest";
import { defaultSiteNavigation, parseSiteNavigationConfiguration } from "~/lib/site-navigation";

describe("site navigation configuration", () => {
  it("falls back to the current site navigation when no configuration exists", () => {
    expect(parseSiteNavigationConfiguration(null)).toEqual(defaultSiteNavigation);
  });

  it("sanitizes the arrangement while allowing a page in several footer columns", () => {
    const configuration = parseSiteNavigationConfiguration({
      menu: ["contact", "available-products", "shop", "contact", "invalid"],
      footerColumns: [
        { id: "discover", titles: { "fr-FR": "  Découvrir  ", "en-GB": "Discover" }, items: ["shop", "shop", "about"] },
        { id: "help", titles: { "fr-FR": "Aide", "en-GB": "Help" }, items: ["contact"] },
        { id: "coffee", titles: { "fr-FR": "Cafés", "en-GB": "Coffee" }, items: ["shop", "available-products"] },
      ],
    });

    expect(configuration.menu).toEqual(["contact", "shop"]);
    expect(configuration.footerColumns[0]).toMatchObject({ id: "discover", titles: { "fr-FR": "Découvrir", "en-GB": "Discover" }, items: ["shop", "about"] });
    expect(configuration.footerColumns[2].items).toEqual(["shop", "available-products"]);
  });
});
