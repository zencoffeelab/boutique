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
    const document = normalizeRichTextDocument(JSON.parse(value));
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
    const text = (node.content ?? []).map(read).join("");
    return ["paragraph", "heading", "blockquote", "listItem", "codeBlock"].includes(node.type)
      ? `${text}\n`
      : text;
  };
  return read(document);
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
