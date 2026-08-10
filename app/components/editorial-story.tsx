import { RichTextContent } from "~/components/rich-text-content";
import { paragraphsToRichTextDocument, storedBlocksToRichTextDocument, type RichTextDocument, type RichTextNode } from "~/lib/rich-text";
import { useLayoutEffect, useRef } from "react";

type StoryImage = { src: string; alt: string };

type EditorialContent = RichTextDocument | readonly string[] | Array<{ type?: unknown; content?: unknown }>;

function sections(content: EditorialContent) {
  const document: RichTextDocument = Array.isArray(content) && content.every((item) => typeof item === "string")
    ? paragraphsToRichTextDocument(content)
    : Array.isArray(content)
      ? storedBlocksToRichTextDocument(content)
      : content as RichTextDocument;
  return document.content.reduce<RichTextNode[][]>((result, node, index) => {
    if (node.type === "heading" || !result.length || (!document.content.some((item) => item.type === "heading") && index % 2 === 0)) result.push([]);
    result.at(-1)?.push(node);
    return result;
  }, []);
}

export function EditorialStory({ content, images, imageFirst = false, splitSections = true, lockBlockSize = false, heightBuffer = 0 }: { content: EditorialContent; images: StoryImage[]; imageFirst?: boolean; splitSections?: boolean; lockBlockSize?: boolean; heightBuffer?: number }) {
  const document: RichTextDocument = Array.isArray(content) && content.every((item) => typeof item === "string")
    ? paragraphsToRichTextDocument(content)
    : Array.isArray(content)
      ? storedBlocksToRichTextDocument(content)
      : content as RichTextDocument;
  const blocks = splitSections ? sections(content) : [document.content];
  const storyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!lockBlockSize || !storyRef.current) return;
    let secondFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
      storyRef.current?.querySelectorAll<HTMLElement>(".product-story-block").forEach((block) => {
        const copy = block.querySelector<HTMLElement>(".product-story-block__copy");
        const content = copy?.querySelector<HTMLElement>(".rich-text-content");
        const media = block.querySelector<HTMLElement>(".product-story-block__media");
        if (!copy || !content || !media) return;
        if (window.matchMedia("(max-width: 900px)").matches) {
          block.style.height = "auto";
          return;
        }
        // Repartir d'une mesure naturelle : ni une réservation précédente du
        // tiroir, ni la hauteur intrinsèque de l'image ne doit être comptée.
        const previousMediaHeight = media.style.height;
        const previousMediaMinHeight = media.style.minHeight;
        const previousMediaVisibility = media.style.visibility;
        block.style.height = "auto";
        media.style.height = "0px";
        media.style.minHeight = "0";
        media.style.visibility = "hidden";
        copy.style.height = "auto";
        content.style.removeProperty("min-height");
        const measurements = Array.from(content.querySelectorAll<HTMLElement>("[data-rich-accordion-measure]"));
        const previousDisplays = measurements.map((item) => item.style.display);
        measurements.forEach((item) => { item.style.display = "none"; });
        const naturalContentHeight = content.scrollHeight;
        const openBody = content.querySelector<HTMLElement>(".rich-text-accordion.is-open .rich-text-accordion__body")?.getBoundingClientRect().height ?? 0;
        measurements.forEach((item, index) => { item.style.display = previousDisplays[index] ?? ""; });
        const longestDrawer = Math.max(0, ...measurements.map((item) => item.getBoundingClientRect().height));
        const contentHeight = openBody > 0
          ? naturalContentHeight - openBody + longestDrawer
          : naturalContentHeight;
        content.style.minHeight = `${contentHeight}px`;
        const copyStyle = window.getComputedStyle(copy);
        const copyPadding = Number.parseFloat(copyStyle.paddingTop) + Number.parseFloat(copyStyle.paddingBottom);
        const blockStyle = window.getComputedStyle(block);
        const blockBorder = Number.parseFloat(blockStyle.borderBottomWidth) || 0;
        // Après réactivation des mesures, reprendre la hauteur réellement
        // rendue afin qu'aucun texte ne soit coupé par un arrondi ou un
        // changement de retour à la ligne.
        content.style.minHeight = `${contentHeight}px`;
        block.style.height = `${contentHeight + copyPadding + blockBorder + heightBuffer}px`;
        block.style.minHeight = "0";
        media.style.height = previousMediaHeight;
        media.style.minHeight = previousMediaMinHeight;
        media.style.visibility = previousMediaVisibility;
      });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [lockBlockSize]);
  const fallback = { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" };
  return <div ref={storyRef} className="product-story editorial-story">{blocks.map((block, index) => {
    const imageFirstForBlock = (index + (imageFirst ? 1 : 0)) % 2 === 1;
    const image = images[index % Math.max(images.length, 1)] ?? fallback;
    return <section className={`product-story-block${imageFirstForBlock ? " product-story-block--image-first" : ""}`} key={index}><div className="product-story-block__copy"><RichTextContent content={{ type: "doc", content: block }} /></div><figure className="product-story-block__media"><img src={image.src} alt={image.alt} width="750" height="830" loading="lazy" /></figure></section>;
  })}</div>;
}
