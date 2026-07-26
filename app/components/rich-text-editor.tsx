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
} from "lucide-react";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { RichTextDocument } from "~/lib/rich-text";

type RichTextEditorProps = {
  name: string;
  initialContent: RichTextDocument;
  disabled?: boolean;
  label: string;
};

export function RichTextEditor({ name, initialContent, disabled = false, label }: RichTextEditorProps) {
  const hiddenInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
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
        "aria-labelledby": `${name}-label`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (hiddenInput.current) hiddenInput.current.value = JSON.stringify(currentEditor.getJSON());
    },
  });
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

  return <div className="rich-text-field">
    <span className="rich-text-field__label" id={`${name}-label`}>{label}</span>
    <input ref={hiddenInput} type="hidden" name={name} defaultValue={JSON.stringify(initialContent)} />
    <div className="rich-text-editor" aria-labelledby={`${name}-label`}>
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
        <span className="rich-text-editor__separator" aria-hidden="true" />
        <ToolbarButton label="Annuler" disabled={disabled || !editor || !state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Rétablir" disabled={disabled || !editor || !state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
      </div>
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
