import type { ReactNode } from "react";
import { RichTextContent } from "~/components/rich-text-content";
import { storedBlocksToRichTextDocument } from "~/lib/rich-text";

export function ContentBlocks({
  blocks,
  footer,
}: {
  blocks?: Array<{ type?: unknown; content?: unknown }> | null;
  footer?: ReactNode;
}) {
  const document = storedBlocksToRichTextDocument(blocks);
  if (!document.content.length) return null;
  return <section className="article-body cms-content" aria-label="Contenu éditorial">
    <RichTextContent content={document} />
    {footer ? <div className="cms-content__footer">{footer}</div> : null}
  </section>;
}
