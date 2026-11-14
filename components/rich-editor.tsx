"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table2,
  CheckSquare,
  Highlighter,
} from "lucide-react";
import { safeUrl } from "@/lib/model";
export default function RichEditor({
  content,
  onChange,
  readOnly = false,
}: {
  content: unknown;
  onChange: (v: JSONContent) => void;
  readOnly?: boolean;
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const [, render] = useState(0);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          protocols: ["https"],
          defaultProtocol: "https",
          isAllowedUri: (url) => safeUrl(url),
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: content as JSONContent,
    editable: !readOnly,
    onUpdate: ({ editor }) => change.current(editor.getJSON()),
    onSelectionUpdate: () => render((n) => n + 1),
    onTransaction: () => render((n) => n + 1),
  });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [readOnly, editor]);
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(content))
      editor.commands.setContent(content as JSONContent, { emitUpdate: false });
  }, [content, editor]);
  if (!editor) return <div className="skeleton editor-skeleton" />;
  const cmd = editor.chain().focus();
  const tool = (
    title: string,
    icon: React.ReactNode,
    action: () => void,
    active = false,
  ) => (
    <button
      type="button"
      key={title}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={active ? "active" : ""}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      {icon}
    </button>
  );
  return (
    <div
      className={"rich-editor " + (readOnly ? "read-only" : "")}
      onClick={(e) => {
        if (readOnly) {
          const a = (e.target as HTMLElement).closest("a");
          if (a && safeUrl(a.href)) {
            e.preventDefault();
            window.open(a.href, "_blank", "noopener,noreferrer");
          }
        }
      }}
    >
      {!readOnly && (
        <div className="text-toolbar" role="toolbar" aria-label="Format teks">
          <select
            aria-label="Jenis teks"
            value={
              editor.isActive("heading", { level: 1 })
                ? "1"
                : editor.isActive("heading", { level: 2 })
                  ? "2"
                  : editor.isActive("heading", { level: 3 })
                    ? "3"
                    : "p"
            }
            onChange={(e) =>
              e.target.value === "p"
                ? cmd.setParagraph().run()
                : cmd
                    .toggleHeading({
                      level: Number(e.target.value) as 1 | 2 | 3,
                    })
                    .run()
            }
          >
            <option value="p">Paragraf</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
          <span className="tool-separator" />
          {tool(
            "Tebal",
            <Bold />,
            () => cmd.toggleBold().run(),
            editor.isActive("bold"),
          )}
          {tool(
            "Miring",
            <Italic />,
            () => cmd.toggleItalic().run(),
            editor.isActive("italic"),
          )}
          {tool(
            "Garis bawah",
            <Underline />,
            () => cmd.toggleUnderline().run(),
            editor.isActive("underline"),
          )}
          {tool(
            "Coret",
            <Strikethrough />,
            () => cmd.toggleStrike().run(),
            editor.isActive("strike"),
          )}
          {tool(
            "Bullet list",
            <List />,
            () => cmd.toggleBulletList().run(),
            editor.isActive("bulletList"),
          )}
          {tool(
            "Daftar bernomor",
            <ListOrdered />,
            () => cmd.toggleOrderedList().run(),
            editor.isActive("orderedList"),
          )}
          {tool(
            "Checklist",
            <CheckSquare />,
            () => cmd.toggleTaskList().run(),
            editor.isActive("taskList"),
          )}
          {tool(
            "Kutipan",
            <Quote />,
            () => cmd.toggleBlockquote().run(),
            editor.isActive("blockquote"),
          )}
          {tool(
            "Inline code",
            <Code />,
            () => cmd.toggleCode().run(),
            editor.isActive("code"),
          )}
          {tool(
            "Code block",
            <span>{"{ }"}</span>,
            () => cmd.toggleCodeBlock().run(),
            editor.isActive("codeBlock"),
          )}
          {tool("Tautan HTTPS", <Link />, () => {
            const url = window.prompt(
              "URL HTTPS (kosongkan untuk menghapus):",
              editor.getAttributes("link").href || "https://",
            );
            if (url === null) return;
            if (!url) {
              cmd.unsetLink().run();
              return;
            }
            if (safeUrl(url))
              cmd
                .setLink({
                  href: url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                })
                .run();
            else window.alert("Gunakan URL HTTPS yang valid.");
          })}
          {tool("Rata kiri", <AlignLeft />, () =>
            cmd.setTextAlign("left").run(),
          )}
          {tool("Rata tengah", <AlignCenter />, () =>
            cmd.setTextAlign("center").run(),
          )}
          {tool("Rata kanan", <AlignRight />, () =>
            cmd.setTextAlign("right").run(),
          )}
          {tool("Sorot", <Highlighter />, () =>
            cmd.toggleHighlight({ color: "#854d0e" }).run(),
          )}
          <label className="color-picker" title="Warna teks">
            <span>A</span>
            <input
              aria-label="Warna teks"
              type="color"
              defaultValue="#fafafa"
              onChange={(e) => cmd.setColor(e.target.value).run()}
            />
          </label>
          {tool("Tambah tabel", <Table2 />, () =>
            cmd.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
          )}
          {tool("Undo", <Undo2 />, () => cmd.undo().run())}
          {tool("Redo", <Redo2 />, () => cmd.redo().run())}
        </div>
      )}
      {!readOnly && editor.isActive("table") && (
        <div className="table-tools">
          {[
            ["+ Baris", () => cmd.addRowAfter().run()],
            ["− Baris", () => cmd.deleteRow().run()],
            ["+ Kolom", () => cmd.addColumnAfter().run()],
            ["− Kolom", () => cmd.deleteColumn().run()],
            ["Header", () => cmd.toggleHeaderRow().run()],
            ["Hapus tabel", () => cmd.deleteTable().run()],
          ].map(([label, fn]) => (
            <button
              key={String(label)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={fn as () => void}
            >
              {label as string}
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
