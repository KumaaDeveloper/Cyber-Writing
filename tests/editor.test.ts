import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, createElement as h, useState } from "react";
import type { Editor } from "@tiptap/react";

test("Insert tools toggle, close on selection/outside/Escape, and local text tools preserve formatting across blocks", async () => {
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
  const { default: RichEditor } = await import("../components/rich-editor");
  const { ToolMenu } = await import("../components/tool-menu");
  let current: Editor | null = null;
  const active = (): Editor => { if (!current) throw new Error("Editor not mounted"); return current; };
  let latest: any = null;
  function Harness() {
    const [blocks, setBlocks] = useState<any[]>([]);
    return h(
      "main",
      null,
      h(ToolMenu, { children: (close: () => void) => h(
        "button", {
          "data-test": "add-text",
          onClick: () => {
            setBlocks((v) => [...v, {
              id: "block-" + v.length,
              content: { type: "doc", content: [{ type: "paragraph" }] },
            }]);
            close();
          },
        }, "Teks",
      ) }),
      ...blocks.map((b) =>
        h(RichEditor, {
          key: b.id,
          content: b.content,
          onReady: (editor: Editor) => {
            current = editor;
          },
          onActivate: (editor: Editor) => {
            current = editor;
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
    const insertTrigger = '.tool-menu-insert > button';
    const formatTrigger = '.rich-editor .tool-menu-format > button';
    const insertPanel = '.tool-menu-insert .tool-menu-panel';
    await click(insertTrigger);
    assert.ok(w.document.querySelector(insertPanel));
    assert.equal(w.document.querySelector('button[aria-label="Tebal"]'), null);
    await click(insertTrigger);
    assert.equal(w.document.querySelector(insertPanel), null);
    await click(insertTrigger);
    await click('[aria-label="Tutup tools"]');
    assert.equal(w.document.querySelector(insertPanel), null);
    await click(insertTrigger);
    await act(async () => { w.document.body.dispatchEvent(new w.Event("pointerdown", { bubbles: true })); });
    assert.equal(w.document.querySelector(insertPanel), null);
    await click(insertTrigger);
    await act(async () => { w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(w.document.querySelector(insertPanel), null);
    await click(insertTrigger);
    await click("[data-test=add-text]");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    assert.equal(w.document.querySelector(insertPanel), null);
    assert.ok(current);
    await act(async () => { active().commands.insertContent("Materi CYWRITE"); });
    assert.ok(latest);
    await click(formatTrigger);
    assert.ok(w.document.querySelector('button[aria-label="Tebal"]'));
    assert.ok(w.document.querySelector('.color-picker svg'), "text color has an icon");
    await act(async () => { active().commands.setTextSelection({ from: 1, to: 15 }); });
    await click('button[aria-label="Tebal"]');
    assert.equal(active().isActive("bold"), true);
    const snapshot = JSON.stringify(active().getJSON());
    for (let i = 0; i < 3; i++) {
      await click(formatTrigger);
      assert.equal(w.document.querySelector('button[aria-label="Tebal"]'), null);
      await click(formatTrigger);
      assert.ok(w.document.querySelector('button[aria-label="Tebal"]'));
    }
    assert.equal(JSON.stringify(active().getJSON()), snapshot);
    const shortcut = async (key: "z" | "y") => {
      const event = new w.KeyboardEvent("keydown", { key, code: key === "z" ? "KeyZ" : "KeyY", ctrlKey: true, bubbles: true, cancelable: true });
      await act(async () => { active().view.dom.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, true, `Ctrl+${key} is handled by the editor`);
    };
    await shortcut("z");
    assert.equal(active().isActive("bold"), false);
    await shortcut("y");
    assert.equal(active().isActive("bold"), true);
    assert.equal(JSON.stringify(active().getJSON()), snapshot);
    await click('button[aria-label="Undo"]');
    assert.equal(active().isActive("bold"), false);
    await click(formatTrigger);
    const first = active();
    const firstContent = JSON.stringify(first.getJSON());
    await click(insertTrigger);
    await click("[data-test=add-text]");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    assert.equal(w.document.querySelectorAll(".tiptap").length, 2);
    await act(async () => { active().commands.insertContent("Teks kedua"); active().commands.setTextSelection({ from: 1, to: 11 }); });
    const secondTrigger = w.document.querySelectorAll<HTMLButtonElement>(formatTrigger)[1];
    await act(async () => secondTrigger.click());
    await click('button[aria-label="Miring"]');
    assert.equal(active().isActive("italic"), true);
    assert.equal(JSON.stringify(first.getJSON()), firstContent, "formatting stays in the chosen text box");
    await act(async () => secondTrigger.click());
    assert.equal(w.document.querySelector('button[aria-label="Miring"]'), null);
  } finally {
    await act(async () => {
      root.unmount();
      await new Promise((r) => setTimeout(r, 20));
    });
    w.close();
  }
});
