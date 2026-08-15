export type RichTextMark = {
  type: "bold" | "italic" | "underline" | "strike" | "code" | "link";
  attrs?: Record<string, unknown>;
};

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
};

export type RichTextDocument = RichTextNode & {
  type: "doc";
  content: RichTextNode[];
};

type StoredBlock = { type?: unknown; content?: unknown };

const allowedBlockTypes = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "contentTable",
  "contentAccordion",
]);
const allowedMarkTypes = new Set<RichTextMark["type"]>([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);

export function paragraphsToRichTextDocument(paragraphs: readonly string[]): RichTextDocument {
  return {
    type: "doc",
    content: paragraphs.filter(Boolean).map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}

export function storedBlocksToRichTextDocument(blocks?: readonly StoredBlock[] | null): RichTextDocument {
  const richText = blocks?.find((block) => block.type === "richText");
  const normalized = normalizeRichTextDocument(richText?.content);
  if (normalized) return normalized;

  return paragraphsToRichTextDocument(
    (blocks ?? [])
      .filter((block) => block.type === "paragraph" && typeof block.content === "string")
      .map((block) => String(block.content)),
  );
}

export function parseRichTextInput(value: string, minimumTextLength = 20): RichTextDocument | null {
  try {
    let parsed: unknown = JSON.parse(value);
    for (let depth = 0; depth < 4 && typeof parsed === "string"; depth += 1) parsed = JSON.parse(parsed);
    let document = normalizeRichTextDocument(parsed);
    for (let depth = 0; document && depth < 2; depth += 1) {
      const embeddedJson = document.content.length === 1 && document.content[0]?.type === "paragraph" && document.content[0].content?.length === 1 && document.content[0].content[0]?.type === "text" ? document.content[0].content[0].text : null;
      if (!embeddedJson?.trim().startsWith("{")) break;
      const embedded = normalizeRichTextDocument(JSON.parse(embeddedJson));
      if (!embedded) break;
      document = embedded;
    }
    if (!document || richTextPlainText(document).trim().length < minimumTextLength) return null;
    return document;
  } catch {
    return null;
  }
}

export function richTextPlainText(document: RichTextDocument): string {
  const read = (node: RichTextNode): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "contentAccordion") {
      const sections = Array.isArray(node.attrs?.sections) ? node.attrs.sections : [];
      const sectionText = sections.flatMap((section) => isRecord(section) ? [typeof section.subtitle === "string" ? section.subtitle : "", typeof section.body === "string" ? section.body : ""] : []).join(" ");
      return `${typeof node.attrs?.title === "string" ? node.attrs.title : ""} ${sectionText || (typeof node.attrs?.body === "string" ? node.attrs.body : "")}\n`;
    }
    if (node.type === "contentTable") return (Array.isArray(node.attrs?.rows) ? node.attrs.rows : []).flatMap((row) => Array.isArray(row) ? row : []).filter((cell): cell is string => typeof cell === "string").join(" ") + "\n";
    const text = (node.content ?? []).map(read).join("");
    return ["paragraph", "heading", "blockquote", "listItem", "codeBlock"].includes(node.type)
      ? `${text}\n`
      : text;
  };
  return read(document);
}

