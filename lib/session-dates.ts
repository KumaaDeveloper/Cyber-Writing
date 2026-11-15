export function normalizeSessionDate(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : value;
  if (typeof value !== "string") return value;
  return value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/([+-]\d{2})$/, "$1:00");
}
export function wibDateToISO(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) throw new Error("Waktu sesi tidak valid.");
  const date = new Date(value + (value.length === 16 ? ":00" : "") + "+07:00");
  if (!Number.isFinite(date.getTime())) throw new Error("Waktu sesi tidak valid.");
  return date.toISOString();
}
