import { describe, expect, it } from "vitest";
import { buildProfessionalMembers } from "~/routes/admin-professionals";

const recentApplication = {
  id: "application-new", company_name: "Café Nouveau", first_name: "Ada", last_name: "Lovelace", email: "old@example.com", phone: "0600000000",
  business_type: "Coffee shop", monthly_volume: "11-50 kg", locale: "fr-FR" as const, status: "approved" as const,
  decision_note: null, decided_at: "2026-07-24T12:00:00.000Z", invited_user_id: "user-pro", created_at: "2026-07-23T12:00:00.000Z",
};

describe("professional member administration", () => {
  it("joins the professional profile with authentication and the latest application", () => {
    const members = buildProfessionalMembers(
      [{ id: "user-pro", professional_status: "suspended", first_name: "Ada", last_name: "Lovelace", phone: null, created_at: "2026-07-20T12:00:00.000Z" }],
      [recentApplication, { ...recentApplication, id: "application-old", company_name: "Ancien Café", decided_at: "2026-07-21T12:00:00.000Z" }],
      [{ id: "user-pro", email: "pro@example.com", last_sign_in_at: "2026-07-24T14:00:00.000Z", email_confirmed_at: "2026-07-24T13:00:00.000Z" }],
    );

    expect(members[0]).toMatchObject({ company: "Café Nouveau", email: "pro@example.com", status: "suspended", emailConfirmed: true, lastSignInAt: "2026-07-24T14:00:00.000Z" });
  });
});
