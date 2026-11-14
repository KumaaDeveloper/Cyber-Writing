import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  identitySchema,
  documentSchema,
  sessionSchema,
  sessionOpen,
  hasContent,
  validRich,
  safeUrl,
  canWrite,
} from "../lib/model";
const identity = {
  name: "Test Penulis",
  nim: "0012345678",
  email: "test@example.com",
  membership_status: "pengurus",
  department: "Technical",
};
const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Kenali phishing sebelum membuka tautan." },
      ],
    },
  ],
};
const doc = () => ({
  title: "Keamanan digital",
  version: 1,
  pages: [
    {
      id: randomUUID(),
      title: "Pengantar",
      blocks: [{ id: randomUUID(), type: "text", content }],
    },
  ],
  references: [],
});
test("NIM retains leading zeros and department is conditional", () => {
  assert.equal(identitySchema.parse(identity).nim, "0012345678");
  assert.equal(
    identitySchema.safeParse({ ...identity, department: null }).success,
    false,
  );
  assert.equal(
    identitySchema.safeParse({
      ...identity,
      membership_status: "non-anggota",
      department: null,
    }).success,
    true,
  );
});
test("session closes exactly at deadline and manual closure takes precedence", () => {
  const s = {
    status: "open",
    start_at: "2026-11-14T00:00:00Z",
    end_at: "2026-11-19T00:00:00Z",
  };
  assert.equal(sessionOpen(s, new Date("2026-11-18T23:59:59Z")), true);
  assert.equal(sessionOpen(s, new Date(s.end_at)), false);
  assert.equal(
    sessionOpen({ ...s, status: "closed" }, new Date("2026-11-15")),
    false,
  );
  assert.equal(
    sessionOpen({ ...s, status: "scheduled" }, new Date("2026-11-15")),
    true,
  );
  assert.equal(sessionOpen(s, new Date("2026-11-13")), false);
});
test("submitted and reviewed writers are locked", () => {
  assert.equal(canWrite("draft"), true);
  assert.equal(canWrite("revision"), true);
  assert.equal(canWrite("submitted"), false);
  assert.equal(canWrite("reviewed"), false);
});
test("active payload requires unique element IDs and bounded page count", () => {
  const d = doc();
  assert.equal(documentSchema.safeParse(d).success, true);
  d.pages.push(d.pages[0]);
  assert.equal(documentSchema.safeParse(d).success, false);
  const tooMany = {
    ...doc(),
    pages: Array.from({ length: 31 }, () => doc().pages[0]),
  };
  assert.equal(documentSchema.safeParse(tooMany).success, false);
});
test("XSS links, HTML nodes and unsafe colors are rejected", () => {
  assert.equal(safeUrl("javascript:alert(1)"), false);
  assert.equal(safeUrl("data:text/html,test"), false);
  assert.equal(safeUrl("https://user:pass@example.com"), false);
  assert.equal(safeUrl("https://owasp.org"), true);
  assert.equal(
    validRich({ type: "iframe", attrs: { src: "https://example.com" } }),
    false,
  );
  assert.equal(
    validRich({
      type: "text",
      text: "link",
      marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
    }),
    false,
  );
  assert.equal(
    validRich({
      type: "text",
      text: "a",
      marks: [
        { type: "textStyle", attrs: { color: "url(https://example.com)" } },
      ],
    }),
    false,
  );
});
test("deeply nested content cannot overwhelm renderer", () => {
  let n: any = { type: "text", text: "a" };
  for (let i = 0; i < 25; i++) n = { type: "paragraph", content: [n] };
  assert.equal(validRich(n), false);
});
test("submit content check needs actual text, not title or image only", () => {
  const d = documentSchema.parse(doc());
  assert.equal(hasContent(d.pages), true);
  assert.equal(
    hasContent([{ id: randomUUID(), title: "Title only", blocks: [] }]),
    false,
  );
  assert.equal(
    hasContent([
      {
        id: randomUUID(),
        title: "Image",
        blocks: [
          {
            id: randomUUID(),
            type: "image",
            url: "https://example.com/a.png",
            caption: "a",
            alt: "a",
            width: 100,
            align: "center",
          },
        ],
      },
    ]),
    false,
  );
});
test("session validation rejects backwards dates and permits admin-defined theme counts", () => {
  const s = {
    title: "Sesi 1",
    description: "",
    start_at: "2026-11-14T00:00:00Z",
    end_at: "2026-11-19T00:00:00Z",
    max_pages: 8,
    status: "open",
    themes: [
      { title: "Phishing", description: "", instructions: "", available: true },
    ],
  };
  assert.equal(sessionSchema.safeParse(s).success, true);
  assert.equal(
    sessionSchema.safeParse({ ...s, end_at: s.start_at }).success,
    false,
  );
  assert.equal(
    sessionSchema.safeParse({ ...s, themes: Array(250).fill(s.themes[0]) })
      .success,
    true,
  );
});
