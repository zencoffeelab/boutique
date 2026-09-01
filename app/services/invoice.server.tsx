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
  product_id?: string;
  quantity: number;
  product_name: string;
  english_product_name?: string;
  variant_label: string;
  line_total_cents: number;
};

export function invoiceReferenceLabels(input: { invoiceNumber: string; orderNumber: string; english: boolean }) {
  return {
    invoiceNumber: input.invoiceNumber,
    orderNumber: `${input.english ? "Order" : "Commande"} ${input.orderNumber}`,
  };
}

export function invoiceUsesEnglish(countryCode?: string) {
  return Boolean(countryCode && countryCode.toUpperCase() !== "FR");
}

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const textColor = rgb(52 / 255, 59 / 255, 66 / 255);
const mutedColor = rgb(112 / 255, 118 / 255, 124 / 255);
const ruleColor = rgb(52 / 255, 59 / 255, 66 / 255);

function euros(cents: number, locale: string) {
  const amount = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${amount} €`;
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
  const labels = english ? ["Description", "Qty", "Unit price", "Amount"] : ["Libellé", "Quantité", "Prix unitaire", "Montant"];
  const positions = [margin + 9, 352, 412, 496];
  page.drawRectangle({ x: margin, y: pageHeight - top - 27, width: pageWidth - margin * 2, height: 27, color: rgb(128 / 255, 157 / 255, 136 / 255) });
  labels.forEach((label, index) => drawTopText(page, font, label, positions[index], top + 8, 8.5, rgb(1, 1, 1), index === 0 ? 300 : pageWidth));
}

function drawInvoiceTableRow(page: PDFPage, font: PDFFont, boldFont: PDFFont, values: string[], top: number, final = false) {
  const positions = [margin + 9, 352, 412, 496];
  const widths = [290, 36, 70, 56];
  values.forEach((value, index) => {
    const rowFont = final ? boldFont : font;
    const size = final ? 9 : 8.5;
    const safe = safePdfText(rowFont, value);
    const rightAligned = index > 0;
    const x = rightAligned ? positions[index] + widths[index] - rowFont.widthOfTextAtSize(safe, size) : positions[index];
    page.drawText(fitPdfText(rowFont, value, size, rightAligned ? widths[index] : widths[index] + 30), { x, y: pageHeight - top - size, size, font: rowFont, color: textColor });
  });
  drawTopRule(page, top + 24, final ? 1.2 : 0.5);
}

export async function renderInvoicePdf(input: { invoice: InvoiceSnapshot; order: OrderSnapshot; lines: OrderLineSnapshot[] }) {
  const { invoice, order, lines } = input;
  const english = invoiceUsesEnglish(order.shipping_address?.countryCode);
  const documentLocale = english ? "en-GB" : "fr-FR";
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([pageWidth, pageHeight]);
  const right = pageWidth - margin;
  const issuedDate = new Date(invoice.issued_at).toLocaleDateString(documentLocale);
  const address = order.shipping_address ?? {};
  const buyerLines = [
    `${address.firstName ?? ""} ${address.lastName ?? ""}`.trim(), address.company, address.line1,
    `${address.postalCode ?? ""} ${address.city ?? ""}`.trim(), address.countryCode, order.email,
  ].filter((line): line is string => Boolean(line));
  const totalCents = order.total_cents;

  drawTopText(page, boldFont, "ZEN", margin, 58, 26, textColor, 130);
  drawTopText(page, font, "coffee lab", margin + 16, 86, 8.5, mutedColor, 130);
  drawTopText(page, boldFont, "Zen Coffee Lab", 142, 50, 10, textColor, 210);
  drawTopText(page, font, "32 rue Louis Blanc", 142, 72, 8.5, mutedColor, 210);
  drawTopText(page, font, "37000 Tours, France", 142, 85, 8.5, mutedColor, 210);
  drawTopText(page, font, "contact@zencoffeelab.com", 142, 110, 8.5, mutedColor, 210);
  drawTopText(page, boldFont, buyerLines[0] ?? order.email, 390, 50, 10, textColor, right);
  buyerLines.slice(1).forEach((line, index) => drawRightTopText(page, font, line, right, 72 + index * 13, 8.5, mutedColor));

  drawTopText(page, boldFont, english ? "INVOICE" : "FACTURE", margin, 215, 16, textColor, 250);
  drawTopText(page, font, invoice.invoice_number, margin, 239, 9.5, mutedColor, 250);
  drawRightTopText(page, font, english ? `Issued on ${issuedDate}` : `Émise le ${issuedDate}`, right, 250, 8.5, mutedColor);

  const tableTop = 287;
  drawInvoiceTableHeader(page, font, english, tableTop);
  let rowTop = tableTop + 38;
  for (const line of lines) {
    if (rowTop > 620) { page = document.addPage([pageWidth, pageHeight]); rowTop = 84; drawInvoiceTableHeader(page, font, english, 45); }
    drawInvoiceTableRow(page, font, boldFont, [
      `${english ? line.english_product_name ?? line.product_name : line.product_name} - ${line.variant_label}`,
      String(line.quantity), euros(Math.round(line.line_total_cents / Math.max(line.quantity, 1)), documentLocale), euros(line.line_total_cents, documentLocale),
    ], rowTop);
    rowTop += 24;
  }
  if (order.shipping_charged_cents > 0) {
    drawInvoiceTableRow(page, font, boldFont, [english ? "Shipping" : "Livraison", "1", euros(order.shipping_charged_cents, documentLocale), euros(order.shipping_charged_cents, documentLocale)], rowTop);
    rowTop += 24;
  }

  const summaryTop = Math.max(rowTop + 36, 545);
  const summaryX = 410;
  const drawSummaryLine = (label: string, value: string, top: number, bold = false) => {
    drawTopText(page, bold ? boldFont : font, label, summaryX, top, 8.5, bold ? textColor : mutedColor, right - 82);
    drawRightTopText(page, bold ? boldFont : font, value, right, top, 8.5, bold ? textColor : mutedColor);
  };
  drawTopText(page, boldFont, english ? "Terms and conditions" : "Termes et conditions", margin, summaryTop, 8.5, mutedColor, 330);
  drawTopText(page, font, english ? "VAT not applicable, art. 293 B of the French tax code." : "TVA non applicable, art. 293 B du CGI.", margin, summaryTop + 16, 7.5, mutedColor, 340);
  drawSummaryLine("Total", euros(totalCents, documentLocale), summaryTop + 8, true);
  drawTopRule(page, summaryTop + 34, 1);

  drawTopRule(page, 785, 0.8);
  drawTopText(page, font, "Zen Coffee Lab · Ugo Simon-Meslet · 32 rue Louis Blanc · 37000 Tours · France", margin + 28, 799, 7, mutedColor, right);
  drawTopText(page, font, "SIRET 848 867 065 00056 · contact@zencoffeelab.com", margin + 28, 811, 7, mutedColor, right);
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
  const invoiceLines = (lines ?? []) as OrderLineSnapshot[];
  const english = invoiceUsesEnglish((order as OrderSnapshot).shipping_address?.countryCode);
  let englishNames = new Map<string, string>();
  const productIds = [...new Set(invoiceLines.map((line) => line.product_id).filter((id): id is string => Boolean(id)))];
  if (english && productIds.length) {
    const { data } = await client
      .from("product_translations")
      .select("product_id,name")
      .eq("locale", "en-GB")
      .in("product_id", productIds);
    englishNames = new Map((data ?? []).map((translation) => [translation.product_id, translation.name]));
  }
  const bytes = await renderInvoicePdf({
    invoice: invoice as InvoiceSnapshot,
    order: order as OrderSnapshot,
    lines: invoiceLines.map((line) => ({ ...line, english_product_name: line.product_id ? englishNames.get(line.product_id) : undefined })),
  });
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