export function synchronizeRichTextLayout(source: RichTextDocument, target: RichTextDocument): RichTextDocument {
  const targetText = target.content.flatMap((node) => collectRichTextText(node));
  const targetSpecial = target.content.flatMap((node) => collectRichTextSpecialNodes(node));
  let textIndex = 0;
  let specialIndex = 0;
  const nextText = (fallback: string) => targetText[textIndex++] ?? fallback;
  const clone = (sourceNode: RichTextNode, targetNode?: RichTextNode): RichTextNode => {
    if (sourceNode.type === "text") {
      return { ...sourceNode, text: nextText(sourceNode.text ?? ""), marks: sourceNode.marks };
    }
    if (sourceNode.type === "contentTable") {
      const matchingTarget = targetSpecial[specialIndex++];
      const sourceRows = Array.isArray(sourceNode.attrs?.rows) ? sourceNode.attrs.rows : [];
      const targetRows = matchingTarget?.type === "contentTable" && Array.isArray(matchingTarget.attrs?.rows) ? matchingTarget.attrs.rows : targetNode?.type === "contentTable" && Array.isArray(targetNode.attrs?.rows) ? targetNode.attrs.rows : [];
      const targetTableText = targetRows.flatMap((row) => Array.isArray(row) ? row.filter((cell): cell is string => typeof cell === "string" && cell.trim().length > 0) : []);
      let tableTextIndex = 0;
      const rows = sourceRows.map((sourceRow, rowIndex) => (Array.isArray(sourceRow) ? sourceRow : []).map((_, columnIndex) => {
        const targetRow = Array.isArray(targetRows[rowIndex]) ? targetRows[rowIndex] : [];
        const fallbackTableText = targetTableText[tableTextIndex++];
        if (typeof targetRow[columnIndex] === "string" && targetRow[columnIndex].trim()) return targetRow[columnIndex];
        if (fallbackTableText) return fallbackTableText;
        return nextText("");
      }));
      return { type: "contentTable", attrs: { rows } } satisfies RichTextNode;
    }
    if (sourceNode.type === "contentAccordion") {
      const matchingTarget = targetSpecial[specialIndex++];
      const targetAttrs = matchingTarget?.type === "contentAccordion" ? matchingTarget.attrs : targetNode?.type === "contentAccordion" ? targetNode.attrs : undefined;
      const sourceSections = Array.isArray(sourceNode.attrs?.sections) ? sourceNode.attrs.sections : [];
      const targetSections = Array.isArray(targetAttrs?.sections) ? targetAttrs.sections : [];
      const translatedSections = sourceSections.length
        ? sourceSections.map((sourceSection, sectionIndex) => {
          const sourceValue = isRecord(sourceSection) ? sourceSection : {};
          const targetValue = isRecord(targetSections[sectionIndex]) ? targetSections[sectionIndex] : {};
          return {
            subtitle: typeof targetValue.subtitle === "string" ? targetValue.subtitle : typeof sourceValue.subtitle === "string" ? sourceValue.subtitle : "",
            body: typeof targetValue.body === "string" ? targetValue.body : typeof sourceValue.body === "string" ? sourceValue.body : "",
            bodyDocument: typeof targetValue.bodyDocument === "string" ? targetValue.bodyDocument : typeof sourceValue.bodyDocument === "string" ? sourceValue.bodyDocument : null,
          };
        })
        : null;
      const firstSection = translatedSections?.[0];
      return {
        type: "contentAccordion",
        attrs: {
          title: typeof targetAttrs?.title === "string" ? targetAttrs.title : typeof sourceNode.attrs?.title === "string" ? sourceNode.attrs.title : "Read more",
          subtitle: firstSection?.subtitle ?? (typeof targetAttrs?.subtitle === "string" ? targetAttrs.subtitle : typeof sourceNode.attrs?.subtitle === "string" ? sourceNode.attrs.subtitle : ""),
          body: firstSection?.body ?? (typeof targetAttrs?.body === "string" ? targetAttrs.body : typeof sourceNode.attrs?.body === "string" ? sourceNode.attrs.body : targetNode ? richTextPlainText({ type: "doc", content: [targetNode] }).trim() : nextText("")),
          bodyDocument: firstSection?.bodyDocument ?? (typeof targetAttrs?.bodyDocument === "string" ? targetAttrs.bodyDocument : typeof sourceNode.attrs?.bodyDocument === "string" ? sourceNode.attrs.bodyDocument : null),
          sections: translatedSections ?? (Array.isArray(targetAttrs?.sections) ? targetAttrs.sections : null),
        },
      } satisfies RichTextNode;
    }
    const content = sourceNode.content?.map((child, index) => clone(child, targetNode?.content?.[index]))
      ?? (sourceNode.type === "text" ? undefined : sourceNode.content);
    return { ...sourceNode, ...(content ? { content } : {}) };
  };
  return { ...source, content: source.content.map((node, index) => clone(node, target.content[index])) };
}

function collectRichTextText(node: RichTextNode): string[] {
  if (node.type === "text") return [node.text ?? ""];
  if (node.type === "contentTable" || node.type === "contentAccordion") return [];
  return node.content?.flatMap(collectRichTextText) ?? [];
}

function collectRichTextSpecialNodes(node: RichTextNode): RichTextNode[] {
  if (node.type === "contentTable" || node.type === "contentAccordion") return [node];
  return node.content?.flatMap(collectRichTextSpecialNodes) ?? [];
}

