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
  const imageBlock = content?.blocks.find((block) => block.type === "aboutStoryImages")?.content;
  const storedImages = imageBlock && typeof imageBlock === "object" && Array.isArray((imageBlock as { images?: unknown }).images)
    ? (imageBlock as { images: Array<{ url?: unknown; alt?: unknown }> }).images.filter((image) => typeof image.url === "string" && image.url).map((image) => ({ src: image.url as string, alt: typeof image.alt === "string" ? image.alt : "Coffee" }))
    : [];
  const storyImages = storedImages.length ? storedImages : products.flatMap((product) => product.media.slice(0, 1).map((media) => ({ src: media.url, alt: media.alt[locale] })));
  const heroBlock = content?.blocks.find((block) => block.type === "aboutHero")?.content;
  const paragraph2Block = content?.blocks.find((block) => block.type === "aboutParagraph2")?.content;
  return { locale, content, storyImages: storedImages.slice(0, 2).length ? storedImages.slice(0, 2) : products.flatMap((product) => product.media.slice(0, 1).map((media) => ({ src: media.url, alt: media.alt[locale] }))), lede: heroBlock && typeof heroBlock === "object" && typeof (heroBlock as { lede?: unknown }).lede === "string" ? (heroBlock as { lede: string }).lede : null, paragraph2: paragraph2Block && typeof paragraph2Block === "object" ? paragraph2Block as never : null };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.content?.seoTitle ?? (data?.locale === "en-GB" ? "About us | Zen Coffee Lab" : "À propos | Zen Coffee Lab"), data?.content?.seoDescription ?? (data?.locale === "en-GB" ? "Discover the approach behind our specialty coffee roastery in Tours." : "Découvrez la démarche de notre micro-torréfaction de cafés de spécialité à Tours."), data?.locale === "en-GB" ? "/en/about-us" : "/a-propos");
export default function About() {
  const { locale, content, storyImages, lede, paragraph2 } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const defaults = english ? { eyebrow: "Small batches", title: "Precision in every roast", body: "Each profile is developed to preserve the identity of the terroir: sweetness, lively acidity and a long, clean finish.", cta: "Taste the selection", image: "https://www.zencoffeelab.com/wp-content/uploads/2025/02/portrait-torrefacteur.jpg", alt: "Zen Coffee Lab roaster" } : { eyebrow: "Petits lots", title: "La précision à chaque cuisson", body: "Chaque profil est développé pour préserver l’identité du terroir : sucrosité, acidité vivante et finale longue et nette.", cta: "Goûter la sélection", image: "https://www.zencoffeelab.com/wp-content/uploads/2025/02/portrait-torrefacteur.jpg", alt: "Torréfacteur Zen Coffee Lab" };
  const fallbackImage = { src: "/media/home-hero-coffee-cherries.webp", alt: "Coffee cherries" };
  const shopPath = english ? "/en/shop" : "/boutique";
  return <><header className="page-hero"><p className="eyebrow">{english ? "Our approach" : "Notre démarche"}</p><h1>{content?.title ?? (english ? "Roast less. Reveal more." : "Torréfier moins. Révéler plus.")}</h1><p className="lede">{lede ?? (english ? "Zen Coffee Lab is a small independent roastery in Tours, born from a desire to make exceptional coffee both precise and approachable." : "Zen Coffee Lab est une micro-torréfaction indépendante à Tours, née de l’envie de rendre les cafés d’exception aussi précis qu’accessibles.")}</p></header>{content ? <EditorialStory content={content.blocks} images={[storyImages[0] ?? storyImages[1] ?? fallbackImage]} splitSections={false} /> : null}<EditorialStory content={paragraph2 ?? [defaults.body]} images={[storyImages[1] ?? storyImages[0] ?? fallbackImage]} imageFirst splitSections={false} /><div className="article-body advice-detail__body advice-detail__action"><Link className="text-link advice-detail__back" to={shopPath}>{english ? "Visit the shop" : "Visiter la boutique"}</Link></div></>;
}
