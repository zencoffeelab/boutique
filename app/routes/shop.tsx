import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  return { locale, products: await getProducts({ status: "published", availableOnly: true }) };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const english = data?.locale === "en-GB";
  return pageMeta(english ? "Specialty coffee shop | Zen Coffee Lab" : "Boutique de cafés de spécialité | Zen Coffee Lab", english ? "Explore our seasonal coffees, roasted fresh in Tours." : "Découvrez nos cafés de saison, torréfiés frais à Tours.", english ? "/en/shop" : "/boutique");
};

export default function Shop() {
  const { locale, products } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  return <>
    <header className="page-hero"><p className="eyebrow">Zen Coffee Lab</p><h1>{english ? "The coffee shop" : "La boutique café"}</h1><p className="lede">{english ? "Bright, traceable coffees roasted to order. Choose your origin, then your format." : "Des cafés lumineux et traçables, torréfiés à la demande. Choisissez votre origine, puis votre format."}</p></header>
    <section className="page-shell section" aria-label={english ? "Coffee catalogue" : "Catalogue de cafés"}>
      <div className="filter-bar"><span>{products.length} {english ? "coffees" : "cafés"}</span><span>{english ? "Roasted every week in Tours" : "Torréfiés chaque semaine à Tours"}</span></div>
      {products.length > 0
        ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>
        : <div className="empty-state"><h2>{english ? "No coffee is available right now." : "Aucun café n’est disponible pour le moment."}</h2><p>{english ? "Our next freshly roasted selection is coming soon." : "Notre prochaine sélection fraîchement torréfiée arrive bientôt."}</p></div>}
    </section>
  </>;
}
