import { AppError } from "./security";
const statusNames: Record<string, number> = {
  INVALID_ARGUMENT: 400,
  FAILED_PRECONDITION: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};
function errorChain(error: unknown): any[] {
  const result: any[] = [];
  let e: any = error;
  for (let i = 0; e && i < 8; i++, e = e.cause) {
    result.push(e);
    if (typeof e.message === "string" && e.message.trim().startsWith("{"))
      try {
        result.push(JSON.parse(e.message));
      } catch {}
  }
  return result;
}
export function geminiStatus(error: unknown): number {
  for (const e of errorChain(error))
    for (const value of [
      e.status,
      e.statusCode,
      e.code,
      e.error?.code,
      e.error?.status,
      e.response?.status,
    ]) {
      const n = Number(value);
      if (n >= 400 && n <= 599) return n;
      if (statusNames[String(value)]) return statusNames[String(value)];
    }
  return 0;
}
export function geminiError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = error as any,
    status = geminiStatus(error),
    text = errorChain(error)
      .map((e) => String(e.message || e.error?.message || ""))
      .join(" ");
  const networkCode = errorChain(error)
    .map((e) => e.code)
    .find(Boolean);
  if (
    /API_KEY_INVALID|API key not valid|API key expired/i.test(text) ||
    status === 401
  )
    return new AppError(
      503,
      "API key Gemini tidak valid atau kedaluwarsa. Periksa GEMINI_API_KEY di Vercel lalu Redeploy.",
    );
  if (status === 402 || /FAILED_PRECONDITION|billing|prepay/i.test(text))
    return new AppError(
      503,
      "Proyek Gemini belum memenuhi persyaratan akses atau billing. Periksa pengaturan project API di Google AI Studio.",
    );
  if (status === 403)
    return new AppError(
      503,
      "Akses Gemini ditolak. Periksa izin dan pembatasan API key serta akses model pada project Google AI Studio.",
    );
  if (status === 404)
    return new AppError(
      503,
      "Model Gemini tidak tersedia. Periksa GEMINI_MODEL di Vercel dan gunakan model yang mendukung Google Search serta JSON terstruktur.",
    );
  if (status === 429)
    return new AppError(
      429,
      "Kuota atau batas permintaan Gemini tercapai. Periksa kuota project Google AI Studio dan coba lagi setelah tersedia.",
    );
  if (status === 400)
    return new AppError(
      502,
      "Gemini menolak konfigurasi pemeriksaan. Periksa dukungan model untuk Google Search dan JSON terstruktur pada GEMINI_MODEL.",
    );
  if (
    e?.name === "AbortError" ||
    e?.name === "TimeoutError" ||
    status === 408 ||
    /timed out|timeout/i.test(text)
  )
    return new AppError(
      504,
      "Pemeriksaan Gemini melewati batas waktu. Coba kembali atau gunakan tulisan yang lebih ringkas.",
    );
  if ([500, 502, 503, 504].includes(status))
    return new AppError(
      503,
      "Layanan Gemini sedang bermasalah atau sibuk. Coba pemeriksaan lagi beberapa saat.",
    );
  if (["ENOTFOUND", "EAI_AGAIN"].includes(networkCode))
    return new AppError(
      503,
      "Server tidak dapat menemukan alamat API Gemini (DNS). Periksa log koneksi Vercel dan coba Uji koneksi Gemini.",
    );
  if (
    [
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    ].includes(networkCode)
  )
    return new AppError(
      503,
      "Koneksi aman dari server ke Gemini gagal (TLS). Periksa konfigurasi jaringan/certificate pada deployment.",
    );
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(networkCode)
  )
    return new AppError(
      503,
      "Koneksi dari server ke API Gemini terputus atau tidak tersedia. Coba Uji koneksi Gemini dari Pengaturan.",
    );
  return new AppError(
    502,
    "Permintaan Gemini gagal tanpa respons HTTP yang dapat dibaca. Jalankan Uji koneksi Gemini di Pengaturan untuk memeriksa key dan model.",
  );
}
