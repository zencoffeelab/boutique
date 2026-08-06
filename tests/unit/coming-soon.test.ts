import { describe, expect, it } from "vitest";
import {
  comingSoonCopy,
  defaultComingSoonSettings,
  isComingSoonExemptPath,
  parseComingSoonSettings,
  shouldShowComingSoon,
} from "~/lib/coming-soon";

describe("coming soon settings", () => {
  it("uses safe bilingual defaults for an invalid stored value", () => {
    const settings = parseComingSoonSettings(null);

    expect(settings).toEqual(defaultComingSoonSettings);
    expect(settings).not.toBe(defaultComingSoonSettings);
  });

  it("normalizes the stored texts and exposes the requested language", () => {
    const settings = parseComingSoonSettings({
      active: true,
      translations: {
        "fr-FR": { title: "  Bientôt  ", message: "  Quelques jours encore.  " },
        "en-GB": { title: "  Coming soon  ", message: "  Just a few more days.  " },
      },
    });

    expect(comingSoonCopy(settings, "fr-FR")).toEqual({
      active: true,
      title: "Bientôt",
      message: "Quelques jours encore.",
    });
    expect(comingSoonCopy(settings, "en-GB").title).toBe("Coming soon");
  });

  it("keeps administration and mandatory password setup reachable", () => {
    expect(isComingSoonExemptPath("/admin/contenus")).toBe(true);
    expect(isComingSoonExemptPath("/mon-compte")).toBe(true);
    expect(isComingSoonExemptPath("/en/my-account")).toBe(true);
    expect(isComingSoonExemptPath("/activation/mot-de-passe")).toBe(true);
    expect(isComingSoonExemptPath("/en/activate/password")).toBe(true);
    expect(isComingSoonExemptPath("/boutique")).toBe(false);
  });

  it("keeps the public site available to authenticated administrators", () => {
    expect(shouldShowComingSoon(true, "/boutique", true)).toBe(false);
    expect(shouldShowComingSoon(true, "/boutique", false)).toBe(true);
  });
});
