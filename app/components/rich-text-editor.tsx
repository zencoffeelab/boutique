import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
  Table2,
  ChevronsUpDown,
} from "lucide-react";
import { Node, type Editor } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { parseRichTextInput, synchronizeRichTextLayout, type RichTextDocument } from "~/lib/rich-text";

type RichTextEditorProps = {
  name: string;
  initialContent: RichTextDocument;
  disabled?: boolean;
  label: string;
};

type RichTextBlockClipboard = {
  type: "contentTable" | "contentAccordion";
  attrs: Record<string, unknown>;
};

const richTextClipboardPrefix = "zen-coffee-lab:rich-text-block:";
let lastCopiedRichTextBlock: RichTextBlockClipboard | null = null;

function copyRichTextBlock(block: RichTextBlockClipboard) {
  lastCopiedRichTextBlock = block;
  const serialized = `${richTextClipboardPrefix}${JSON.stringify(block)}`;
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(serialized).catch(() => undefined);
}

function readRichTextBlock(value: string): RichTextBlockClipboard | null {
  if (!value.startsWith(richTextClipboardPrefix)) return null;
  try {
    const parsed = JSON.parse(value.slice(richTextClipboardPrefix.length)) as Partial<RichTextBlockClipboard>;
    if ((parsed.type !== "contentTable" && parsed.type !== "contentAccordion") || !parsed.attrs || typeof parsed.attrs !== "object") return null;
    return { type: parsed.type, attrs: parsed.attrs as Record<string, unknown> };
  } catch {
    return null;
  }
}

function EditableTable({ node, updateAttributes, deleteNode, editor }: { node: { attrs: { rows?: unknown } }; updateAttributes: (attrs: Record<string, unknown>) => void; deleteNode: () => void; editor: Editor }) {
  const rows = Array.isArray(node.attrs.rows) ? node.attrs.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [["Colonne 1"]];
  const updateCell = (rowIndex: number, columnIndex: number, value: string) => updateAttributes({ rows: rows.map((row, currentRow) => row.map((cell, currentColumn) => currentRow === rowIndex && currentColumn === columnIndex ? value : cell)) });
  const addRow = () => updateAttributes({ rows: [...rows, Array.from({ length: Math.max(1, rows[0]?.length ?? 1) }, () => "")] });
  const removeRow = () => rows.length > 1 && updateAttributes({ rows: rows.slice(0, -1) });
  const addColumn = () => updateAttributes({ rows: rows.map((row) => [...row, ""]) });
  const removeColumn = () => (rows[0]?.length ?? 1) > 1 && updateAttributes({ rows: rows.map((row) => row.slice(0, -1)) });
  const copyTable = () => { if (!editor.isEditable) return; copyRichTextBlock({ type: "contentTable", attrs: { rows: rows.map((row) => [...row]) } }); };
  return <NodeViewWrapper className="rich-text-editor__table-node"><div className="rich-text-editor__table-actions"><button type="button" onClick={addRow} disabled={!editor.isEditable}>+ ligne</button><button type="button" onClick={removeRow} disabled={!editor.isEditable || rows.length <= 1}>− ligne</button><button type="button" onClick={addColumn} disabled={!editor.isEditable}>+ colonne</button><button type="button" onClick={removeColumn} disabled={!editor.isEditable || (rows[0]?.length ?? 1) <= 1}>− colonne</button><span className="rich-text-editor__delete-group"><button type="button" className="rich-text-editor__block-copy" onMouseDown={(event) => event.preventDefault()} onClick={copyTable} disabled={!editor.isEditable}>Copier le tableau</button><button type="button" className="rich-text-editor__table-delete" onClick={() => { if (editor.isEditable && window.confirm("Supprimer ce tableau ?")) deleteNode(); }} disabled={!editor.isEditable}>Supprimer le tableau</button></span></div><table><tbody>{rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{row.map((cell, columnIndex) => { const Cell = rowIndex === 0 ? "th" : "td"; return <Cell key={`cell-${rowIndex}-${columnIndex}`}><input value={cell} disabled={!editor.isEditable} onChange={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.value)} /></Cell>; })}</tr>)}</tbody></table></NodeViewWrapper>;
}

