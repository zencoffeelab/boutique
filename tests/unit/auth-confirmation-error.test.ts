import { describe, expect, it } from "vitest";
import { authConfirmationErrorMessage } from "~/routes/auth-confirm";

describe("authConfirmationErrorMessage", () => {
  it("replaces the PKCE implementation detail with recovery guidance", () => {
    expect(authConfirmationErrorMessage(new Error("PKCE code verifier not found in storage."), "/mon-compte")).toContain("même navigateur");
  });

  it("keeps unrelated authentication errors available to the customer", () => {
    expect(authConfirmationErrorMessage(new Error("Confirmation link has expired."), "/en/my-account")).toBe("Confirmation link has expired.");
  });
});
