// Read only known codes through wrapped driver errors; never return raw SQL,
// connection strings, credentials or provider messages to the browser/logs.
export function configurationError(
  error: unknown,
): { status: number; error: string; code: string } | null {
  let current: any = error;
  for (let i = 0; current && i < 8; i++, current = current.cause) {
    const code = String(current.code || "");
    const message = String(current.message || "");
    if (message === "CONFIG_DATABASE")
      return {
        status: 503,
        code: "DATABASE_MISSING",
        error:
          "DATABASE_URL belum diisi di Vercel. Tambahkan koneksi Neon, lalu Redeploy.",
      };
    if (code === "42P01" || code === "42703")
      return {
        status: 503,
        code: "DATABASE_SCHEMA",
        error:
          "Tabel database belum siap. Deploy versi terbaru dengan DATABASE_URL agar migrasi berjalan otomatis.",
      };
    if (["28P01", "28000", "3D000"].includes(code))
      return {
        status: 503,
        code: "DATABASE_CREDENTIALS",
        error:
          "Koneksi Neon ditolak. Periksa DATABASE_URL di Vercel, lalu Redeploy.",
      };
    if (
      [
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ETIMEDOUT",
        "ECONNRESET",
        "08001",
        "08006",
        "57P01",
      ].includes(code) ||
      /connection.*timeout|timeout.*connect/i.test(message)
    )
      return {
        status: 503,
        code: "DATABASE_UNAVAILABLE",
        error:
          "Database Neon belum dapat dihubungi. Periksa koneksi DATABASE_URL atau coba kembali.",
      };
    if (
      [
        "CERT_HAS_EXPIRED",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      ].includes(code)
    )
      return {
        status: 503,
        code: "DATABASE_TLS",
        error:
          "Koneksi aman ke database gagal. Gunakan connection string resmi dari Neon.",
      };
    if (message === "BOOTSTRAP_PASSWORD_INVALID")
      return {
        status: 503,
        code: message,
        error:
          "ADMIN_BOOTSTRAP_PASSWORD harus minimal 12 karakter dan maksimal 72 byte UTF-8.",
      };
    if (message === "BOOTSTRAP_USERNAME_INVALID")
      return {
        status: 503,
        code: message,
        error: "ADMIN_USERNAME harus berisi 1–100 karakter.",
      };
  }
  return null;
}
