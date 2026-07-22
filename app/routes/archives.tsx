import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ProductCard } from "~/components/product-card";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  return { locale, products: await getProducts({ status: "archived" }) };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.locale === "en-GB" ? "Coffee archives | Zen Coffee Lab" : "Archives café | Zen Coffee Lab", data?.locale === "en-GB" ? "Past lots roasted by Zen Coffee Lab." : "Les lots passés par le torréfacteur Zen Coffee Lab.", data?.locale === "en-GB" ? "/en/archives" : "/archives");

export default function Archives() {
  const { locale, products } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  return <><header className="page-hero"><p className="eyebrow">{english ? "Our memory" : "Notre mémoire"}</p><h1>{english ? "Coffee archives" : "Archives café"}</h1><p className="lede">{english ? "A record of limited lots that have passed through our roaster." : "La mémoire des lots éphémères passés entre les mains de notre torréfacteur."}</p></header><section className="section page-shell">{products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div> : <div className="empty-state"><h2>{english ? "The archive is being prepared." : "Les archives se préparent."}</h2><p>{english ? "Archived coffees will appear here automatically." : "Les cafés archivés apparaîtront ici automatiquement."}</p></div>}</section></>;
}
