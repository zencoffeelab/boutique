import { ArrowRight } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useEffect } from "react";
import { EditorialStory } from "~/components/editorial-story";
import { RichTextContent } from "~/components/rich-text-content";
import { getArticles, getProducts } from "~/lib/catalog.server";
import { requireAdmin } from "~/lib/auth.server";
import { getLocale } from "~/lib/i18n";
import { parseRichTextInput } from "~/lib/rich-text";
import { pageMeta } from "~/lib/seo";
import { firstSentence } from "~/lib/utils";

type AdviceElement = "introText" | "introImage" | "bodyText" | "bodyImage" | "body2Text" | "body2Image";
type AdviceCompartment = "title" | "text" | "image" | "textImage" | "imageText";
type AdviceLayoutItem = { id: string; compartment: AdviceCompartment; element?: AdviceElement; customId?: string; label?: string };
type AdviceCustomItem = { id: string; type: "text" | "image"; textFr?: string; textEn?: string; imageUrl?: string; imageAltFr?: string; imageAltEn?: string };
type AdviceLayout = { items: AdviceLayoutItem[]; elements: AdviceElement[]; slots: Array<{ text: "intro" | "body" | "body2"; image: "intro" | "body" | "body2" }>; customItems: AdviceCustomItem[]; customText?: Record<string, string>; shortIntroFr?: string; shortIntroEn?: string };
const defaultAdviceLayout: AdviceLayout = { items: [{ id: "title", compartment: "title" }, { id: "intro-text", compartment: "text", element: "introText" }, { id: "intro-image", compartment: "image", element: "introImage" }, { id: "body-pair", compartment: "textImage", element: "bodyText" }, { id: "body2-pair", compartment: "imageText", element: "body2Text" }], elements: ["introText", "introImage", "bodyText", "bodyImage", "body2Text", "body2Image"], slots: [{ text: "intro", image: "intro" }, { text: "body", image: "body" }, { text: "body2", image: "body2" }], customItems: [] };
function adviceLayout(value: unknown): AdviceLayout {
  if (!value || typeof value !== "object" || !Array.isArray((value as { slots?: unknown }).slots)) return defaultAdviceLayout;
  const slots = (value as { slots: unknown[] }).slots.filter((slot): slot is { text: "intro" | "body" | "body2"; image: "intro" | "body" | "body2" } => Boolean(slot && typeof slot === "object" && ["intro", "body", "body2"].includes(String((slot as { text?: unknown }).text)) && ["intro", "body", "body2"].includes(String((slot as { image?: unknown }).image))));
  const normalizedSlots = slots.length === 2 ? [{ text: "intro" as const, image: "intro" as const }, ...slots] : slots;
  const legacyElements = normalizedSlots.flatMap((slot) => [`${slot.text}Text`, `${slot.image}Image`] as AdviceElement[]);
  const rawElements = (value as { elements?: unknown }).elements;
  const elements = Array.isArray(rawElements) ? [...new Set([...rawElements.filter((item): item is AdviceElement => ["introText", "introImage", "bodyText", "bodyImage", "body2Text", "body2Image"].includes(String(item))), ...defaultAdviceLayout.elements])] : [...new Set(legacyElements)];
  const rawItems = (value as { customItems?: unknown }).customItems;
  const customItems = Array.isArray(rawItems) ? rawItems.filter((item): item is AdviceCustomItem => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && ((item as { type?: unknown }).type === "text" || (item as { type?: unknown }).type === "image"))).map((item) => ({ id: item.id, type: item.type, textFr: typeof item.textFr === "string" ? item.textFr : "", textEn: typeof item.textEn === "string" ? item.textEn : "", imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "", imageAltFr: typeof item.imageAltFr === "string" ? item.imageAltFr : "", imageAltEn: typeof item.imageAltEn === "string" ? item.imageAltEn : "" })) : [];
  const customText = value && typeof value === "object" && value && typeof (value as { customText?: unknown }).customText === "object" ? (value as { customText: Record<string, string> }).customText : undefined;
  const shortIntroFr = typeof (value as { shortIntroFr?: unknown }).shortIntroFr === "string" ? (value as { shortIntroFr: string }).shortIntroFr : "";
  const shortIntroEn = typeof (value as { shortIntroEn?: unknown }).shortIntroEn === "string" ? (value as { shortIntroEn: string }).shortIntroEn : "";
  const layoutRawItems = (value as { items?: unknown }).items;
  const items = Array.isArray(layoutRawItems) ? layoutRawItems.filter((item): item is AdviceLayoutItem => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && ["title", "text", "image", "textImage", "imageText"].includes(String((item as { compartment?: unknown }).compartment)))).map((item) => ({ id: item.id, compartment: item.compartment, element: ["introText", "introImage", "bodyText", "bodyImage", "body2Text", "body2Image"].includes(String(item.element)) ? item.element : undefined, customId: typeof item.customId === "string" ? item.customId : undefined, label: typeof item.label === "string" ? item.label : undefined })) : defaultAdviceLayout.items;
  return normalizedSlots.length === 3 ? { items: items.length ? items : defaultAdviceLayout.items, elements, slots: normalizedSlots, customItems, customText, shortIntroFr, shortIntroEn } : defaultAdviceLayout;
}