type AccordionSection = { subtitle: string; body: string; bodyDocument: string | null };

function accordionSectionDocument(value: string) {
  return JSON.stringify({ type: "doc" as const, content: value.split(/\r?\n/).map((line) => ({ type: "paragraph" as const, content: line ? [{ type: "text" as const, text: line }] : [] })) });
}

function EditableAccordion({ node, updateAttributes, deleteNode, editor }: { node: { attrs: { title?: unknown; subtitle?: unknown; body?: unknown; bodyDocument?: unknown; sections?: unknown } }; updateAttributes: (attrs: Record<string, unknown>) => void; deleteNode: () => void; editor: Editor }) {
  const title = String(node.attrs.title ?? "");
  const titleInput = useRef<HTMLInputElement>(null);
  const legacySection = { subtitle: String(node.attrs.subtitle ?? ""), body: String(node.attrs.body ?? ""), bodyDocument: typeof node.attrs.bodyDocument === "string" ? node.attrs.bodyDocument : null };
  const sections: AccordionSection[] = Array.isArray(node.attrs.sections) && node.attrs.sections.length
    ? node.attrs.sections.flatMap((section): AccordionSection[] => {
      if (!section || typeof section !== "object") return [];
      const value = section as Record<string, unknown>;
      return [{ subtitle: typeof value.subtitle === "string" ? value.subtitle : "", body: typeof value.body === "string" ? value.body : "", bodyDocument: typeof value.bodyDocument === "string" ? value.bodyDocument : null }];
    })
    : [legacySection];
  const updateSections = (next: AccordionSection[]) => {
    const first = next[0] ?? { subtitle: "", body: "", bodyDocument: null };
    updateAttributes({ sections: next, subtitle: first.subtitle, body: first.body, bodyDocument: first.bodyDocument });
  };
  const updateSection = (index: number, field: "subtitle" | "body", value: string) => {
    const next = sections.map((section, sectionIndex) => sectionIndex === index
      ? { ...section, [field]: value, ...(field === "body" ? { bodyDocument: accordionSectionDocument(value) } : {}) }
      : section);
    updateSections(next);
  };
  const addSection = () => updateSections([...sections, { subtitle: "", body: "", bodyDocument: accordionSectionDocument("") }]);
  const removeSection = (index: number) => sections.length > 1 && updateSections(sections.filter((_, sectionIndex) => sectionIndex !== index));
  const copyAccordion = () => { if (!editor.isEditable) return; copyRichTextBlock({ type: "contentAccordion", attrs: { title, sections, subtitle: sections[0]?.subtitle ?? "", body: sections[0]?.body ?? "", bodyDocument: sections[0]?.bodyDocument ?? null } }); };
  return <NodeViewWrapper className="rich-text-editor__accordion-node">
    <label className="rich-text-editor__accordion-title"><span className="sr-only">Titre</span><input ref={titleInput} defaultValue={title} disabled={!editor.isEditable} onInput={(event) => updateAttributes({ title: event.currentTarget.value })} /></label>
    {sections.map((section, index) => <div className="rich-text-editor__accordion-section" key={`section-${index}`}>
      <label className="rich-text-editor__accordion-subtitle"><span>Sous-titre {index + 1}</span><input value={section.subtitle} disabled={!editor.isEditable} onChange={(event) => updateSection(index, "subtitle", event.currentTarget.value)} /></label>
      <label>Contenu<textarea defaultValue={section.body} disabled={!editor.isEditable} rows={4} onChange={(event) => updateSection(index, "body", event.currentTarget.value)} /></label>
      {sections.length > 1 ? <button type="button" className="rich-text-editor__accordion-section-delete" disabled={!editor.isEditable} onClick={() => removeSection(index)}>Supprimer ce sous-titre</button> : null}
    </div>)}
    <button type="button" className="rich-text-editor__accordion-section-add" disabled={!editor.isEditable} onClick={addSection}>Ajouter un sous-titre</button>
    <button type="button" className="rich-text-editor__block-copy" onMouseDown={(event) => event.preventDefault()} disabled={!editor.isEditable} onClick={copyAccordion}>Copier l’accordéon</button>
    <button type="button" className="rich-text-editor__accordion-delete" disabled={!editor.isEditable} onClick={() => { if (window.confirm("Supprimer cet accordéon ?")) deleteNode(); }}>Supprimer l’accordéon</button>
  </NodeViewWrapper>;
}

