import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Product } from "~/domain/types";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 48, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 10, color: "#1f251d" },
  header: { marginBottom: 26, borderBottom: "1 solid #c8d0c4", paddingBottom: 14 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 19, letterSpacing: 1.4 },
  title: { marginTop: 4, fontSize: 11, color: "#61705e" },
  coffee: { marginBottom: 28, paddingBottom: 24, borderBottom: "1 solid #d9ddd3" },
  coffeeTitle: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 4 },
  category: { color: "#61705e", fontSize: 9, marginBottom: 12 },
  leadImage: { width: "100%", height: 240, objectFit: "cover", marginBottom: 13 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 15, marginBottom: 7 },
  text: { lineHeight: 1.5 },
  specs: { display: "flex", flexDirection: "row", flexWrap: "wrap", marginTop: 3 },
  spec: { width: "50%", paddingRight: 10, paddingVertical: 3 },
  label: { fontFamily: "Helvetica-Bold", color: "#61705e" },
  notes: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  note: { paddingVertical: 4, paddingHorizontal: 7, backgroundColor: "#e9eee7", fontSize: 9 },
  variants: { marginTop: 5 },
  variant: { display: "flex", flexDirection: "row", justifyContent: "space-between", borderBottom: "1 solid #e1e4dd", paddingVertical: 5 },
  story: { marginTop: 18, paddingTop: 14, borderTop: "1 solid #d9ddd3" },
  storyImage: { width: "100%", height: 220, objectFit: "cover", marginTop: 8, marginBottom: 11 },
  footer: { position: "absolute", bottom: 22, left: 42, right: 42, textAlign: "center", color: "#61705e", fontSize: 8 },
});

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function FrenchCoffee({ product }: { product: Product }) {
  const translation = product.translations["fr-FR"];
  const specifications = [
    ["Producteur", translation.producer],
    ["Région", translation.region],
    ["Variété", translation.variety],
    ["Traitement", translation.process],
    ["Altitude", `${product.altitudeMeters} m`],
    ["Torréfaction", "Légère"],
  ].filter(([, value]) => Boolean(value));
  const retailVariants = product.variants
    .map((variant) => ({ variant, offer: variant.offers.find((offer) => offer.audience === "retail" && offer.active) }))
    .filter((entry): entry is { variant: Product["variants"][number]; offer: NonNullable<Product["variants"][number]["offers"][number]> } => Boolean(entry.offer));
  const blocks = product.editorialBlocks.filter((block) => block.position <= 2 && block.title["fr-FR"] && block.body["fr-FR"]);

  return <View style={styles.coffee} wrap>
    <Text style={styles.coffeeTitle}>{translation.name}</Text>
    <Text style={styles.category}>Café de spécialité</Text>
    {product.media.map((media) => <Image key={media.id} style={styles.leadImage} src={media.url} />)}
    <View style={styles.specs}>
      {specifications.map(([label, value]) => <Text key={label} style={styles.spec}><Text style={styles.label}>{label} : </Text>{value}</Text>)}
    </View>
    {translation.shortDescription ? <Text style={[styles.text, { marginTop: 12 }]}>{translation.shortDescription}</Text> : null}
    {retailVariants.length > 0 ? <><Text style={styles.heading}>Formats et tarifs</Text><View style={styles.variants}>{retailVariants.map(({ variant, offer }) => <View style={styles.variant} key={variant.id}><Text>{variant.label}</Text><Text>{money(offer.price.amount)}</Text></View>)}</View></> : null}
    {translation.tastingNotes.length > 0 ? <><Text style={styles.heading}>Notes de dégustation</Text><View style={styles.notes}>{translation.tastingNotes.map((note) => <Text style={styles.note} key={note}>{note}</Text>)}</View></> : null}
    {blocks.map((block) => <View key={block.id} style={styles.story} wrap>
      <Text style={styles.heading}>{block.title["fr-FR"]}</Text>
      {block.imageUrl ? <Image style={styles.storyImage} src={block.imageUrl} /> : null}
      <Text style={styles.text}>{block.body["fr-FR"]}</Text>
    </View>)}
  </View>;
}

function LatestCoffeesDocument({ products }: { products: readonly Product[] }) {
  return <Document title="Les quatre derniers cafés" author="Zen Coffee Lab" language="fr-FR">
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed><Text style={styles.brand}>ZEN COFFEE LAB</Text><Text style={styles.title}>Les quatre derniers cafés mis en ligne</Text></View>
      {products.map((product) => <FrenchCoffee key={product.id} product={product} />)}
      <Text style={styles.footer} fixed>Zen Coffee Lab · zencoffeelab.com</Text>
    </Page>
  </Document>;
}

export async function renderLatestCoffeesPdf(products: readonly Product[]) {
  return renderToBuffer(<LatestCoffeesDocument products={products} />);
}
