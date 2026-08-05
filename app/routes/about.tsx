import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { EditorialStory } from "~/components/editorial-story";
import { getProducts } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const [content, products] = await Promise.all([getContentPage("a-propos", locale), getProducts({ status: "published", availableOnly: false })]);
  return { locale, content, storyImages: products.flatMap((product) => product.media.slice(0, 1).map((media) => ({ src: media.url, alt: media.alt[locale] }))) };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.content?.seoTitle ?? (data?.locale === "en-GB" ? "About us | Zen Coffee Lab" : "À propos | Zen Coffee Lab"), data?.content?.seoDescription ?? (data?.locale === "en-GB" ? "Discover the approach behind our specialty coffee roastery in Tours." : "Découvrez la démarche de notre micro-torréfaction de cafés de spécialité à Tours."), data?.locale === "en-GB" ? "/en/about-us" : "/a-propos");
export default function About() {
  const { locale, content, storyImages } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  return <><header className="page-hero"><p className="eyebrow">{english ? "Our approach" : "Notre démarche"}</p><h1>{content?.title ?? (english ? "Roast less. Reveal more." : "Torréfier moins. Révéler plus.")}</h1><p className="lede">{english ? "Zen Coffee Lab is a small independent roastery in Tours, born from a desire to make exceptional coffee both precise and approachable." : "Zen Coffee Lab est une micro-torréfaction indépendante à Tours, née de l’envie de rendre les cafés d’exception aussi précis qu’accessibles."}</p></header>{content ? <EditorialStory content={content.blocks} images={storyImages} /> : null}<section className="product-story about-story"><section className="product-story-block product-story-block--image-first"><div className="product-story-block__copy"><p className="eyebrow">{english ? "Small batches" : "Petits lots"}</p><h2>{english ? "Precision in every roast" : "La précision à chaque cuisson"}</h2><p>{english ? "Each profile is developed to preserve the identity of the terroir: sweetness, lively acidity and a long, clean finish." : "Chaque profil est développé pour préserver l’identité du terroir : sucrosité, acidité vivante et finale longue et nette."}</p><Link className="button button--dark" to={english ? "/en/shop" : "/boutique"}>{english ? "Taste the selection" : "Goûter la sélection"}</Link></div><figure className="product-story-block__media"><img src="https://www.zencoffeelab.com/wp-content/uploads/2025/02/portrait-torrefacteur.jpg" alt={english ? "Zen Coffee Lab roaster" : "Torréfacteur Zen Coffee Lab"} width="1000" height="1200" /></figure></section></section></>;
}
