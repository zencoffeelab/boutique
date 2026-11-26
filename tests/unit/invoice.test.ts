import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";
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

  it("keeps the header and total labels within their intended columns", async () => {
    const bytes = await renderInvoicePdf({
      invoice: { invoice_number: "ZCL-F-2026-000011", issued_at: "2026-11-26T12:00:00.000Z" },
      order: {
        email: "client@example.com", locale: "fr-FR", order_number: "ZCL-2026-000011",
        shipping_address: { firstName: "Camille", lastName: "Martin", line1: "1 rue du Café", postalCode: "37000", city: "Tours", countryCode: "FR" },
        shipping_charged_cents: 490, total_cents: 2_390,
      },
      lines: [{ id: "line-1", quantity: 1, product_name: "Café Colombie", variant_label: "200 g", line_total_cents: 1_900 }],
    });
    const document = await PDFDocument.load(bytes);
    const page = document.getPages()[0];
    if (!page) throw new Error("Generated invoice has no page");
    const contents = page.node.lookup(PDFName.of("Contents")) as unknown as {
      asArray: () => unknown[];
    };
    const streamReference = contents.asArray()[0];
    if (!streamReference) throw new Error("Generated invoice has no content stream");
    const stream = document.context.lookup(streamReference as never) as unknown as {
      contents: Uint8Array;
    };
    const commands = inflateSync(stream.contents).toString();

    expect(commands).toContain("<5A454E> Tj");
    expect(commands).toContain("<536F75732D746F74616C> Tj");
    expect(commands).toContain("<546F74616C> Tj");
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
