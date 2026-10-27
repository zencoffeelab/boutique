import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ProductGallery } from "~/routes/product";
import { getLatestPublishedProducts } from "~/lib/catalog.server";
import { requireAdmin } from "~/lib/auth.server";
import { displayTastingNote } from "~/lib/product-text";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const products = await getLatestPublishedProducts(4);
  if (!products.length) throw new Response("Aucun café publié.", { status: 404 });
  return { products };
}

export const meta: MetaFunction = () => [{ title: "Imprimer les dernières sorties - Zen Coffee Lab" }];

function CoffeePrintPage({ product }: { product: Awaited<ReturnType<typeof getLatestPublishedProducts>>[number] }) {
  const t = product.translations["fr-FR"];
  const offers = product.variants.flatMap((variant) => variant.offers.filter((offer) => offer.audience === "retail" && offer.active).map((offer) => ({ label: variant.label, price: offer.price.amount })));
  const blocks = product.editorialBlocks.filter((block) => block.position <= 2 && block.title["fr-FR"] && block.body["fr-FR"]);
  return <article className="product-print-page">
    <div className="product-detail"><ProductGallery product={product} locale="fr-FR" /><div className="product-info"><div className="product-info__title"><h1>{t.name}</h1><p className="product-info__category">Café de spécialité</p></div><table className="product-specifications"><tbody><tr><th>Producteur</th><td>{t.producer}</td></tr><tr><th>Région</th><td>{t.region}</td></tr><tr><th>Variété</th><td>{t.variety}</td></tr><tr><th>Traitement</th><td>{t.process}</td></tr><tr><th>Altitude</th><td>{product.altitudeMeters} m</td></tr><tr><th>Torréfaction</th><td>Légère</td></tr></tbody></table><p className="product-info__description">{t.shortDescription}</p><section className="purchase-panel"><p className="eyebrow">Formats disponibles</p>{offers.map((offer) => <p key={`${offer.label}-${offer.price}`}><strong>{offer.label}</strong><span>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(offer.price / 100)}</span></p>)}</section></div></div>
    {t.tastingNotes.length ? <section className="product-tasting-notes"><h2>Notes de dégustation</h2><ul>{t.tastingNotes.map((note) => <li key={note}>{displayTastingNote(note, "fr-FR")}</li>)}</ul></section> : null}
    <div className="product-story">{blocks.map((block) => <section className={`product-story-block${block.position === 2 ? " product-story-block--image-first" : ""}`} key={block.id}><div className="product-story-block__copy"><h2>{block.title["fr-FR"]}</h2><p>{block.body["fr-FR"]}</p></div><figure className="product-story-block__media"><img src={block.imageUrl} alt={block.imageAlt["fr-FR"]} /></figure></section>)}</div>
  </article>;
}

export default function LatestCoffeesPrint() {
  const { products } = useLoaderData<typeof loader>();
  useEffect(() => { window.setTimeout(() => window.print(), 250); }, []);
  return <main className="latest-coffees-print"><div className="product-print-toolbar"><button className="button button--dark" onClick={() => window.print()}>Enregistrer en PDF</button></div>{products.map((product) => <CoffeePrintPage key={product.id} product={product} />)}</main>;
}
