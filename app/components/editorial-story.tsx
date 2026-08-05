import { RichTextContent } from "~/components/rich-text-content";
import { paragraphsToRichTextDocument, storedBlocksToRichTextDocument, type RichTextDocument, type RichTextNode } from "~/lib/rich-text";

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

export function EditorialStory({ content, images, imageFirst = false }: { content: EditorialContent; images: StoryImage[]; imageFirst?: boolean }) {
  const blocks = sections(content);
  const fallback = { src: "/media/home-hero-coffee-cherries.jpg", alt: "Coffee cherries" };
  return <div className="product-story editorial-story">{blocks.map((block, index) => {
    const imageFirstForBlock = (index + (imageFirst ? 1 : 0)) % 2 === 1;
    const image = images[index % Math.max(images.length, 1)] ?? fallback;
    return <section className={`product-story-block${imageFirstForBlock ? " product-story-block--image-first" : ""}`} key={index}><div className="product-story-block__copy"><RichTextContent content={{ type: "doc", content: block }} /></div><figure className="product-story-block__media"><img src={image.src} alt={image.alt} width="750" height="830" loading="lazy" /></figure></section>;
  })}</div>;
}
