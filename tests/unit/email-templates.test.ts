import { describe, expect, it } from "vitest";
import {
  orderConfirmationEmail,
  professionalApplicationReceivedEmail,
  refundEmail,
  trackingEmail,
} from "~/services/email-templates.server";

describe("transactional email templates", () => {
  it("renders a complete French order confirmation and escapes customer data", () => {
    const email = orderConfirmationEmail({
      order_number: "ZCL-2026-000123",
      locale: "fr-FR",
      shipping_address: { line1: "1 rue du Café <script>", postalCode: "37000", city: "Tours" },
      shipping_carrier: "FedEx",
      shipping_service: "Priority",
      subtotal_cents: 1_300,
      shipping_charged_cents: 950,
      total_cents: 2_250,
      order_lines: [{ product_name: "Éthiopie — Aricha", variant_label: "200 g", quantity: 1, line_total_cents: 1_300 }],
    });

    expect(email.subject).toContain("Commande confirmée");
    expect(email.html).toContain("Éthiopie — Aricha");
    expect(email.html).toContain("22,50");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });

  it("provides bilingual tracking, refund and professional confirmations", () => {
    expect(trackingEmail({ locale: "en-GB", orderNumber: "ZCL-1", delivered: false, trackingUrl: "https://tracking.example/1" }).html).toContain("Track my parcel");
    expect(refundEmail({ locale: "fr-FR", orderNumber: "ZCL-1", amountCents: 1_000, fullyRefunded: false }).subject).toContain("remboursement partiel");
    expect(professionalApplicationReceivedEmail({ locale: "en-GB", firstName: "Ada" }).html).toContain("Thank you Ada");
  });
});