const contentTable = Node.create({
  name: "contentTable",
  group: "block",
  atom: true,
  addAttributes: () => ({ rows: { default: [["Colonne 1", "Colonne 2"], ["", ""]] } }),
  parseHTML: () => [{ tag: "table[data-rich-table]" }],
  renderHTML: ({ node }) => ["table", { "data-rich-table": "true" }, ["tbody", ...(Array.isArray(node.attrs.rows) ? node.attrs.rows : []).map((row: unknown, rowIndex: number) => ["tr", ...(Array.isArray(row) ? row : []).map((cell: unknown) => [rowIndex === 0 ? "th" : "td", {}, String(cell ?? "")])])]],
  addNodeView: () => ReactNodeViewRenderer(EditableTable),
});

const contentAccordion = Node.create({
  name: "contentAccordion",
  group: "block",
  atom: true,
  addAttributes: () => ({ title: { default: "Titre de l’accordéon" }, subtitle: { default: "" }, body: { default: "Contenu à afficher" }, bodyDocument: { default: null }, sections: { default: null } }),
  parseHTML: () => [{ tag: "details[data-rich-accordion]" }],
  renderHTML: ({ node }) => ["details", { "data-rich-accordion": "true" }, ["summary", {}, String(node.attrs.title ?? "")], ["p", {}, String(node.attrs.body ?? "")]],
  addNodeView: () => ReactNodeViewRenderer(EditableAccordion),
});

