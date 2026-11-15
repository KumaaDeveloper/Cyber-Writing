import { z } from "zod";
import { normalizeSessionDate } from "./session-dates";
export const digitsOnly = (value: string) => value.replace(/[^0-9]/g, "");
export const safeUrl = (value: string) => {
  try {
    const u = new URL(value);
    return ["https:"].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
};
const url = z
  .string()
  .max(2000)
  .refine(safeUrl, "Gunakan URL HTTPS yang valid.");
export const identitySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    nim: z
      .string()
      .trim()
      .regex(/^[0-9]{5,20}$/),
    email: z.email().max(200),
    membership_status: z.enum(["anggota", "pengurus", "non-anggota"]),
    department: z.enum(["BPH", "Technical", "Social"]).nullable().optional(),
  })
  .superRefine((v, c) => {
    if (v.membership_status === "pengurus" && !v.department)
      c.addIssue({
        code: "custom",
        message: "Pilih departemen.",
        path: ["department"],
      });
  });
// TipTap JSON is rendered by registered nodes, never injected as raw HTML.
const allowedNodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "taskList",
  "taskItem",
]);
const allowedMarks = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
  "highlight",
]);
export function validRich(doc: unknown, depth = 0): boolean {
  if (depth > 20 || !doc || typeof doc !== "object") return false;
  const n = doc as Record<string, any>;
  if (!allowedNodes.has(n.type)) return false;
  if (
    n.text !== undefined &&
    (typeof n.text !== "string" || n.text.length > 50000)
  )
    return false;
  if (n.attrs) {
    if (
      n.attrs.textAlign &&
      !["left", "right", "center", "justify"].includes(n.attrs.textAlign)
    )
      return false;
    if (n.attrs.level && ![1, 2, 3].includes(n.attrs.level)) return false;
  }
  if (
    n.marks &&
    (!Array.isArray(n.marks) ||
      !n.marks.every(
        (m: any) =>
          allowedMarks.has(m.type) &&
          (!m.attrs?.href || safeUrl(m.attrs.href)) &&
          (!m.attrs?.color || /^#[\da-f]{3,8}$/i.test(m.attrs.color)),
      ))
  )
    return false;
  return (
    !n.content ||
    (Array.isArray(n.content) &&
      n.content.length < 2000 &&
      n.content.every((x: unknown) => validRich(x, depth + 1)))
  );
}
const rich = z
  .unknown()
  .refine((v) => validRich(v), "Format teks tidak didukung.");
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.uuid(), type: z.literal("text"), content: rich }),
  z.object({
    id: z.uuid(),
    type: z.enum(["callout", "warning"]),
    content: rich,
  }),
  z.object({
    id: z.uuid(),
    type: z.literal("image"),
    url,
    caption: z.string().max(500),
    alt: z.string().max(300),
    width: z.number().min(25).max(100),
    align: z.enum(["left", "center", "right"]),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal("diagram"),
    source: z.string().max(10000),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal("gallery"),
    images: z
      .array(
        z.object({
          id: z.uuid(),
          url,
          caption: z.string().max(500),
          alt: z.string().max(300),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.object({ id: z.uuid(), type: z.literal("divider") }),
]);
export const pageSchema = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  blocks: z.array(blockSchema).max(100),
});
export const referenceSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(300),
  url,
  publisher: z.string().max(200),
  accessed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal("")),
});
export const documentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    version: z.number().int().positive(),
    pages: z.array(pageSchema).min(1).max(30),
    references: z.array(referenceSchema).max(100),
  })
  .superRefine((v, c) => {
    const ids = [
      ...v.pages.map((p) => p.id),
      ...v.pages.flatMap((p) => p.blocks.map((b) => b.id)),
      ...v.references.map((r) => r.id),
    ];
    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: "custom", message: "ID elemen harus unik." });
    if (JSON.stringify(v).length > 1000000)
      c.addIssue({
        code: "custom",
        message: "Dokumen terlalu besar (maksimal 1 MB).",
      });
  });
export const themeSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(2).max(150),
  description: z.string().max(1000),
  instructions: z.string().max(2000),
  available: z.boolean(),
});
export const sessionSchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    description: z.string().max(2000),
    start_at: z.preprocess(normalizeSessionDate, z.iso.datetime({ offset: true })),
    end_at: z.preprocess(normalizeSessionDate, z.iso.datetime({ offset: true })),
    max_pages: z.number().int().min(1).max(30),
    status: z.enum(["scheduled", "open", "closed"]),
    themes: z.array(themeSchema).min(1),
  })
  .refine(
    (v) => new Date(v.end_at) > new Date(v.start_at),
    "Waktu akhir harus setelah waktu mulai.",
  );
export type Identity = z.infer<typeof identitySchema>;
export type Block = z.infer<typeof blockSchema>;
export type Page = z.infer<typeof pageSchema>;
export type DocumentData = z.infer<typeof documentSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type SessionData = z.infer<typeof sessionSchema> & { id: string };
export function sessionOpen(
  s: { status: string; start_at: string | Date; end_at: string | Date },
  now = new Date(),
) {
  return (
    s.status !== "closed" &&
    new Date(s.start_at) <= now &&
    new Date(s.end_at) > now
  );
}
export function canWrite(status: string) {
  return status === "draft" || status === "revision";
}
export function textOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const n = value as any;
  return [n.text || "", ...(n.content || []).map(textOf)].join(" ");
}
export function hasContent(pages: Page[]) {
  return pages.some((p) =>
    p.blocks.some(
      (b) =>
        ["text", "callout", "warning"].includes(b.type) &&
        "content" in b &&
        textOf(b.content).trim().length > 0,
    ),
  );
}
export function newPage(): Page {
  return {
    id: crypto.randomUUID(),
    title: "Halaman tanpa judul",
    blocks: [
      {
        id: crypto.randomUUID(),
        type: "text",
        content: { type: "doc", content: [{ type: "paragraph" }] },
      },
    ],
  };
}
export const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "Terkirim",
  revision: "Perlu revisi",
  reviewed: "Ditinjau",
  scheduled: "Terjadwal",
  open: "Terbuka",
  closed: "Ditutup",
};
