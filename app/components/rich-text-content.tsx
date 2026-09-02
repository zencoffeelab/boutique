import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { RichTextDocument, RichTextMark, RichTextNode } from "~/lib/rich-text";
import { paragraphsToRichTextDocument, parseRichTextInput, safeHref } from "~/lib/rich-text";

export function RichTextContent({ content, tableLineBreaks = [] }: { content: RichTextDocument | readonly string[]; tableLineBreaks?: readonly string[] }) {
  const document: RichTextDocument = Array.isArray(content)
    ? paragraphsToRichTextDocument(content)
    : content as RichTextDocument;
  const firstAccordionIndex = document.content.findIndex((node) => node.type === "contentAccordion");
  const [openAccordion, setOpenAccordion] = useState<string | null>(firstAccordionIndex >= 0 ? `contentAccordion-${firstAccordionIndex}` : null);
  const [openAccordionSection, setOpenAccordionSection] = useState<string | null>(null);
  const accordionState = { openAccordion, setOpenAccordion, openAccordionSection, setOpenAccordionSection };
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.style.removeProperty("min-height");
  }, [document, openAccordion]);
  const accordionBodies = document.content.filter((node) => node.type === "contentAccordion").flatMap((node) => accordionSections(node).map((section) => accordionBodyDocument(section.bodyDocument ?? section.body)));
  return <div ref={contentRef} className="rich-text-content">{document.content.map((node, index) => renderNode(node, index, accordionState, tableLineBreaks))}{accordionBodies.map((body, index) => <div className="rich-text-accordion-measure" data-rich-accordion-measure key={`accordion-measure-${index}`}>{body.content.map((node, nodeIndex) => renderNode(node, nodeIndex, accordionState, tableLineBreaks))}</div>)}</div>;
}

function accordionBodyDocument(body: string): RichTextDocument {
  return parseRichTextInput(body, 0) ?? paragraphsToRichTextDocument([body]);
}

function accordionSections(node: RichTextNode) {
  const rawSections = Array.isArray(node.attrs?.sections) && node.attrs.sections.length
    ? node.attrs.sections
    : [{ subtitle: node.attrs?.subtitle, body: node.attrs?.body, bodyDocument: node.attrs?.bodyDocument }];
  return rawSections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const value = section as Record<string, unknown>;
    return [{
      subtitle: typeof value.subtitle === "string" ? value.subtitle : "",
      body: typeof value.body === "string" ? value.body : "",
      bodyDocument: typeof value.bodyDocument === "string" ? value.bodyDocument : null,
    }];
  });
}

type AccordionState = { openAccordion: string | null; setOpenAccordion: (key: string | null) => void; openAccordionSection: string | null; setOpenAccordionSection: (key: string | null) => void };

function renderNode(node: RichTextNode, index: number, accordionState?: AccordionState, tableLineBreaks: readonly string[] = []): ReactNode {
  const key = `${node.type}-${index}`;
  if (node.type === "text") return <Fragment key={key}>{node.marks?.length ? renderMarks(node.text ?? "", node.marks, key) : renderInlineLinks(node.text ?? "", key)}</Fragment>;
  const children = node.content?.map((child, childIndex) => renderNode(child, childIndex, accordionState, tableLineBreaks)) ?? null;
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
      return <table className="rich-text-table" key={key}><tbody>{rows.map((row, rowIndex) => <tr key={`${key}-row-${rowIndex}`}>{(Array.isArray(row) ? row : []).map((cell, cellIndex) => rowIndex === 0 ? <th key={`${key}-${rowIndex}-${cellIndex}`}>{renderTableCell(String(cell ?? ""), `${key}-${rowIndex}-${cellIndex}`, tableLineBreaks)}</th> : <td key={`${key}-${rowIndex}-${cellIndex}`}>{renderTableCell(String(cell ?? ""), `${key}-${rowIndex}-${cellIndex}`, tableLineBreaks)}</td>)}</tr>)}</tbody></table>;
    }
    case "contentAccordion": {
      const open = accordionState?.openAccordion === key;
      const sections = accordionSections(node);
      const hasMultipleSections = sections.length > 1;
      const accordionOpen = hasMultipleSections || open;
      const wideOnMobile = /pour aller encore plus loin|go even further/i.test(String(node.attrs?.title ?? ""));
      const title = <span className="rich-text-accordion__title">{renderInlineLinks(String(node.attrs?.title ?? ""), `${key}-title`)}</span>;
      const titleHeader = hasMultipleSections
        ? <summary className="rich-text-accordion__trigger" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>{title}</summary>
        : <summary className="rich-text-accordion__trigger" onClick={(event) => { event.preventDefault(); event.stopPropagation(); accordionState?.setOpenAccordion(open ? null : key); }}>{title}</summary>;
      return <details className={`rich-text-accordion${accordionOpen ? " is-open" : ""}${hasMultipleSections ? " has-multiple-sections" : ""}${wideOnMobile ? " rich-text-accordion--mobile-wide" : ""}`} key={key} open={accordionOpen}>{titleHeader}{accordionOpen ? <div className="rich-text-accordion__body">{sections.map((section, sectionIndex) => { const body = accordionBodyDocument(section.bodyDocument ?? section.body); const sectionKey = `${key}-section-${sectionIndex}`; const sectionOpen = accordionState?.openAccordionSection === sectionKey; return <details className={`rich-text-accordion__section${sectionOpen ? " is-open" : ""}`} key={sectionKey} open={sectionOpen}><summary className="rich-text-accordion__subtitle" onClick={(event) => { event.preventDefault(); event.stopPropagation(); accordionState?.setOpenAccordionSection(sectionOpen ? null : sectionKey); }}>{section.subtitle ? renderInlineLinks(section.subtitle, `${sectionKey}-subtitle`) : `Sous-titre ${sectionIndex + 1}`}</summary>{sectionOpen ? <div className="rich-text-accordion__section-body">{body.content.map((child, childIndex) => renderNode(child, childIndex, accordionState, tableLineBreaks))}</div> : null}</details>; })}</div> : null}</details>;
    }
    default: return null;
  }
}

function renderTableCell(value: string, key: string, lineBreaks: readonly string[]): ReactNode {
  const lineBreak = lineBreaks.find((candidate) => value === `Jusqu'à ${candidate}` || value === `Up to ${candidate}`);
  if (!lineBreak) return renderInlineLinks(value, key);
  return <>{value.slice(0, -lineBreak.length).trimEnd()}<br className="rich-text-table__mobile-break" />{lineBreak}</>;
}

function renderInlineLinks(text: string, key: string): ReactNode {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const href = safeHref(match[2]);
    parts.push(href ? <a key={`${key}-link-${index}`} href={href} rel="noopener noreferrer">{match[1]}</a> : match[0]);
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (!parts.length) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
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