export function RichTextEditor({ name, initialContent, disabled = false, label }: RichTextEditorProps) {
  const labelId = useId();
  const hiddenInput = useRef<HTMLInputElement>(null);
  const [insertMode, setInsertMode] = useState<"table" | "accordion" | null>(null);
  const [tableRows, setTableRows] = useState(2);
  const [tableColumns, setTableColumns] = useState(2);
  const [accordionTitle, setAccordionTitle] = useState("En savoir plus");
  const [accordionSubtitle, setAccordionSubtitle] = useState("");
  const [accordionBody, setAccordionBody] = useState("Détails à afficher au clic");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      contentTable,
      contentAccordion,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto", "tel"],
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
      },
      handlePaste: (view, event) => {
        const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
        const block = readRichTextBlock(clipboardText) ?? (!clipboardText ? lastCopiedRichTextBlock : null);
        if (!block) return false;
        const node = view.state.schema.nodeFromJSON(block);
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (hiddenInput.current) {
        hiddenInput.current.value = JSON.stringify(currentEditor.getJSON());
        hiddenInput.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  });
  useEffect(() => {
    if (!editor || !hiddenInput.current) return;
    const form = hiddenInput.current.form;
    if (!form) return;
    const syncBeforeSubmit = () => {
      if (hiddenInput.current) hiddenInput.current.value = JSON.stringify(editor.getJSON());
    };
    syncBeforeSubmit();
    form.addEventListener("submit", syncBeforeSubmit);
    return () => form.removeEventListener("submit", syncBeforeSubmit);
  }, [editor]);
  useEffect(() => {
    if (!editor || disabled || !["excerptEn", "bodyEn", "body2En"].includes(name)) return;
    const sourceName = name.replace(/En$/, "Fr");
    const form = hiddenInput.current?.form;
    const sourceInputs = form?.querySelectorAll<HTMLInputElement>(`input[name="${sourceName}"]`);
    const sourceInput = sourceInputs ? sourceInputs.item(sourceInputs.length - 1) : null;
    const targetInput = hiddenInput.current;
    if (!sourceInput) return;
    const synchronize = () => {
    const source = parseRichTextInput(sourceInput?.value ?? "", 1);
      if (!source) return;
      const target = parseRichTextInput(JSON.stringify(editor.getJSON()), name === "excerptEn" ? 0 : 1) ?? initialContent;
      editor.commands.setContent(synchronizeRichTextLayout(source, target));
    };
    const applyTranslatedContent = () => {
      if (!targetInput) return;
      const translated = parseRichTextInput(targetInput?.value ?? "", name === "excerptEn" ? 0 : 1);
      if (translated) editor.commands.setContent(translated, { emitUpdate: false });
    };
    synchronize();
    sourceInput.addEventListener("input", synchronize);
    targetInput?.addEventListener("rich-text-translation", applyTranslatedContent);
    return () => {
      sourceInput.removeEventListener("input", synchronize);
      targetInput?.removeEventListener("rich-text-translation", applyTranslatedContent);
    };
  }, [editor, disabled, initialContent, name]);
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
      code: currentEditor?.isActive("code") ?? false,
      paragraph: currentEditor?.isActive("paragraph") ?? false,
      heading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      blockquote: currentEditor?.isActive("blockquote") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      canUndo: currentEditor?.can().chain().focus().undo().run() ?? false,
      canRedo: currentEditor?.can().chain().focus().redo().run() ?? false,
    }),
  });

  const setLink = () => {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Adresse du lien", current ?? "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const insertTable = (rowCount: number, columnCount: number) => {
    if (!editor) return;
    const rows = Array.from({ length: Math.max(1, Math.min(30, rowCount)) }, (_, rowIndex) => Array.from({ length: Math.max(1, Math.min(12, columnCount)) }, (_, columnIndex) => rowIndex === 0 ? `Colonne ${columnIndex + 1}` : ""));
    editor.chain().focus().insertContent({ type: "contentTable", attrs: { rows } }).run();
    setInsertMode(null);
  };

  const insertAccordion = (title: string, subtitle: string, body: string) => {
    if (!editor) return;
    if (!title.trim() || !body.trim()) return;
    const bodyDocument = { type: "doc" as const, content: body.split(/\r?\n/).map((line) => ({ type: "paragraph" as const, content: line.trim() ? [{ type: "text" as const, text: line.trim() }] : [] })) };
    editor.chain().focus().insertContent({ type: "contentAccordion", attrs: { title: title.trim(), subtitle: subtitle.trim(), body: body.trim(), bodyDocument: JSON.stringify(bodyDocument), sections: [{ subtitle: subtitle.trim(), body: body.trim(), bodyDocument: JSON.stringify(bodyDocument) }] } }).run();
    setInsertMode(null);
  };

  return <div className="rich-text-field">
    <span className="rich-text-field__label" id={labelId}>{label}</span>
    <input ref={hiddenInput} type="hidden" name={name} defaultValue={JSON.stringify(initialContent)} />
    <div className="rich-text-editor" aria-labelledby={labelId}>
      <div className="rich-text-editor__toolbar" role="toolbar" aria-label={`Mise en forme — ${label}`}>
        <ToolbarButton label="Paragraphe" active={state?.paragraph} disabled={disabled || !editor} onClick={() => editor?.chain().focus().setParagraph().run()}><Pilcrow /></ToolbarButton>
        <ToolbarButton label="Titre 2" active={state?.heading2} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></ToolbarButton>
        <ToolbarButton label="Titre 3" active={state?.heading3} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 /></ToolbarButton>
        <span className="rich-text-editor__separator" aria-hidden="true" />
        <ToolbarButton label="Gras" active={state?.bold} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></ToolbarButton>
        <ToolbarButton label="Italique" active={state?.italic} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></ToolbarButton>
        <ToolbarButton label="Souligné" active={state?.underline} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline /></ToolbarButton>
        <ToolbarButton label="Barré" active={state?.strike} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></ToolbarButton>
        <ToolbarButton label="Code" active={state?.code} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 /></ToolbarButton>
        <span className="rich-text-editor__separator" aria-hidden="true" />
        <ToolbarButton label="Liste à puces" active={state?.bulletList} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></ToolbarButton>
        <ToolbarButton label="Liste numérotée" active={state?.orderedList} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarButton>
        <ToolbarButton label="Citation" active={state?.blockquote} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></ToolbarButton>
        <ToolbarButton label="Séparateur" disabled={disabled || !editor} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus /></ToolbarButton>
        <span className="rich-text-editor__separator" aria-hidden="true" />
        <ToolbarButton label="Ajouter ou modifier un lien" active={state?.link} disabled={disabled || !editor} onClick={setLink}><Link2 /></ToolbarButton>
        <ToolbarButton label="Retirer le lien" disabled={disabled || !editor || !state?.link} onClick={() => editor?.chain().focus().unsetLink().run()}><Unlink /></ToolbarButton>
        <ToolbarButton label="Insérer un tableau" disabled={disabled || !editor} onClick={() => setInsertMode("table")}><Table2 /></ToolbarButton>
        <ToolbarButton label="Insérer un accordéon" disabled={disabled || !editor} onClick={() => setInsertMode("accordion")}><ChevronsUpDown /></ToolbarButton>
        <span className="rich-text-editor__separator" aria-hidden="true" />
        <ToolbarButton label="Annuler" disabled={disabled || !editor || !state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Rétablir" disabled={disabled || !editor || !state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
      </div>
      {insertMode === "table" ? <div className="rich-text-insert-panel"><div className="rich-text-insert-panel__dimensions"><label>Lignes<input type="number" min={1} max={30} value={tableRows} onChange={(event) => setTableRows(Number(event.currentTarget.value) || 1)} /></label><label>Colonnes<input type="number" min={1} max={12} value={tableColumns} onChange={(event) => setTableColumns(Number(event.currentTarget.value) || 1)} /></label></div><small>La première ligne est créée comme en-tête.</small><div><button type="button" className="rich-text-insert-panel__action" onClick={() => insertTable(tableRows, tableColumns)}>Insérer le tableau</button><button type="button" className="rich-text-insert-panel__cancel" onClick={() => setInsertMode(null)}>Annuler</button></div></div> : null}
      {insertMode === "accordion" ? <div className="rich-text-insert-panel"><label>Titre<input value={accordionTitle} onChange={(event) => setAccordionTitle(event.currentTarget.value)} /></label><label>Sous-titre<input value={accordionSubtitle} onChange={(event) => setAccordionSubtitle(event.currentTarget.value)} /></label><label>Contenu<textarea value={accordionBody} onChange={(event) => setAccordionBody(event.currentTarget.value)} rows={3} /></label><div><button type="button" className="rich-text-insert-panel__action" onClick={() => insertAccordion(accordionTitle, accordionSubtitle, accordionBody)}>Insérer l’accordéon</button><button type="button" className="rich-text-insert-panel__cancel" onClick={() => setInsertMode(null)}>Annuler</button></div></div> : null}
      <EditorContent editor={editor} className="rich-text-editor__content" />
    </div>
    <small>Styles disponibles : titres, emphases, listes, liens, citations et séparateurs.</small>
  </div>;
}

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button
    type="button"
    className={active ? "rich-text-editor__button is-active" : "rich-text-editor__button"}
    aria-label={label}
    aria-pressed={active}
    title={label}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >{children}</button>;
}
