import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  return { locale, products: await getProducts({ status: "published" }) };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const english = data?.locale === "en-GB";
  return pageMeta(english ? "Specialty coffee shop | Zen Coffee Lab" : "Boutique de cafés de spécialité | Zen Coffee Lab", english ? "Explore our seasonal coffees, roasted fresh in Tours." : "Découvrez nos cafés de saison, torréfiés frais à Tours.", english ? "/en/shop" : "/boutique");
};

export default function Shop() {
  const { locale, products } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  return <>
    <header className="shop-title-band"><h1>{english ? "The shop" : "La boutique"}</h1></header>
    <figure className="shop-banner">
      <img src="/media/shop-banner.jpg" alt={english ? "Coffee being prepared at Zen Coffee Lab" : "Préparation du café chez Zen Coffee Lab"} width="1300" height="650" fetchPriority="high" />
    </figure>
    <section className="page-shell shop-catalog" aria-label={english ? "Coffee catalogue" : "Catalogue de cafés"}>
      <div className="filter-bar"><span>{products.length} {english ? "coffees" : "cafés"}</span><span>{english ? "Roasted every week in Tours" : "Torréfiés chaque semaine à Tours"}</span></div>
      <div className="product-grid product-grid--shop">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>
    </section>
  </>;
}
