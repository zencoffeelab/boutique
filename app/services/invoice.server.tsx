import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createServiceSupabase } from "~/lib/supabase.server";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#253021" },
  header: { display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 36 },
  brand: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 18, marginBottom: 8 },
  row: { display: "flex", flexDirection: "row", borderBottom: "1 solid #d8d8d3", paddingVertical: 8 },
  grow: { flexGrow: 1 }, amount: { width: 90, textAlign: "right" }, total: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  muted: { color: "#6b7165", marginTop: 4 }, footer: { position: "absolute", bottom: 36, left: 42, right: 42, color: "#6b7165", fontSize: 8 },
});

function euros(cents: number, locale: string) { return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100); }

function InvoiceDocument({ invoice, order, lines }: { invoice: any; order: any; lines: any[] }) {
  const english = order.locale === "en-GB";
  return <Document title={invoice.invoice_number} author="Zen Coffee Lab">
    <Page size="A4" style={styles.page}>
      <View style={styles.header}><View><Text style={styles.brand}>ZEN COFFEE LAB</Text><Text style={styles.muted}>Micro-roastery · Tours, France</Text></View><View><Text style={styles.title}>{english ? "INVOICE" : "FACTURE"}</Text><Text>{invoice.invoice_number}</Text><Text>{new Date(invoice.issued_at).toLocaleDateString(english ? "en-GB" : "fr-FR")}</Text></View></View>
      <View style={{ marginBottom: 28 }}><Text>{order.shipping_address.firstName} {order.shipping_address.lastName}</Text>{order.shipping_address.company ? <Text>{order.shipping_address.company}</Text> : null}<Text>{order.shipping_address.line1}</Text><Text>{order.shipping_address.postalCode} {order.shipping_address.city} · {order.shipping_address.countryCode}</Text>{order.shipping_address.pickupPoint ? <><Text style={styles.muted}>{english ? "Pickup point" : "Point relais"}</Text><Text>{order.shipping_address.pickupPoint.name}</Text><Text>{order.shipping_address.pickupPoint.address1}</Text><Text>{order.shipping_address.pickupPoint.postalCode} {order.shipping_address.pickupPoint.city} · ID {order.shipping_address.pickupPoint.id}</Text></> : null}<Text>{order.email}</Text></View>
      <View style={styles.row}><Text style={styles.grow}>{english ? "Description" : "Description"}</Text><Text style={styles.amount}>{english ? "Amount" : "Montant"}</Text></View>
      {lines.map((line) => <View style={styles.row} key={line.id}><Text style={styles.grow}>{line.quantity} × {line.product_name} · {line.variant_label}</Text><Text style={styles.amount}>{euros(line.line_total_cents, order.locale)}</Text></View>)}
      <View style={styles.row}><Text style={styles.grow}>{english ? "Shipping" : "Livraison"}</Text><Text style={styles.amount}>{euros(order.shipping_charged_cents, order.locale)}</Text></View>
      <View style={styles.row}><Text style={[styles.grow, styles.total]}>Total EUR</Text><Text style={[styles.amount, styles.total]}>{euros(order.total_cents, order.locale)}</Text></View>
      <Text style={styles.muted}>{english ? "VAT not applicable under Article 293 B of the French Tax Code." : "TVA non applicable, art. 293 B du CGI."}</Text>
      <Text style={styles.footer}>Zen Coffee Lab · Tours · contact@zencoffeelab.com · {order.order_number}</Text>
    </Page>
  </Document>;
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
  const buffer = await renderToBuffer(<InvoiceDocument invoice={invoice} order={order} lines={lines ?? []} />);
  const path = `${new Date(invoice.issued_at).getUTCFullYear()}/${invoice.invoice_number}.pdf`;
  const { error } = await client.storage.from("invoices").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  await client.from("invoices").update({ storage_path: path }).eq("id", invoice.id);
  return path;
}

export async function getSignedInvoiceUrl(orderId: string) {
  const client = createServiceSupabase(); if (!client) return null;
  const { data: invoice } = await client.from("invoices").select("storage_path").eq("order_id", orderId).maybeSingle();
  if (!invoice?.storage_path) return null;
  const { data, error } = await client.storage.from("invoices").createSignedUrl(invoice.storage_path, 60);
  if (error) throw error; return data.signedUrl;
}
