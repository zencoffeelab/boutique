import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { authUserAlreadyExists, generateProfessionalAccessLink, professionalDecisionFeedback, ProfessionalAccessError } from "~/services/professional-access.server";

function clientWith(generateLink: ReturnType<typeof vi.fn>) {
  return { auth: { admin: { generateLink } } } as unknown as SupabaseClient;
}

function generated(userId: string, token: string) {
  return { data: { user: { id: userId }, properties: { hashed_token: token } }, error: null };
}

describe("professional account activation", () => {
  it("creates an invitation link for a new approved professional", async () => {
    const generateLink = vi.fn().mockResolvedValue(generated("user-new", "invite-token"));
    const result = await generateProfessionalAccessLink(clientWith(generateLink), { email: "pro@example.com", locale: "fr-FR", siteUrl: "https://coffee.example" });
    const url = new URL(result.url);

    expect(result).toMatchObject({ userId: "user-new", type: "invite", existingUser: false, requiresPasswordSetup: true });
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("type")).toBe("invite");
    expect(url.searchParams.get("next")).toBe("/activation/mot-de-passe?activation=1&next=%2Fprofessionnel");
  });

  it("sends an existing customer to the shared account login", async () => {
    const generateLink = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "user_already_exists", message: "User already registered" } })
      .mockResolvedValueOnce(generated("user-existing", "recovery-token"));
    const result = await generateProfessionalAccessLink(clientWith(generateLink), { email: "client@example.com", locale: "en-GB", siteUrl: "https://coffee.example/" });

    expect(result).toMatchObject({ userId: "user-existing", type: "recovery", existingUser: true, requiresPasswordSetup: false });
    expect(generateLink).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: "recovery", email: "client@example.com" }));
    expect(new URL(result.url).pathname).toBe("/en/my-account");
    expect(new URL(result.url).searchParams.get("next")).toBe("/en/professional");
  });

  it("keeps the mandatory password screen when an invitation is regenerated before activation", async () => {
    const generateLink = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "user_already_exists", message: "User already registered" } })
      .mockResolvedValueOnce(generated("user-pending", "recovery-token"));
    const result = await generateProfessionalAccessLink(clientWith(generateLink), { email: "pending@example.com", locale: "fr-FR", siteUrl: "https://coffee.example", forcePasswordSetup: true });
    expect(result.requiresPasswordSetup).toBe(true);
    expect(new URL(result.url).pathname).toBe("/auth/confirm");
    expect(new URL(result.url).searchParams.get("next")).toBe("/activation/mot-de-passe?activation=1&next=%2Fprofessionnel");
  });

  it("does not hide unrelated Supabase errors", async () => {
    const generateLink = vi.fn().mockResolvedValue({ data: null, error: { code: "request_timeout", message: "Timed out" } });
    await expect(generateProfessionalAccessLink(clientWith(generateLink), { email: "pro@example.com", locale: "fr-FR", siteUrl: "https://coffee.example" })).rejects.toEqual(expect.objectContaining<Partial<ProfessionalAccessError>>({ message: "Timed out", status: 502 }));
  });

  it("recognizes current Supabase duplicate-user error codes", () => {
    expect(authUserAlreadyExists({ code: "email_exists" })).toBe(true);
    expect(authUserAlreadyExists({ code: "user_already_exists" })).toBe(true);
    expect(authUserAlreadyExists({ code: "validation_failed", message: "Invalid email" })).toBe(false);
  });

  it("returns the activation link to the admin when automatic email is unavailable", () => {
    expect(professionalDecisionFeedback({
      approved: true,
      email: "pro@example.com",
      emailConfigured: false,
      emailQueued: true,
      activationUrl: "https://coffee.example/auth/confirm?token=secret",
    })).toEqual({
      message: expect.stringContaining("transmettez le lien"),
      activationUrl: "https://coffee.example/auth/confirm?token=secret",
    });
  });

  it("only reports an email in progress when delivery is configured and queued", () => {
    const feedback = professionalDecisionFeedback({ approved: true, email: "pro@example.com", emailConfigured: true, emailQueued: true });
    expect(feedback.message).toContain("en cours d’envoi");
    expect(feedback.activationUrl).toBeUndefined();
  });
});
