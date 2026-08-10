import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { RichTextDocument, RichTextMark, RichTextNode } from "~/lib/rich-text";
import { paragraphsToRichTextDocument, safeHref } from "~/lib/rich-text";

export function RichTextContent({ content }: { content: RichTextDocument | readonly string[] }) {
  const document: RichTextDocument = Array.isArray(content)
    ? paragraphsToRichTextDocument(content)
    : content as RichTextDocument;
  const firstAccordionIndex = document.content.findIndex((node) => node.type === "contentAccordion");
  const [openAccordion, setOpenAccordion] = useState<string | null>(firstAccordionIndex >= 0 ? `contentAccordion-${firstAccordionIndex}` : null);
  const accordionState = { openAccordion, setOpenAccordion };
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.style.removeProperty("min-height");
  }, [document, openAccordion]);
  const accordionBodies = document.content.filter((node) => node.type === "contentAccordion").map((node) => String(node.attrs?.body ?? ""));
  return <div ref={contentRef} className="rich-text-content">{document.content.map((node, index) => renderNode(node, index, accordionState))}{accordionBodies.map((body, index) => <div className="rich-text-accordion-measure" data-rich-accordion-measure key={`accordion-measure-${index}`}><p>{body}</p></div>)}</div>;
}

type AccordionState = { openAccordion: string | null; setOpenAccordion: (key: string | null) => void };

function renderNode(node: RichTextNode, index: number, accordionState?: AccordionState): ReactNode {
  const key = `${node.type}-${index}`;
  if (node.type === "text") return <Fragment key={key}>{renderMarks(node.text ?? "", node.marks ?? [], key)}</Fragment>;
  const children = node.content?.map((child, childIndex) => renderNode(child, childIndex, accordionState)) ?? null;
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
    case "contentTable": {
      const rows = Array.isArray(node.attrs?.rows) ? node.attrs.rows : [];
      return <table className="rich-text-table" key={key}><tbody>{rows.map((row, rowIndex) => <tr key={`${key}-row-${rowIndex}`}>{(Array.isArray(row) ? row : []).map((cell, cellIndex) => rowIndex === 0 ? <th key={`${key}-${rowIndex}-${cellIndex}`}>{String(cell ?? "")}</th> : <td key={`${key}-${rowIndex}-${cellIndex}`}>{String(cell ?? "")}</td>)}</tr>)}</tbody></table>;
    }
    case "contentAccordion": {
      const open = accordionState?.openAccordion === key;
      return <div className={`rich-text-accordion${open ? " is-open" : ""}`} key={key}><button type="button" className="rich-text-accordion__trigger" aria-expanded={open} onMouseDown={(event) => { event.preventDefault(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); accordionState?.setOpenAccordion(open ? null : key); }}>{String(node.attrs?.title ?? "")}</button>{open ? <p className="rich-text-accordion__body">{String(node.attrs?.body ?? "")}</p> : null}</div>;
    }
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
