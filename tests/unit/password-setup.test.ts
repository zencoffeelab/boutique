import { describe, expect, it } from "vitest";
import { isAllowedDuringRequiredPasswordSetup, passwordSetupPath } from "~/lib/password-setup";

describe("required first password gate", () => {
  it("uses a dedicated localized activation page", () => {
    expect(passwordSetupPath("fr-FR")).toBe("/activation/mot-de-passe");
    expect(passwordSetupPath("en-GB")).toBe("/en/activate/password");
  });

  it("blocks storefront and account pages until setup is complete", () => {
    expect(isAllowedDuringRequiredPasswordSetup("/professionnel")).toBe(false);
    expect(isAllowedDuringRequiredPasswordSetup("/mon-compte")).toBe(false);
    expect(isAllowedDuringRequiredPasswordSetup("/commande")).toBe(false);
    expect(isAllowedDuringRequiredPasswordSetup("/activation/mot-de-passe")).toBe(true);
    expect(isAllowedDuringRequiredPasswordSetup("/auth/confirm")).toBe(true);
    expect(isAllowedDuringRequiredPasswordSetup("/media/logo-black.svg")).toBe(true);
  });
});
