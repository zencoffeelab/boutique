import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createServiceSupabase } from "~/lib/supabase.server";

type InvoiceSnapshot = {
  invoice_number: string;
  issued_at: string;
};

type OrderSnapshot = {
  email: string;
  locale: "fr-FR" | "en-GB";
  order_number: string;
  shipping_address: {
    firstName?: string;
    lastName?: string;
    company?: string;
    line1?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
    pickupPoint?: {
      id?: string;
      name?: string;
      address1?: string;
      postalCode?: string;
      city?: string;
    };
  };
  shipping_charged_cents: number;
  total_cents: number;
};

type OrderLineSnapshot = {
  id: string;
  quantity: number;
  product_name: string;
  variant_label: string;
  line_total_cents: number;
};

export function invoiceReferenceLabels(input: { invoiceNumber: string; orderNumber: string; english: boolean }) {
  return {
    invoiceNumber: input.invoiceNumber,
    orderNumber: `${input.english ? "Order" : "Commande"} ${input.orderNumber}`,
  };
}

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const textColor = rgb(52 / 255, 59 / 255, 66 / 255);
const mutedColor = rgb(112 / 255, 118 / 255, 124 / 255);
const ruleColor = rgb(52 / 255, 59 / 255, 66 / 255);

function euros(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

function safePdfText(font: PDFFont, value: unknown) {
  let result = "";
  for (const character of String(value ?? "").normalize("NFC")) {
    try {
      font.encodeText(character);
      result += character;
    } catch {
      result += "?";
    }
  }
  return result;
}

function fitPdfText(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const text = safePdfText(font, value);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const suffix = "...";
  let fitted = text;
  while (fitted && font.widthOfTextAtSize(`${fitted}${suffix}`, size) > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted}${suffix}`;
}

function drawTopText(page: PDFPage, font: PDFFont, value: string, x: number, top: number, size: number, color = textColor, maxWidth = pageWidth) {
  const text = fitPdfText(font, value, size, maxWidth - x - margin);
  page.drawText(text, { x, y: pageHeight - top - size, size, font, color });
}

function drawTopRule(page: PDFPage, top: number, thickness = 1) {
  const y = pageHeight - top;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness, color: ruleColor });
}

function drawRightTopText(page: PDFPage, font: PDFFont, value: string, right: number, top: number, size: number, color = textColor) {
  const text = safePdfText(font, value);
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y: pageHeight - top - size, size, font, color });
}

function drawInvoiceTableHeader(page: PDFPage, font: PDFFont, english: boolean, top: number) {
  const labels = english ? ["Service", "Qty", "Tax", "Price (€)", "Discount", "Total (incl. tax) (€)"] : ["Service", "Quantité", "TVA", "Prix (€)", "Remise", "Total (TTC) (€)"];
  const positions = [margin, 300, 348, 393, 445, 510];
  labels.forEach((label, index) => drawTopText(page, font, label, positions[index], top, 8.5, mutedColor, index === 0 ? 295 : pageWidth));
  drawTopRule(page, top + 24, 4);
}

function drawInvoiceTableRow(page: PDFPage, font: PDFFont, boldFont: PDFFont, values: string[], top: number, final = false) {
  const positions = [margin, 300, 348, 393, 445, 510];
  const widths = [245, 35, 40, 48, 58, 43];
  values.forEach((value, index) => {
    const rowFont = final ? boldFont : font;
    const size = final ? 9 : 8.5;
    const safe = safePdfText(rowFont, value);
    const rightAligned = index > 0;
    const x = rightAligned ? positions[index] + widths[index] - rowFont.widthOfTextAtSize(safe, size) : positions[index];
    page.drawText(fitPdfText(rowFont, value, size, rightAligned ? widths[index] : widths[index] + 30), { x, y: pageHeight - top - size, size, font: rowFont, color: textColor });
  });
  drawTopRule(page, top + 22, final ? 1.2 : 0.7);
}

export async function renderInvoicePdf(input: { invoice: InvoiceSnapshot; order: OrderSnapshot; lines: OrderLineSnapshot[] }) {
  const { invoice, order, lines } = input;
  const english = order.locale === "en-GB";
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([pageWidth, pageHeight]);
  const right = pageWidth - margin;
  const issuedDate = new Date(invoice.issued_at).toLocaleDateString(english ? "en-GB" : "fr-FR");
  const serviceDate = new Date(invoice.issued_at).toLocaleDateString(english ? "en-GB" : "fr-FR");
  const address = order.shipping_address ?? {};
  const buyerLines = [
    `${address.firstName ?? ""} ${address.lastName ?? ""}`.trim(), address.company, address.line1,
    `${address.postalCode ?? ""} ${address.city ?? ""}`.trim(), address.countryCode, order.email,
  ].filter((line): line is string => Boolean(line));
  const subtotalCents = lines.reduce((sum, line) => sum + line.line_total_cents, 0);
  const totalCents = order.total_cents;

  drawTopText(page, boldFont, "ZEN COFFEE LAB", margin + 30, 57, 22, textColor, 260);
  drawTopText(page, font, english ? "COFFEE ROASTERS" : "MICRO-TORRÉFACTEUR", margin + 42, 84, 7.5, mutedColor, 220);
  drawTopRule(page, 40, 4);
  drawTopText(page, boldFont, "Zen Coffee Lab", 390, 51, 8, textColor, right);
  drawTopText(page, font, "Ugo Simon-Meslet", 390, 65, 8.5, textColor, right);
  drawTopText(page, font, "32 rue Louis Blanc", 390, 78, 8.5, mutedColor, right);
  drawTopText(page, font, "37000 Tours", 390, 78, 8.5, mutedColor, right);
  drawTopText(page, font, "France", 390, 91, 8.5, mutedColor, right);
  drawTopText(page, font, "SIRET : 848 867 065 00056", 390, 104, 8.5, mutedColor, right);
  drawTopText(page, font, "contact@zencoffeelab.com · 06 12 69 20 79", 390, 130, 8, mutedColor, right);
  drawTopRule(page, 151, 4);
  drawTopText(page, boldFont, buyerLines[0] ?? order.email, 390, 166, 9, textColor, right);
  buyerLines.slice(1).forEach((line, index) => drawTopText(page, font, line, 390, 180 + index * 13, 8.5, mutedColor, right));

  drawTopRule(page, 254, 4);
  drawTopText(page, boldFont, english ? "INVOICE" : "FACTURE", margin, 267, 18, textColor, 250);
  drawTopText(page, font, invoice.invoice_number, margin, 292, 10, textColor, 250);
  drawTopText(page, boldFont, english ? "PAID" : "PAYÉ", 390, 267, 9, textColor, right);
  drawTopText(page, font, `${english ? "Date" : "Date"} :`, 390, 286, 8.5, mutedColor, right - 74);
  drawRightTopText(page, font, issuedDate, right, 286, 8.5, mutedColor);
  drawTopText(page, font, english ? "Service date :" : "Date de service :", 390, 299, 8.5, mutedColor, right - 74);
  drawRightTopText(page, font, serviceDate, right, 299, 8.5, mutedColor);
  drawTopRule(page, 318, 1.2);

  const tableTop = 370;
  drawInvoiceTableHeader(page, font, english, tableTop);
  let rowTop = tableTop + 33;
  for (const line of lines) {
    if (rowTop > 675) { page = document.addPage([pageWidth, pageHeight]); rowTop = 70; drawInvoiceTableHeader(page, font, english, 45); }
    drawInvoiceTableRow(page, font, boldFont, [
      `${line.product_name} - ${line.variant_label}`,
      String(line.quantity), "0 %", euros(Math.round(line.line_total_cents / Math.max(line.quantity, 1)), order.locale), "0 %", euros(line.line_total_cents, order.locale),
    ], rowTop);
    rowTop += 22;
  }
  drawInvoiceTableRow(page, font, boldFont, [english ? "Shipping" : "Livraison", "1", "0 %", euros(order.shipping_charged_cents, order.locale), "0 %", euros(order.shipping_charged_cents, order.locale)], rowTop);
  rowTop += 22;
  drawTopRule(page, rowTop, 4);

  const summaryTop = Math.max(rowTop + 25, 520);
  const summaryX = 390;
  const drawSummaryLine = (label: string, value: string, top: number, bold = false) => {
    drawTopText(page, bold ? boldFont : font, label, summaryX, top, 8.5, bold ? textColor : mutedColor, right - 82);
    drawRightTopText(page, bold ? boldFont : font, value, right, top, 8.5, bold ? textColor : mutedColor);
  };
  drawTopText(page, font, english ? "VAT not applicable." : "TVA non applicable, art. 293 B du CGI.", margin, summaryTop, 8.5, mutedColor, 350);
  drawTopText(page, font, english ? "Thank you for your order." : "Merci pour votre commande.", margin, summaryTop + 28, 8.5, mutedColor, 350);
  drawSummaryLine(english ? "Discount (€):" : "Remise (€) :", euros(0, order.locale), summaryTop);
  drawSummaryLine(english ? "Subtotal (€):" : "Total (€) :", euros(subtotalCents, order.locale), summaryTop + 18);
  drawSummaryLine(english ? "VAT (€):" : "TVA 0 % (€) :", euros(0, order.locale), summaryTop + 36);
  drawTopRule(page, summaryTop + 56, 4);
  drawSummaryLine(english ? "FINAL TOTAL (€)" : "SOMME FINALE (€)", euros(totalCents, order.locale), summaryTop + 72, true);
  drawTopRule(page, summaryTop + 96, 1.2);
  drawSummaryLine(english ? "Payment method:" : "Mode de paiement :", english ? "Online" : "En ligne", summaryTop + 116);

  drawTopText(page, font, "Zen Coffee Lab", 390, 704, 8.5, mutedColor, right);
  drawTopText(page, font, "Ugo Simon-Meslet", 390, 717, 8.5, mutedColor, right);
  drawTopRule(page, 785, 0.8);
  drawTopText(page, font, "Zen Coffee Lab · Ugo Simon-Meslet · 32 rue Louis Blanc · 37000 Tours · France", margin + 28, 799, 7, mutedColor, right);
  drawTopText(page, font, "SIRET 848 867 065 00056 · contact@zencoffeelab.com · TVA non applicable, art. 293 B du CGI", margin + 28, 811, 7, mutedColor, right);
  return document.save();
}

export async function generateInvoicePdf(orderId: string) {
  const client = createServiceSupabase(); if (!client) return null;
  const [{ data: invoice }, { data: order }, { data: lines }] = await Promise.all([
    client.from("invoices").select("*").eq("order_id", orderId).single(),
    client.from("orders").select("*").eq("id", orderId).single(),
    client.from("order_lines").select("*").eq("order_id", orderId).order("created_at"),
  ]);
  if (!invoice || !order) throw new Error("Invoice snapshot is incomplete.");
  if (invoice.storage_path) return invoice.storage_path;
  const bytes = await renderInvoicePdf({ invoice: invoice as InvoiceSnapshot, order: order as OrderSnapshot, lines: (lines ?? []) as OrderLineSnapshot[] });
  const path = `${new Date(invoice.issued_at).getUTCFullYear()}/${invoice.invoice_number}.pdf`;
  const { error } = await client.storage.from("invoices").upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  await client.from("invoices").update({ storage_path: path }).eq("id", invoice.id);
  return path;
}

export async function generateInvoicePdfSafely(orderId: string, generate: (id: string) => Promise<string | null> = generateInvoicePdf) {
  try {
    return await generate(orderId);
  } catch (cause) {
    console.error("order_invoice_generation_failed", { orderId, message: cause instanceof Error ? cause.message : String(cause) });
    return null;
  }
}

export async function getSignedInvoiceUrl(orderId: string) {
  const client = createServiceSupabase(); if (!client) return null;
  const { data: invoice } = await client.from("invoices").select("storage_path").eq("order_id", orderId).maybeSingle();
  if (!invoice?.storage_path) return null;
  const { data, error } = await client.storage.from("invoices").createSignedUrl(invoice.storage_path, 60);
  if (error) throw error; return data.signedUrl;
}
