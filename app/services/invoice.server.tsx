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

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const textColor = rgb(37 / 255, 48 / 255, 33 / 255);
const mutedColor = rgb(107 / 255, 113 / 255, 101 / 255);
const ruleColor = rgb(216 / 255, 216 / 255, 211 / 255);

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

function drawTableHeader(page: PDFPage, font: PDFFont, english: boolean, y: number) {
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: ruleColor });
  page.drawText(english ? "Description" : "Description", { x: margin, y: y - 14, size: 10, font, color: textColor });
  const amount = english ? "Amount" : "Montant";
  page.drawText(amount, { x: pageWidth - margin - font.widthOfTextAtSize(amount, 10), y: y - 14, size: 10, font, color: textColor });
  page.drawLine({ start: { x: margin, y: y - 21 }, end: { x: pageWidth - margin, y: y - 21 }, thickness: 1, color: ruleColor });
  return y - 21;
}

function drawTableRow(page: PDFPage, font: PDFFont, boldFont: PDFFont, description: string, amount: string, y: number, bold = false) {
  const rowFont = bold ? boldFont : font;
  const size = bold ? 11 : 10;
  const safeAmount = safePdfText(rowFont, amount);
  page.drawText(fitPdfText(rowFont, description, size, 390), { x: margin, y: y - 15, size, font: rowFont, color: textColor });
  page.drawText(safeAmount, { x: pageWidth - margin - rowFont.widthOfTextAtSize(safeAmount, size), y: y - 15, size, font: rowFont, color: textColor });
  page.drawLine({ start: { x: margin, y: y - 22 }, end: { x: pageWidth - margin, y: y - 22 }, thickness: 1, color: ruleColor });
  return y - 22;
}

export async function renderInvoicePdf(input: { invoice: InvoiceSnapshot; order: OrderSnapshot; lines: OrderLineSnapshot[] }) {
  const { invoice, order, lines } = input;
  const english = order.locale === "en-GB";
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([pageWidth, pageHeight]);

  page.drawText("ZEN COFFEE LAB", { x: margin, y: pageHeight - 58, size: 24, font: boldFont, color: textColor });
  page.drawText(english ? "Micro-roastery - Tours, France" : "Micro-torrefacteur - Tours, France", { x: margin, y: pageHeight - 76, size: 9, font, color: mutedColor });
  const title = english ? "INVOICE" : "FACTURE";
  page.drawText(title, { x: pageWidth - margin - boldFont.widthOfTextAtSize(title, 18), y: pageHeight - 58, size: 18, font: boldFont, color: textColor });
  const invoiceNumber = safePdfText(font, invoice.invoice_number);
  page.drawText(invoiceNumber, { x: pageWidth - margin - font.widthOfTextAtSize(invoiceNumber, 10), y: pageHeight - 76, size: 10, font, color: textColor });
  const date = new Date(invoice.issued_at).toLocaleDateString(english ? "en-GB" : "fr-FR");
  page.drawText(date, { x: pageWidth - margin - font.widthOfTextAtSize(date, 10), y: pageHeight - 91, size: 10, font, color: textColor });

  const address = order.shipping_address ?? {};
  const addressLines = [
    `${address.firstName ?? ""} ${address.lastName ?? ""}`.trim(),
    address.company,
    address.line1,
    `${address.postalCode ?? ""} ${address.city ?? ""} - ${address.countryCode ?? ""}`.trim(),
    address.pickupPoint ? (english ? "Pickup point" : "Point relais") : null,
    address.pickupPoint?.name,
    address.pickupPoint ? `${address.pickupPoint.address1 ?? ""} - ${address.pickupPoint.postalCode ?? ""} ${address.pickupPoint.city ?? ""}`.trim() : null,
    address.pickupPoint?.id ? `ID ${address.pickupPoint.id}` : null,
    order.email,
  ].filter((line): line is string => Boolean(line));
  let y = pageHeight - 132;
  for (const line of addressLines) {
    page.drawText(fitPdfText(font, line, 10, pageWidth - 2 * margin), { x: margin, y, size: 10, font, color: textColor });
    y -= 14;
  }
  y -= 18;
  y = drawTableHeader(page, font, english, y);

  for (const line of lines) {
    if (y < 105) {
      page = document.addPage([pageWidth, pageHeight]);
      y = drawTableHeader(page, font, english, pageHeight - margin);
    }
    y = drawTableRow(page, font, boldFont, `${line.quantity} x ${line.product_name} - ${line.variant_label}`, euros(line.line_total_cents, order.locale), y);
  }
  y = drawTableRow(page, font, boldFont, english ? "Shipping" : "Livraison", euros(order.shipping_charged_cents, order.locale), y);
  y = drawTableRow(page, font, boldFont, "Total EUR", euros(order.total_cents, order.locale), y, true);
  page.drawText(english ? "VAT not applicable under Article 293 B of the French Tax Code." : "TVA non applicable, art. 293 B du CGI.", { x: margin, y: y - 18, size: 9, font, color: mutedColor });

  for (const currentPage of document.getPages()) {
    currentPage.drawText(fitPdfText(font, `Zen Coffee Lab - Tours - contact@zencoffeelab.com - ${order.order_number}`, 8, pageWidth - 2 * margin), { x: margin, y: 36, size: 8, font, color: mutedColor });
  }
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
