import { AppError } from "./security";
export function geminiStatus(error: unknown): number {
  const e = error as any;
  return Number(e?.status || e?.error?.code || e?.response?.status || 0);
}
export function geminiError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = error as any,
    status = geminiStatus(error),
    text = String(e?.message || "");
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
  return new AppError(
    502,
    "Tidak dapat menerima hasil Gemini. Periksa koneksi layanan dan konfigurasi API, lalu coba kembali.",
  );
}
