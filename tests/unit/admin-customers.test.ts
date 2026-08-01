import { describe, expect, it } from "vitest";
import { buildRetailCustomers } from "~/routes/admin-customers";

describe("retail customer administration", () => {
  it("joins customer accounts with paid orders and keeps the signup source", () => {
    const customers = buildRetailCustomers(
      [{ id: "customer-1", role: "admin", first_name: "Ada", last_name: "Lovelace", phone: "0600000000", created_at: "2026-07-20T10:00:00.000Z" }],
      [{ id: "customer-1", email: "ADA@example.com", created_at: "2026-07-20T10:00:00.000Z", email_confirmed_at: "2026-07-20T10:05:00.000Z", last_sign_in_at: "2026-07-24T14:00:00.000Z", user_metadata: { signup_source: "checkout" } }],
      [
        { id: "order-paid", profile_id: null, email: "ada@example.com", total_cents: 2_500, paid_at: "2026-07-20T11:00:00.000Z", created_at: "2026-07-20T10:30:00.000Z", shipping_address: { city: "Tours", countryCode: "FR" } },
        { id: "order-pending", profile_id: "customer-1", email: "ada@example.com", total_cents: 1_000, paid_at: null, created_at: "2026-07-21T10:30:00.000Z", shipping_address: { city: "Tours", countryCode: "FR" } },
      ],
    );

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ email: "ADA@example.com", role: "admin", signupSource: "Commande", emailConfirmed: true, orderCount: 1, totalSpentCents: 2_500, location: "Tours · FR" });
  });
});
