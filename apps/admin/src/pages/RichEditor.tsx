import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslate } from "@refinedev/core";

/**
 * Rich-text editor for articles, pages and FAQ answers (ADR-0004, ADR-0025). It emits HTML limited to what the
 * API's sanitizer keeps (headings 2–4, emphasis, lists, quotes, links, rules), so what editors see is what's saved.
 * Mount it with a `key` so a freshly loaded value replaces the content.
 */
export function RichEditor({ value, onChange, dir, minHeight = 240 }: { value: string; onChange: (html: string) => void; dir: "rtl" | "ltr"; minHeight?: number }) {
  const t = useTranslate();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["https", "mailto"] },
      }),
    ],
    content: value,
    editorProps: { attributes: { dir, class: "rich-editor outline-none", style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e?.isActive("heading", { level: 2 }), h3: e?.isActive("heading", { level: 3 }),
      bold: e?.isActive("bold"), italic: e?.isActive("italic"), underline: e?.isActive("underline"),
      bullet: e?.isActive("bulletList"), ordered: e?.isActive("orderedList"), quote: e?.isActive("blockquote"), link: e?.isActive("link"),
    }),
  });
  if (!editor) return null;

  const link = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("editor.linkPrompt"), prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const tools: { key: string; label: string; on?: boolean; run: () => void }[] = [
    { key: "h2", label: "H2", on: state?.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "h3", label: "H3", on: state?.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: "bold", label: "B", on: state?.bold, run: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", label: "I", on: state?.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { key: "underline", label: "U", on: state?.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { key: "bullet", label: "•", on: state?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: "1.", on: state?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: "“ ”", on: state?.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { key: "link", label: "URL", on: state?.link, run: link },
    { key: "hr", label: "—", run: () => editor.chain().focus().setHorizontalRule().run() },
    { key: "undo", label: "↶", run: () => editor.chain().focus().undo().run() },
    { key: "redo", label: "↷", run: () => editor.chain().focus().redo().run() },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface focus-within:border-gold">
      <div className="flex flex-wrap gap-1 border-b border-border p-1.5" role="toolbar">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            title={t(`editor.${tool.key}`)}
            aria-label={t(`editor.${tool.key}`)}
            aria-pressed={tool.on}
            onClick={tool.run}
            className={`min-w-8 rounded px-2 py-1 text-xs font-bold ${tool.on ? "bg-graphite text-white" : "text-text-2 hover:bg-surface-2"}`}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
