import { describe, expect, it } from "vitest";
import { siteChangelog } from "~/data/site-changelog";

describe("site changelog", () => {
  it("contains the previous site changes in reverse chronological order", () => {
    expect(siteChangelog.length).toBeGreaterThanOrEqual(40);
    expect(siteChangelog.some((entry) => entry.title === "Journal des modifications dans le back-office")).toBe(true);
    expect(siteChangelog.some((entry) => entry.title === "Paiement Stripe sécurisé sur Cloudflare")).toBe(true);
    expect(siteChangelog.some((entry) => entry.title === "Reconstruction de la boutique Zen Coffee Lab")).toBe(true);

    for (let index = 1; index < siteChangelog.length; index += 1) {
      expect(siteChangelog[index].date <= siteChangelog[index - 1].date).toBe(true);
    }
  });

  it("uses a unique identifier for every entry", () => {
    const ids = siteChangelog.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
