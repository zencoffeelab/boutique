import { RichTextContent } from "~/components/rich-text-content";
import { storedBlocksToRichTextDocument } from "~/lib/rich-text";

export function ContentBlocks({ blocks }: { blocks?: Array<{ type?: unknown; content?: unknown }> | null }) {
  const document = storedBlocksToRichTextDocument(blocks);
  if (!document.content.length) return null;
  return <section className="article-body cms-content" aria-label="Contenu éditorial">
    <RichTextContent content={document} />
  </section>;
}
