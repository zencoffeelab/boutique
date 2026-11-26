import { describe, expect, it } from "vitest";
import { authConfirmationErrorMessage, isAlreadyProcessedConfirmationLink } from "~/routes/auth-confirm";

describe("authConfirmationErrorMessage", () => {
  it("replaces the PKCE implementation detail with recovery guidance", () => {
    expect(authConfirmationErrorMessage(new Error("PKCE code verifier not found in storage."), "/mon-compte")).toContain("même navigateur");
  });

  it("keeps unrelated authentication errors available to the customer", () => {
    expect(authConfirmationErrorMessage(new Error("Confirmation link has expired."), "/en/my-account")).toBe("Confirmation link has expired.");
  });

  it("turns an already processed email link into a confirmation message", () => {
    expect(isAlreadyProcessedConfirmationLink("Email link is invalid or has expired")).toBe(true);
    expect(authConfirmationErrorMessage("Email link is invalid or has expired", "/mon-compte")).toContain("compte est activé");
  });
});
