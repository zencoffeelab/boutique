import { describe, expect, it } from "vitest";
import { signupConfirmationMessage } from "~/routes/account";

describe("signupConfirmationMessage", () => {
  it("confirms email delivery in both storefront languages", () => {
    expect(signupConfirmationMessage("fr-FR")).toBe("Un mail vous a été envoyé. Veuillez confirmer votre adresse mail.");
    expect(signupConfirmationMessage("en-GB")).toBe("An email has been sent to you. Please confirm your email address.");
  });
});
