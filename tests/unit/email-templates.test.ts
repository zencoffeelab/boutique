import { describe, expect, it } from "vitest";
import {
  contactAdminAlertEmail,
  contactMessageReceivedEmail,
  orderConfirmationEmail,
  professionalApplicationReceivedEmail,
  professionalDecisionEmail,
  professionalQuoteEmail,
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

  it("uses the permanent account login wording for an existing customer", () => {
    const email = professionalDecisionEmail({ locale: "fr-FR", approved: true, activationUrl: "https://coffee.example/mon-compte", accessLabel: "Connexion", temporaryAccessLink: false });
    expect(email.html).toContain("Connexion");
    expect(email.html).not.toContain("lien sécurisé est temporaire");
  });

  it("renders escaped contact notifications and a bilingual confirmation", () => {
    const admin = contactAdminAlertEmail({ name: "Ada <script>", email: "ada@example.com", subject: "Un café", message: "Bonjour\n<script>alert(1)</script>" });
    expect(admin.subject).toContain("Un café");
    expect(admin.html).toContain("Bonjour<br>&lt;script&gt;");
    expect(admin.html).not.toContain("<script>alert(1)</script>");
    expect(contactMessageReceivedEmail({ locale: "en-GB", name: "Ada", subject: "A coffee" }).html).toContain("Thank you Ada");
  });

  it("includes the quote amount, PDF notice and secure payment link", () => {
    const email = professionalQuoteEmail({ locale: "fr-FR", quoteNumber: "ZCL-D-2026-001001", totalCents: 45_000, validUntil: "2026-08-26T10:00:00.000Z", paymentUrl: "https://zencoffeelab.com/devis/quote-id/paiement" });
    expect(email.subject).toContain("ZCL-D-2026-001001");
    expect(email.html).toContain("450,00");
    expect(email.html).toContain("PDF est joint");
    expect(email.html).toContain("https://zencoffeelab.com/devis/quote-id/paiement");
    expect(email.html).toContain("virement bancaire SEPA");
  });
});