function normalizeRichTextDocument(value: unknown): RichTextDocument | null {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) return null;
  const budget = { nodes: 0 };
  const content = value.content
    .map((node) => normalizeNode(node, 0, budget))
    .filter((node): node is RichTextNode => Boolean(node));
  return { type: "doc", content };
}

function normalizeNode(value: unknown, depth: number, budget: { nodes: number }): RichTextNode | null {
  if (!isRecord(value) || typeof value.type !== "string" || depth > 12 || ++budget.nodes > 5_000) return null;
  if (value.type === "text") {
    if (typeof value.text !== "string") return null;
    return {
      type: "text",
      text: value.text.slice(0, 50_000),
      marks: normalizeMarks(value.marks),
    };
  }
  if (!allowedBlockTypes.has(value.type)) return null;

  const node: RichTextNode = { type: value.type };
  if (value.type === "heading") {
    const level = isRecord(value.attrs) && (value.attrs.level === 2 || value.attrs.level === 3) ? value.attrs.level : 2;
    node.attrs = { level };
  } else if (value.type === "orderedList") {
    const start = isRecord(value.attrs) && typeof value.attrs.start === "number" ? Math.max(1, Math.floor(value.attrs.start)) : 1;
    node.attrs = { start };
  } else if (value.type === "contentTable") {
    const rows = isRecord(value.attrs) && Array.isArray(value.attrs.rows) ? value.attrs.rows : [];
    node.attrs = { rows: rows.slice(0, 30).flatMap((row) => Array.isArray(row) ? [row.slice(0, 12).map((cell) => typeof cell === "string" ? cell.slice(0, 500) : "")] : []) };
  } else if (value.type === "contentAccordion") {
    const attrs = isRecord(value.attrs) ? value.attrs : {};
    const rawBody = typeof attrs.body === "string" ? attrs.body.slice(0, 10_000) : "";
    const embeddedBody = rawBody.trim().startsWith("{") ? parseRichTextInput(rawBody, 0) : null;
    const sections = Array.isArray(attrs.sections) ? attrs.sections.slice(0, 30).flatMap((section) => {
      if (!isRecord(section)) return [];
      const sectionBody = typeof section.body === "string" ? section.body.slice(0, 10_000) : "";
      const embeddedSectionBody = sectionBody.trim().startsWith("{") ? parseRichTextInput(sectionBody, 0) : null;
      return [{
        subtitle: typeof section.subtitle === "string" ? section.subtitle.slice(0, 300) : "",
        body: embeddedSectionBody ? richTextPlainText(embeddedSectionBody).trim() : sectionBody,
        bodyDocument: typeof section.bodyDocument === "string" ? section.bodyDocument.slice(0, 50_000) : embeddedSectionBody ? JSON.stringify(embeddedSectionBody) : null,
      }];
    }) : [];
    node.attrs = {
      title: typeof attrs.title === "string" ? attrs.title.slice(0, 300) : "",
      subtitle: typeof attrs.subtitle === "string" ? attrs.subtitle.slice(0, 300) : "",
      body: embeddedBody ? richTextPlainText(embeddedBody).trim() : rawBody,
      bodyDocument: typeof attrs.bodyDocument === "string" ? attrs.bodyDocument.slice(0, 50_000) : embeddedBody ? JSON.stringify(embeddedBody) : null,
      sections: sections.length ? sections : null,
    };
  }
  if (Array.isArray(value.content)) {
    node.content = value.content
      .map((child) => normalizeNode(child, depth + 1, budget))
      .filter((child): child is RichTextNode => Boolean(child));
  }
  return node;
}

function normalizeMarks(value: unknown): RichTextMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks = value.flatMap((mark): RichTextMark[] => {
    if (!isRecord(mark) || typeof mark.type !== "string" || !allowedMarkTypes.has(mark.type as RichTextMark["type"])) return [];
    const type = mark.type as RichTextMark["type"];
    if (type !== "link") return [{ type }];
    const href = isRecord(mark.attrs) && typeof mark.attrs.href === "string" ? safeHref(mark.attrs.href) : null;
    return href ? [{ type, attrs: { href } }] : [];
  });
  return marks.length ? marks : undefined;
}

export function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href) || (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#")) return href.slice(0, 2_000);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
