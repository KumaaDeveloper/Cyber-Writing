export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export function draftExpired(doc: { status: string; updated_at?: string | Date }, now = new Date()) {
  return doc.status === "draft" && !!doc.updated_at && new Date(doc.updated_at).getTime() + DRAFT_TTL_MS <= now.getTime();
}
