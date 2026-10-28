import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { LoaderFunctionArgs } from "react-router";
import { formatMoney } from "~/domain/money";
import type { Product } from "~/domain/types";
import { requireAdmin } from "~/lib/auth.server";
import { getLatestPublishedProducts } from "~/lib/catalog.server";

const pageHeight = 595.28;
const styles = StyleSheet.create({
  page: { padding: 32, backgroundColor: "#fbfaf6", color: "#172018", fontFamily: "Helvetica", fontSize: 9 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1 solid #d6d4ca", paddingBottom: 10, marginBottom: 14 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 10, letterSpacing: 1.4 }, pageLabel: { color: "#697166", fontSize: 8 },
  main: { flexDirection: "row", gap: 24, height: pageHeight - 112 }, gallery: { width: 350, flexDirection: "row", flexWrap: "wrap", gap: 10, alignContent: "flex-start" },
  imageCard: { width: 170, height: 213, backgroundColor: "#edeae1", padding: 7, justifyContent: "center" }, image: { width: "100%", height: "100%", objectFit: "contain" },
  details: { flexGrow: 1, paddingTop: 3 }, title: { fontFamily: "Times-Roman", fontSize: 29, lineHeight: 1.04, marginBottom: 5 }, subtitle: { color: "#697166", fontSize: 10, marginBottom: 18 },
  facts: { borderTop: "1 solid #d6d4ca", borderBottom: "1 solid #d6d4ca", paddingVertical: 8, marginBottom: 14 }, fact: { flexDirection: "row", paddingVertical: 3 }, factLabel: { width: 106, color: "#697166", fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 0.8 }, factValue: { flexGrow: 1, fontSize: 9.5 },
  body: { fontSize: 9.5, lineHeight: 1.45, marginBottom: 13 }, variants: { flexDirection: "row", gap: 8, marginBottom: 16 }, variant: { border: "1 solid #253021", padding: 8, minWidth: 104, flexDirection: "row", justifyContent: "space-between", gap: 14 },
  notesLabel: { color: "#697166", fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1, marginBottom: 5 }, notes: { fontFamily: "Times-Roman", fontSize: 16, lineHeight: 1.2 },
  editorial: { flexDirection: "row", gap: 28, height: pageHeight - 112 }, editorialText: { width: 355, justifyContent: "center" }, editorialImage: { flexGrow: 1, backgroundColor: "#edeae1", padding: 10, justifyContent: "center" }, editorialTitle: { fontFamily: "Times-Roman", fontSize: 31, lineHeight: 1.05, marginBottom: 18 }, editorialBody: { fontSize: 10, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, textAlign: "center", color: "#697166", fontSize: 7 }, noImage: { color: "#697166", textAlign: "center", fontSize: 8 },
});

function cleanText(value: string | null | undefined, max = 1_000) { const normalized = (value ?? "").replace(/\s+/g, " ").trim(); return normalized.length > max ? `${normalized.slice(0, max - 1).trimEnd()}…` : normalized; }
function mediaUrl(value: string, requestUrl: string) { return new URL(value, requestUrl).toString(); }
function productImages(product: Product, requestUrl: string) { return [...new Set([product.hoverImageUrl, product.thumbnailLabelUrl, ...product.media.map((media) => media.url)].filter((url): url is string => Boolean(url)))].map((url) => mediaUrl(url, requestUrl)); }
function Header({ product, label }: { product: Product; label: string }) { return <View style={styles.header} fixed><Text style={styles.brand}>ZEN COFFEE LAB</Text><Text style={styles.pageLabel}>{product.translations["fr-FR"].name} - {label}</Text></View>; }

function ProductPage({ product, requestUrl }: { product: Product; requestUrl: string }) {
  const translation = product.translations["fr-FR"]; const images = productImages(product, requestUrl).slice(0, 4);
  return <Page size="A4" orientation="landscape" style={styles.page} wrap={false}><Header product={product} label="fiche café" /><View style={styles.main}>
    <View style={styles.gallery}>{images.length ? images.map((url) => <View key={url} style={styles.imageCard}><Image src={url} style={styles.image} /></View>) : <View style={styles.imageCard}><Text style={styles.noImage}>Visuel indisponible</Text></View>}</View>
    <View style={styles.details}><Text style={styles.title}>{translation.name}</Text><Text style={styles.subtitle}>Café de spécialité</Text><View style={styles.facts}>{[["PRODUCTEUR", translation.producer], ["RÉGION", translation.region], ["VARIÉTÉ", translation.variety], ["TRAITEMENT", translation.process], ["ALTITUDE", product.altitudeMeters ? `${product.altitudeMeters} m` : ""]].map(([label, value]) => <View key={label} style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{cleanText(value, 100)}</Text></View>)}</View><Text style={styles.body}>{cleanText(translation.body || translation.shortDescription, 800)}</Text><View style={styles.variants}>{product.variants.slice(0, 3).map((variant) => <View key={variant.id} style={styles.variant}><Text>{variant.label}</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{formatMoney(variant.offers.find((offer) => offer.audience === "retail" && offer.active)?.price.amount ?? variant.internalCostCents, "fr-FR")}</Text></View>)}</View>{translation.tastingNotes.length ? <><Text style={styles.notesLabel}>NOTES DE DÉGUSTATION</Text><Text style={styles.notes}>{translation.tastingNotes.join(" - ")}</Text></> : null}</View>
  </View><Text style={styles.footer} fixed>Zen Coffee Lab - {translation.name}</Text></Page>;
}

function EditorialPage({ product, position, requestUrl }: { product: Product; position: 1 | 2; requestUrl: string }) {
  const block = product.editorialBlocks.find((item) => item.position === position); if (!block) return null;
  const content = <View style={styles.editorialText}><Text style={styles.editorialTitle}>{cleanText(block.title["fr-FR"], 140)}</Text><Text style={styles.editorialBody}>{cleanText(block.body["fr-FR"], 2_100)}</Text></View>;
  const visual = <View style={styles.editorialImage}><Image src={mediaUrl(block.imageUrl, requestUrl)} style={styles.image} /></View>;
  return <Page size="A4" orientation="landscape" style={styles.page} wrap={false}><Header product={product} label={`bloc ${position}`} /><View style={styles.editorial}>{position === 1 ? content : visual}{position === 1 ? visual : content}</View><Text style={styles.footer} fixed>Zen Coffee Lab - {product.translations["fr-FR"].name}</Text></Page>;
}

function ExtraMediaPage({ product, requestUrl }: { product: Product; requestUrl: string }) {
  const images = productImages(product, requestUrl).slice(4, 8); if (!images.length) return null;
  return <Page size="A4" orientation="landscape" style={styles.page} wrap={false}><Header product={product} label="galerie" /><View style={styles.gallery}>{images.map((url) => <View key={url} style={styles.imageCard}><Image src={url} style={styles.image} /></View>)}</View><Text style={styles.footer} fixed>Zen Coffee Lab - {product.translations["fr-FR"].name}</Text></Page>;
}

function LatestCoffeesPdfDocument({ products, requestUrl }: { products: Product[]; requestUrl: string }) { return <Document title="Dernières sorties café" author="Zen Coffee Lab" subject="Fiches des dernières sorties café">{products.flatMap((product) => [<ProductPage key={`${product.id}-main`} product={product} requestUrl={requestUrl} />, <ExtraMediaPage key={`${product.id}-media`} product={product} requestUrl={requestUrl} />, <EditorialPage key={`${product.id}-block-1`} product={product} position={1} requestUrl={requestUrl} />, <EditorialPage key={`${product.id}-block-2`} product={product} position={2} requestUrl={requestUrl} />])}</Document>; }

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request); const products = await getLatestPublishedProducts(4);
  if (!products.length) throw new Response("Aucun café publié à exporter.", { status: 404 });
  const pdf = await renderToBuffer(<LatestCoffeesPdfDocument products={products} requestUrl={request.url} />);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Disposition": "attachment; filename=dernieres-sorties-cafe.pdf", "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
