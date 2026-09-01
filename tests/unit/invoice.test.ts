import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateInvoicePdfSafely, invoiceReferenceLabels, invoiceUsesEnglish, renderInvoicePdf } from "~/services/invoice.server";

describe("invoice PDF", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generates a readable PDF without the WebAssembly layout engine", async () => {
    const bytes = await renderInvoicePdf({
      invoice: { invoice_number: "ZCL-F-2026-000001", issued_at: "2026-08-07T21:23:29.000Z" },
      order: {
        email: "client@example.com",
        locale: "fr-FR",
        order_number: "ZCL-2026-001023",
        shipping_address: { firstName: "Élodie", lastName: "Martin", line1: "1 rue du Café", postalCode: "37000", city: "Tours", countryCode: "FR" },
        shipping_charged_cents: 490,
        total_cents: 2_390,
      },
      lines: [{ id: "line-1", quantity: 1, product_name: "Café Éthiopie", variant_label: "200 g", line_total_cents: 1_900 }],
    });

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("labels the matching invoice and order references explicitly", () => {
    expect(invoiceReferenceLabels({ invoiceNumber: "ZCL-F-202608-000001", orderNumber: "ZCL-202608-000001", english: false })).toEqual({
      invoiceNumber: "ZCL-F-202608-000001",
      orderNumber: "Commande ZCL-202608-000001",
    });
  });

  it("uses English for invoices delivered outside France", () => {
    expect(invoiceUsesEnglish("FR")).toBe(false);
    expect(invoiceUsesEnglish("GB")).toBe(true);
    expect(invoiceUsesEnglish(undefined)).toBe(false);
  });

  it("does not block the payment webhook when invoice generation fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await generateInvoicePdfSafely("order-1", async () => { throw new Error("PDF unavailable"); });

    expect(result).toBeNull();
    expect(errorLog).toHaveBeenCalledWith("order_invoice_generation_failed", { orderId: "order-1", message: "PDF unavailable" });
  });
});
