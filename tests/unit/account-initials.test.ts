import { describe, expect, it } from "vitest";
import { accountInitials } from "~/lib/auth.server";

describe("account initials", () => {
  it("uses the first and last names when available", () => {
    expect(accountInitials("Jeanne", "Dupont", "jeanne@example.com")).toBe("JD");
  });

  it("falls back to the beginning of the email", () => {
    expect(accountInitials(null, null, "ugo@example.com")).toBe("UG");
  });
});
