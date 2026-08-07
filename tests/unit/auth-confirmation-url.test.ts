import { describe, expect, it } from "vitest";
import { authConfirmationUrl } from "~/lib/supabase.server";

describe("authConfirmationUrl", () => {
  it("uses the configured public origin and safely preserves the destination", () => {
    process.env.VITE_SITE_URL = "https://www.zencoffeelab.com";
    expect(authConfirmationUrl(new Request("https://preview.zencoffeelab.com/mon-compte"), "/mon-compte?set-password=1&next=%2Fcommande")).toBe(
      "https://www.zencoffeelab.com/auth/confirm?next=%2Fmon-compte%3Fset-password%3D1%26next%3D%252Fcommande",
    );
  });

  it("uses the request origin when no public site URL is configured", () => {
    delete process.env.VITE_SITE_URL;
    expect(authConfirmationUrl(new Request("https://www.zencoffeelab.com/mon-compte"), "/mon-compte")).toBe(
      "https://www.zencoffeelab.com/auth/confirm?next=%2Fmon-compte",
    );
  });
});