function AdviceStory({ article, locale, storyImages }: { article: Awaited<ReturnType<typeof loader>>["article"]; locale: "fr-FR" | "en-GB"; storyImages: Array<{ src: string; alt: string }> }) {
  const layout = adviceLayout((article.story[locale] as typeof article.story["fr-FR"] & { layoutConfig?: unknown }).layoutConfig);
  const texts: Partial<Record<AdviceElement, typeof article.body["fr-FR"]>> = { introText: article.excerptBody?.[locale] ?? [article.excerpt[locale]], bodyText: article.body[locale], body2Text: article.body2?.[locale] };
  const story = article.story[locale];
  const images: Partial<Record<AdviceElement, { src: string; alt: string }>> = {
    introImage: story.introImageUrl ? { src: story.introImageUrl, alt: story.introImageAlt ?? "Coffee" } : (storyImages[0] ?? { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" }),
    bodyImage: story.bodyImageUrl ? { src: story.bodyImageUrl, alt: story.bodyImageAlt ?? "Coffee" } : (storyImages[0] ?? { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" }),
    body2Image: story.body2ImageUrl ? { src: story.body2ImageUrl, alt: story.body2ImageAlt ?? "Coffee" } : (storyImages[1] ?? storyImages[0] ?? { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" }),
  };
  const renderItem = (item: AdviceLayoutItem) => {
    if (item.compartment === "title") return null;
    const customItem = item.customId ? layout.customItems.find((custom) => custom.id === item.customId) : undefined;
    if (item.compartment === "text" && item.customId && customItem) return <div className="advice-story__text" key={item.id}><RichTextContent content={[layout.customText?.[customItem.id] ?? (locale === "fr-FR" ? customItem.textFr : customItem.textEn) ?? ""]} /></div>;
    if (item.compartment === "image" && item.customId && customItem?.imageUrl) return <figure className="advice-story__image" key={item.id}><img src={customItem.imageUrl} alt={locale === "fr-FR" ? customItem.imageAltFr ?? "" : customItem.imageAltEn ?? ""} /></figure>;
    if (item.compartment === "text" && item.element && texts[item.element]) return <div className="advice-story__text" key={item.id}><RichTextContent content={texts[item.element]!} /></div>;
    if (item.compartment === "image" && item.element && images[item.element]) return <figure className="advice-story__image" key={item.id}><img src={images[item.element]!.src} alt={images[item.element]!.alt} /></figure>;
    if (item.compartment === "textImage") return <EditorialStory key={item.id} content={texts.bodyText ?? []} images={[images.bodyImage ?? { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" }]} splitSections={false} />;
    if (item.compartment === "imageText") return <EditorialStory key={item.id} content={texts.body2Text ?? []} images={[images.body2Image ?? { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" }]} imageFirst splitSections={false} />;
    return null;
  };
  const placedCustomIds = new Set(layout.items.map((item) => item.customId).filter(Boolean));
  return <div className="advice-story">{layout.items.map(renderItem)}{layout.customItems.filter((item) => !placedCustomIds.has(item.id)).map((item) => item.type === "text" ? <div className="advice-story__text" key={item.id}><RichTextContent content={[layout.customText?.[item.id] ?? (locale === "fr-FR" ? item.textFr : item.textEn) ?? ""]} /></div> : item.imageUrl ? <figure className="advice-story__image" key={item.id}><img src={item.imageUrl} alt={locale === "fr-FR" ? item.imageAltFr ?? "" : item.imageAltEn ?? ""} /></figure> : null)}</div>;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const locale = getLocale(request);
  const preview = new URL(request.url).searchParams.has("preview");
  if (preview) await requireAdmin(request);
  const [articles, products] = await Promise.all([getArticles({ includeUnpublished: preview }), getProducts({ status: "published", availableOnly: false })]);
  const article = articles.find((item) => item.slug === params.slug);
  if (!article) throw new Response(locale === "fr-FR" ? "Article introuvable" : "Article not found", { status: 404 });
  const relatedArticles = articles.filter((item) => item.slug !== article.slug).slice(0, 3);
  return { locale, article, relatedArticles, storyImages: products.flatMap((product) => product.media.slice(0, 1).map((media) => ({ src: media.url, alt: media.alt[locale] }))) };
}
export function headers() { return { "Cache-Control": "no-store" }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => data ? pageMeta(`${data.article.title[data.locale]} | Blog Zen Coffee Lab`, data.article.excerpt[data.locale], `${data.locale === "en-GB" ? "/en/tips" : "/conseils"}/${data.article.slug}`) : [];
export default function AdviceDetail() {
  const { locale, article, relatedArticles, storyImages } = useLoaderData<typeof loader>();
  const english = locale === "en-GB";
  const advicePath = english ? "/en/tips" : "/conseils";
  const shopPath = english ? "/en/shop" : "/boutique";
  useEffect(() => {
    document.documentElement.classList.add("advice-detail-overflow-hidden");
    document.body.classList.add("advice-detail-overflow-hidden");
    return () => {
      document.documentElement.classList.remove("advice-detail-overflow-hidden");
      document.body.classList.remove("advice-detail-overflow-hidden");
    };
  }, []);
  return <article className="advice-detail-page">
    <header className="page-hero advice-detail__top"><p className="eyebrow">{new Date(article.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p><h1>{article.title[locale]}</h1><p className="lede advice-detail__intro">{(() => { const value = adviceLayout((article.story[locale] as typeof article.story["fr-FR"] & { layoutConfig?: unknown }).layoutConfig)[english ? "shortIntroEn" : "shortIntroFr"] || article.excerpt[locale]; return typeof value === "string" && value.trim().startsWith("{") ? <RichTextContent content={parseRichTextInput(value, 0) ?? [value]} /> : value; })()}</p></header>
    <AdviceStory article={article} locale={locale} storyImages={storyImages} />
    <div className="article-body advice-detail__body advice-detail__action"><Link className="button button--ghost advice-detail__back" to={shopPath}>{english ? "Visit the shop" : "Visiter la boutique"}<ArrowRight aria-hidden="true" /></Link></div>
    {relatedArticles.length ? <section className="advice-related" aria-labelledby="advice-related-title">
      <div className="page-shell">
        <div className="section-header">
          <div><p className="eyebrow">{english ? "Keep exploring" : "Continuer la lecture"}</p><h2 id="advice-related-title">{english ? "More coffee articles" : "D’autres articles du blog"}</h2></div>
          <Link className="button button--ghost" to={advicePath}>{english ? "All blog articles" : "Tout le blog"}<ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="advice-related__grid">
          {relatedArticles.map((relatedArticle) => <article className="article-card" key={relatedArticle.slug}>
            <p className="eyebrow">{new Date(relatedArticle.publishedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</p>
            <h2>{relatedArticle.title[locale]}</h2>
            <p>{firstSentence(relatedArticle.excerpt[locale])}</p>
            <Link className="text-link" to={`${advicePath}/${relatedArticle.slug}`}>{english ? "Read the guide" : "Lire le guide"}<ArrowRight aria-hidden="true" /></Link>
          </article>)}
        </div>
      </div>
    </section> : null}
  </article>;
}
