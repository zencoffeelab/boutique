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
  subtotal_before_discount_cents?: number;
  professional_discount_cents?: number;
  professional_discount_percent?: number;
  subtotal_cents?: number;
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
const margin = 48;
const textColor = rgb(52 / 255, 59 / 255, 66 / 255);
const mutedColor = rgb(112 / 255, 118 / 255, 124 / 255);
const ruleColor = rgb(52 / 255, 59 / 255, 66 / 255);
const invoiceLogoUrl = "https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/brand/logo-black.png";

let invoiceLogoPromise: Promise<ArrayBuffer | null> | null = null;

function isInvoiceUnitTest() {
  return typeof process !== "undefined" && Boolean(process.env?.VITEST);
}

async function getInvoiceLogo() {
  if (isInvoiceUnitTest()) return null;
  if (!invoiceLogoPromise) {
    invoiceLogoPromise = fetch(invoiceLogoUrl, { signal: AbortSignal.timeout(5_000) })
      .then(async (response) => response.ok ? response.arrayBuffer() : null)
      .catch(() => null);
  }
  return invoiceLogoPromise;
}

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

function drawTopText(page: PDFPage, font: PDFFont, value: string, x: number, top: number, size: number, color = textColor, maxRight = pageWidth - margin) {
  const text = fitPdfText(font, value, size, Math.max(0, maxRight - x));
  page.drawText(text, { x, y: pageHeight - top - size, size, font, color });
}

function drawTopRule(page: PDFPage, top: number, thickness = 1) {
  const y = pageHeight - top;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness, color: ruleColor });
}

function drawTopRuleSegment(page: PDFPage, left: number, right: number, top: number, thickness = 1) {
  const y = pageHeight - top;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness, color: ruleColor });
}

function drawRightTopText(page: PDFPage, font: PDFFont, value: string, right: number, top: number, size: number, color = textColor, maxWidth = right - margin) {
  const text = fitPdfText(font, value, size, Math.max(0, maxWidth));
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y: pageHeight - top - size, size, font, color });
}

function drawCenteredTopText(page: PDFPage, font: PDFFont, value: string, top: number, size: number, color = textColor) {
  const text = fitPdfText(font, value, size, pageWidth - margin * 2);
  page.drawText(text, { x: (pageWidth - font.widthOfTextAtSize(text, size)) / 2, y: pageHeight - top - size, size, font, color });
}

function drawInvoiceTableHeader(page: PDFPage, font: PDFFont, english: boolean, top: number) {
  const labels = english ? ["Description", "Qty", "Unit price", "Amount"] : ["Libellé", "Quantité", "Prix unitaire", "Montant"];
  const positions = [margin + 5, 350, 412, 492];
  page.drawRectangle({ x: margin, y: pageHeight - top - 27, width: pageWidth - margin * 2, height: 27, color: rgb(128 / 255, 157 / 255, 136 / 255) });
  labels.forEach((label, index) => drawTopText(page, font, label, positions[index], top + 8, 8.5, rgb(1, 1, 1), index === 0 ? 300 : pageWidth));
}

function drawInvoiceTableRow(page: PDFPage, font: PDFFont, boldFont: PDFFont, values: string[], top: number, final = false) {
  const positions = [margin + 5, 350, 412, 492];
  const widths = [285, 50, 68, 55];
  values.forEach((value, index) => {
    const rowFont = final ? boldFont : font;
    const size = final ? 9 : 8.5;
    const rightAligned = index > 0;
    const fitted = fitPdfText(rowFont, value, size, rightAligned ? widths[index] : widths[index] + 30);
    const x = rightAligned ? positions[index] + widths[index] - rowFont.widthOfTextAtSize(fitted, size) : positions[index];
    page.drawText(fitted, { x, y: pageHeight - top - (index === 0 ? 9 : 17) - size, size, font: rowFont, color: textColor });
    if (index === 0 && !final) drawTopText(page, font, "grains de café torréfiés", positions[0], top + 25, 7, mutedColor, positions[1] - 8);
  });
  drawTopRule(page, top + 42, final ? 1.2 : 0.5);
}

