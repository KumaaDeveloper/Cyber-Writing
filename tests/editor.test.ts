import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, createElement as h, useState } from "react";
import type { Editor } from "@tiptap/react";

test("Tools reopens after inserting and typing in a text block; formatting and undo survive closing the panel", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "https://cywrite.test", pretendToBeVisual: true },
  );
  const w = dom.window;
  for (const key of [
    "window",
    "document",
    "navigator",
    "Node",
    "Element",
    "HTMLElement",
    "DocumentFragment",
    "MutationObserver",
    "DOMParser",
    "DOMRect",
    "Range",
    "Text",
    "ShadowRoot",
  ])
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? w : (w as any)[key],
      configurable: true,
      writable: true,
    });
  Object.defineProperty(globalThis, "getComputedStyle", {
    value: w.getComputedStyle.bind(w),
    configurable: true,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: w.requestAnimationFrame.bind(w),
    configurable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: w.cancelAnimationFrame.bind(w),
    configurable: true,
  });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  w.Range.prototype.getClientRects = () => [] as any;
  w.Range.prototype.getBoundingClientRect = () => new w.DOMRect();
  const { createRoot } = await import("react-dom/client");
  const { default: RichEditor, TextTools } =
    await import("../components/rich-editor");
  let current: Editor | null = null;
  const active = (): Editor => { if (!current) throw new Error("Editor not mounted"); return current; };
  let latest: any = null;
  function Harness() {
    const [open, setOpen] = useState(false),
      [blocks, setBlocks] = useState<any[]>([]),
      [active, setActive] = useState<Editor | null>(null);
    return h(
      "main",
      null,
      h(
        "button",
        { "data-test": "tools", onClick: () => setOpen((v) => !v) },
        "Tools",
      ),
      open &&
        h(
          "section",
          { "data-test": "panel" },
          h(
            "button",
            {
              "data-test": "add-text",
              onClick: () => {
                setBlocks((v) => [
                  ...v,
                  {
                    id: "block-" + v.length,
                    content: { type: "doc", content: [{ type: "paragraph" }] },
                  },
                ]);
                setOpen(false);
              },
            },
            "Teks",
          ),
          h(TextTools, { editor: active }),
        ),
      ...blocks.map((b) =>
        h(RichEditor, {
          key: b.id,
          content: b.content,
          onReady: (editor: Editor) => {
            current = editor;
            setActive(editor);
          },
          onActivate: (editor: Editor) => {
            current = editor;
            setActive(editor);
          },
          onChange: (content: any) => {
            latest = content;
            setBlocks((v) =>
              v.map((x) => (x.id === b.id ? { ...x, content } : x)),
            );
          },
        }),
      ),
    );
  }
  const root = createRoot(w.document.getElementById("root")!);
  const click = async (selector: string) => {
    const button = w.document.querySelector<HTMLButtonElement>(selector);
    assert.ok(button, "missing " + selector);
    await act(async () => button.click());
  };
  try {
    await act(async () => {
      root.render(h(Harness));
    });
    await click("[data-test=tools]");
    await click("[data-test=add-text]");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    assert.ok(current);
    await act(async () => {
      active().commands.insertContent("Materi CYWRITE");
    });
    assert.ok(latest);
    await click("[data-test=tools]");
    assert.ok(w.document.querySelector('button[aria-label="Tebal"]'));
    await act(async () => {
      active().commands.setTextSelection({ from: 1, to: 15 });
    });
    await click('button[aria-label="Tebal"]');
    assert.equal(active().isActive("bold"), true);
    const snapshot = JSON.stringify(active().getJSON());
    for (let i = 0; i < 3; i++) {
      await click("[data-test=tools]");
      assert.equal(w.document.querySelector("[data-test=panel]"), null);
      await click("[data-test=tools]");
      assert.ok(w.document.querySelector('button[aria-label="Tebal"]'));
    }
    assert.equal(JSON.stringify(active().getJSON()), snapshot);
    await click('button[aria-label="Undo"]');
    assert.equal(active().isActive("bold"), false);
    await click("[data-test=add-text]");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await click("[data-test=tools]");
    assert.ok(w.document.querySelector('button[aria-label="Tebal"]'));
    assert.equal(w.document.querySelectorAll(".tiptap").length, 2);
  } finally {
    await act(async () => {
      root.unmount();
      await new Promise((r) => setTimeout(r, 20));
    });
    w.close();
  }
});
