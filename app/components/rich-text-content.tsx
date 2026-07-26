import { Fragment, type ReactNode } from "react";
import type { RichTextDocument, RichTextMark, RichTextNode } from "~/lib/rich-text";
import { paragraphsToRichTextDocument, safeHref } from "~/lib/rich-text";

export function RichTextContent({ content }: { content: RichTextDocument | readonly string[] }) {
  const document: RichTextDocument = Array.isArray(content)
    ? paragraphsToRichTextDocument(content)
    : content as RichTextDocument;
  return <div className="rich-text-content">{document.content.map(renderNode)}</div>;
}

function renderNode(node: RichTextNode, index: number): ReactNode {
  const key = `${node.type}-${index}`;
  if (node.type === "text") return <Fragment key={key}>{renderMarks(node.text ?? "", node.marks ?? [], key)}</Fragment>;
  const children = node.content?.map(renderNode) ?? null;
  switch (node.type) {
    case "paragraph": return <p key={key}>{children}</p>;
    case "heading": return node.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": return <ol key={key} start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined}>{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "codeBlock": return <pre key={key}><code>{children}</code></pre>;
    case "horizontalRule": return <hr key={key} />;
    case "hardBreak": return <br key={key} />;
    default: return null;
  }
}

function renderMarks(text: string, marks: RichTextMark[], key: string): ReactNode {
  return marks.reduce<ReactNode>((content, mark, index) => {
    const markKey = `${key}-${mark.type}-${index}`;
    switch (mark.type) {
      case "bold": return <strong key={markKey}>{content}</strong>;
      case "italic": return <em key={markKey}>{content}</em>;
      case "underline": return <u key={markKey}>{content}</u>;
      case "strike": return <s key={markKey}>{content}</s>;
      case "code": return <code key={markKey}>{content}</code>;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? safeHref(mark.attrs.href) : null;
        return href ? <a key={markKey} href={href} rel="noopener noreferrer">{content}</a> : content;
      }
      default: return content;
    }
  }, text);
}