export async function renderInvoicePdf(input: { invoice: InvoiceSnapshot; order: OrderSnapshot; lines: OrderLineSnapshot[] }) {
  const { invoice, order, lines } = input;
  const english = invoiceUsesEnglish(order.shipping_address?.countryCode);
  const documentLocale = english ? "en-GB" : "fr-FR";
  const document = await PDFDocument.create();
  const logoBytes = await getInvoiceLogo();
  const logo = logoBytes ? await document.embedPng(logoBytes) : null;
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
  const lineSubtotalCents = lines.reduce((total, line) => total + line.line_total_cents, 0);
  const subtotalBeforeDiscountCents = order.subtotal_before_discount_cents || lineSubtotalCents;
  const professionalDiscountCents = order.professional_discount_cents ?? 0;

  // Exact order of the canonical “Voir” preview: logo/seller, recipient, title.
  const logoX = margin + 15;
  const logoTop = 45;
  if (logo) {
    page.drawImage(logo, { x: logoX, y: pageHeight - logoTop - 63, width: 117, height: 63 });
  } else {
    drawTopText(page, boldFont, "ZEN", logoX, logoTop + 13, 25, textColor, 140);
    drawTopText(page, font, "COFFEE LAB", logoX + 3, logoTop + 42, 7, mutedColor, 140);
  }
  const sellerX = 379;
  drawTopRuleSegment(page, sellerX, right, logoTop, 2.4);
  drawTopText(page, boldFont, "Zen Coffee Lab", sellerX, 57, 9.36, textColor, right);
  drawTopText(page, font, "Ugo Simon-Meslet", sellerX, 70, 8.64, mutedColor, right);
  drawTopText(page, font, "32 rue Louis Blanc", sellerX, 82, 8.64, mutedColor, right);
  drawTopText(page, font, "37000 Tours, France", sellerX, 94, 8.64, mutedColor, right);
  drawTopText(page, font, "SIRET 848 867 065 00056", sellerX, 106, 8.64, mutedColor, right);
  drawTopText(page, font, "contact@zencoffeelab.com", sellerX, 118, 8.64, mutedColor, right);

  const recipientX = sellerX;
  const recipientRuleTop = 145;
  drawTopRuleSegment(page, recipientX, right, recipientRuleTop, 2.4);
  const recipientLineTop = recipientRuleTop + 10;
  drawTopText(page, boldFont, buyerLines[0] ?? order.email, recipientX, recipientLineTop, 8.64, textColor, right);
  buyerLines.slice(1).forEach((line, index) => drawTopText(page, font, line, recipientX, recipientLineTop + 12 + index * 11, 8.64, mutedColor, right));

  const recipientHeight = 10 + Math.max(buyerLines.length, 1) * 11;
  const titleTop = recipientRuleTop + recipientHeight + 25;
  const titleBottom = titleTop + 46;
  drawTopRule(page, titleTop, 2.4);
  drawTopText(page, boldFont, english ? "INVOICE" : "FACTURE", margin, titleTop + 9, 14.4, textColor, 250);
  drawTopText(page, font, invoice.invoice_number, margin, titleTop + 28, 8.64, mutedColor, 250);
  drawTopText(page, boldFont, english ? "ISSUED" : "ÉMISE", recipientX, titleTop + 10, 8.64, textColor, right);
  drawTopText(page, font, `Date : ${issuedDate}`, recipientX, titleTop + 28, 8.64, mutedColor, right);
  drawTopRule(page, titleBottom, 0.96);

  const tableTop = titleBottom + 36;
  drawInvoiceTableHeader(page, font, english, tableTop);
  let rowTop = tableTop + 38;
  for (const line of lines) {
    if (rowTop > 620) { page = document.addPage([pageWidth, pageHeight]); rowTop = 84; drawInvoiceTableHeader(page, font, english, 45); }
    drawInvoiceTableRow(page, font, boldFont, [
      `${english ? line.english_product_name ?? line.product_name : line.product_name} - ${line.variant_label}`,
      String(line.quantity), euros(Math.round(line.line_total_cents / Math.max(line.quantity, 1)), documentLocale), euros(line.line_total_cents, documentLocale),
    ], rowTop);
    rowTop += 42;
  }
  const summaryTop = Math.max(rowTop + 48, 340);
  const summaryX = 379;
  const drawSummaryLine = (label: string, value: string, top: number, bold = false) => {
    drawTopText(page, bold ? boldFont : font, label, summaryX, top, 8.5, bold ? textColor : mutedColor, right - 82);
    drawRightTopText(page, bold ? boldFont : font, value, right, top, 8.5, bold ? textColor : mutedColor);
  };
  drawTopText(page, boldFont, english ? "Terms and conditions" : "Termes et conditions", margin, summaryTop, 8.5, mutedColor, 330);
  drawTopText(page, font, english ? "VAT not applicable, art. 293 B of the French tax code." : "TVA non applicable, art. 293 B du CGI.", margin, summaryTop + 16, 7.5, mutedColor, 340);
  drawTopText(page, font, english ? "Thank you for your order." : "Merci pour votre commande.", margin, summaryTop + 30, 7.5, mutedColor, 340);
  drawSummaryLine(english ? "Subtotal" : "Sous-total", euros(subtotalBeforeDiscountCents, documentLocale), summaryTop + 8);
  let totalTop = summaryTop + 30;
  if (order.shipping_charged_cents > 0) {
    drawSummaryLine(english ? "Shipping" : "Livraison", euros(order.shipping_charged_cents, documentLocale), totalTop);
    totalTop += 28;
  }
  if (professionalDiscountCents > 0) {
    drawSummaryLine(english ? "Professional offer" : "Offre professionnelle", `-${euros(professionalDiscountCents, documentLocale)}`, totalTop);
    totalTop += 22;
  }
  drawTopRule(page, totalTop - 10, 1.4);
  drawSummaryLine("Total", euros(totalCents, documentLocale), totalTop, true);
  drawTopRule(page, totalTop + 18, 0.6);

  const footerTop = totalTop + 88;
  drawTopRule(page, footerTop, 0.6);
  drawCenteredTopText(page, font, "Zen Coffee Lab · Ugo Simon-Meslet · 32 rue Louis Blanc · 37000 Tours · France", footerTop + 14, 6.6, mutedColor);
  drawCenteredTopText(page, font, "SIRET 848 867 065 00056", footerTop + 25, 6.6, mutedColor);
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

export async function getInvoicePdfDownload(orderId: string) {
  const client = createServiceSupabase(); if (!client) return null;
  const { data: invoice } = await client.from("invoices").select("storage_path,invoice_number").eq("order_id", orderId).maybeSingle();
  if (!invoice?.storage_path) return null;
  const { data, error } = await client.storage.from("invoices").download(invoice.storage_path);
  if (error || !data) throw error ?? new Error("Invoice download unavailable.");
  return { bytes: await data.arrayBuffer(), invoiceNumber: invoice.invoice_number };
}
