import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { createStripe } from "~/lib/stripe.server";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#253021" },
  header: { display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 34 },
  brand: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 18, marginBottom: 6 },
  row: { display: "flex", flexDirection: "row", borderBottom: "1 solid #d8d8d3", paddingVertical: 8 },
  grow: { flexGrow: 1 },
  quantity: { width: 52, textAlign: "right" },
  discount: { width: 62, textAlign: "right" },
  amount: { width: 84, textAlign: "right" },
  total: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  muted: { color: "#6b7165", marginTop: 4 },
  notice: { marginTop: 24, padding: 14, backgroundColor: "#f0d84f" },
  footer: { position: "absolute", bottom: 36, left: 42, right: 42, color: "#6b7165", fontSize: 8 },
});

function money(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

function ProfessionalQuoteDocument({ quote, lines, paymentUrl }: { quote: any; lines: any[]; paymentUrl: string }) {
  const english = quote.locale === "en-GB";
  return <Document title={quote.quote_number} author="Zen Coffee Lab">
    <Page size="A4" style={styles.page}>
      <View style={styles.header}><View><Text style={styles.brand}>ZEN COFFEE LAB</Text><Text style={styles.muted}>{english ? "Micro-roastery" : "micro-torréfacteur"} · Tours, France</Text></View><View><Text style={styles.title}>{english ? "PROFESSIONAL QUOTE" : "DEVIS PROFESSIONNEL"}</Text><Text>{quote.quote_number}</Text><Text>{new Date(quote.created_at).toLocaleDateString(quote.locale)}</Text></View></View>
      <View style={{ marginBottom: 28 }}><Text>{quote.email}</Text><Text style={styles.muted}>{english ? "Valid until" : "Valable jusqu’au"} {new Date(quote.valid_until).toLocaleDateString(quote.locale)}</Text></View>
      <View style={styles.row}><Text style={styles.grow}>{english ? "Coffee" : "Café"}</Text><Text style={styles.quantity}>kg</Text><Text style={styles.discount}>{english ? "Discount" : "Remise"}</Text><Text style={styles.amount}>{english ? "Amount" : "Montant"}</Text></View>
      {lines.map((line) => <View style={styles.row} key={line.id}><Text style={styles.grow}>{line.product_name}</Text><Text style={styles.quantity}>{line.kilograms}</Text><Text style={styles.discount}>{line.discount_percent} %</Text><Text style={styles.amount}>{money(line.line_total_cents, quote.locale)}</Text></View>)}
      <View style={styles.row}><Text style={styles.grow}>{english ? "Subtotal before volume discount" : "Sous-total avant remise volume"}</Text><Text style={styles.amount}>{money(quote.subtotal_before_discount_cents, quote.locale)}</Text></View>
      <View style={styles.row}><Text style={styles.grow}>{english ? "Volume discount" : "Remise volume"}</Text><Text style={styles.amount}>–{money(quote.discount_cents, quote.locale)}</Text></View>
      <View style={styles.row}><Text style={[styles.grow, styles.total]}>Total EUR</Text><Text style={[styles.amount, styles.total]}>{money(quote.total_cents, quote.locale)}</Text></View>
      <View style={styles.notice}><Text>{english ? "Pay by card or SEPA bank transfer:" : "Paiement par carte ou virement bancaire SEPA :"}</Text><Text>{paymentUrl}</Text></View>
      <Text style={styles.footer}>Zen Coffee Lab · Tours · contact@zencoffeelab.com · {quote.quote_number}</Text>
    </Page>
  </Document>;
}

export async function generateProfessionalQuotePdf(quoteId: string, paymentUrl: string) {
  const client = createServiceSupabase();
  if (!client) throw new Error("Database unavailable.");
  const [{ data: quote }, { data: lines }] = await Promise.all([
    client.from("professional_quotes").select("*").eq("id", quoteId).single(),
    client.from("professional_quote_lines").select("*").eq("quote_id", quoteId).order("created_at"),
  ]);
  if (!quote || !lines?.length) throw new Error("Professional quote snapshot is incomplete.");
  if (quote.storage_path) return quote.storage_path;
  const buffer = await renderToBuffer(<ProfessionalQuoteDocument quote={quote} lines={lines} paymentUrl={paymentUrl} />);
  const path = `${new Date(quote.created_at).getUTCFullYear()}/${quote.quote_number}.pdf`;
  const { error } = await client.storage.from("professional-quotes").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  await client.from("professional_quotes").update({ storage_path: path, updated_at: new Date().toISOString() }).eq("id", quoteId);
  return path;
}

export async function getSignedProfessionalQuoteUrl(quoteId: string) {
  const client = createServiceSupabase();
  if (!client) return null;
  const { data: quote } = await client.from("professional_quotes").select("storage_path").eq("id", quoteId).maybeSingle();
  if (!quote?.storage_path) return null;
  const { data, error } = await client.storage.from("professional-quotes").createSignedUrl(quote.storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function createProfessionalQuoteCheckout(input: { quoteId: string; profileId: string; email: string; locale: "fr-FR" | "en-GB" }) {
  const config = env();
  const client = createServiceSupabase();
  if (!client) throw new Response("Database unavailable.", { status: 503 });
  const { data: quote } = await client.from("professional_quotes").select("*,professional_quote_lines(*)").eq("id", input.quoteId).eq("profile_id", input.profileId).maybeSingle();
  if (!quote) throw new Response("Quote not found.", { status: 404 });
  if (quote.status !== "pending_payment" || new Date(quote.valid_until).getTime() <= Date.now()) throw new Response("Quote is no longer payable.", { status: 409 });
  if (config.PAYMENTS_MOCK) return `${input.locale === "en-GB" ? "/en/my-account" : "/mon-compte"}?quote=${quote.quote_number}#account-professional-quotes`;
  if (!config.STRIPE_SECRET_KEY) throw new Response("Stripe is not configured.", { status: 503 });
  const stripe = createStripe(config.STRIPE_SECRET_KEY);
  const { data: profile } = await client.from("profiles").select("stripe_customer_id").eq("id", input.profileId).single();
  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: input.email, metadata: { profile_id: input.profileId } });
    customerId = customer.id;
    const { error } = await client.from("profiles").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("id", input.profileId).is("stripe_customer_id", null);
    if (error) throw error;
  }
  const paymentPath = input.locale === "en-GB" ? `/en/quotes/${quote.id}/payment` : `/devis/${quote.id}/paiement`;
  const accountPath = input.locale === "en-GB" ? "/en/my-account" : "/mon-compte";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: quote.id,
    payment_method_types: ["card", "customer_balance"],
    payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: "FR" }, requested_address_types: ["iban"] } } },
    expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    success_url: `${config.VITE_SITE_URL}${accountPath}?quote=${encodeURIComponent(quote.quote_number)}#account-professional-quotes`,
    cancel_url: `${config.VITE_SITE_URL}${paymentPath}?canceled=1`,
    metadata: { professional_quote_id: quote.id, profile_id: input.profileId },
    payment_intent_data: { metadata: { professional_quote_id: quote.id, quote_number: quote.quote_number } },
    line_items: quote.professional_quote_lines.map((line: any) => ({ quantity: 1, price_data: { currency: "eur", unit_amount: line.line_total_cents, product_data: { name: `${line.product_name} · ${line.kilograms} kg`, description: line.discount_percent > 0 ? `${line.discount_percent}% volume discount` : undefined, metadata: { product_id: line.product_id } } } })),
    locale: input.locale === "fr-FR" ? "fr" : "en",
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await client.from("professional_quotes").update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq("id", quote.id);
  return session.url;
}
