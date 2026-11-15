import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { AppError, fail } from "./security";
import { geminiError } from "./gemini-errors";
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
type Fetcher = typeof fetch;
export function geminiConfiguration(
  apiKey = process.env.GEMINI_API_KEY || "",
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
) {
  const key = apiKey.trim(),
    name = model.trim().replace(/^models\//, "");
  if (!key) fail(503, "GEMINI_API_KEY belum diisi.");
  if (key.startsWith("GEMINI_API_KEY="))
    fail(503, "Isi GEMINI_API_KEY dengan nilai key saja, tanpa nama variabel.");
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(name))
    fail(503, "GEMINI_MODEL tidak valid. Isi nama model saja.");
  return { apiKey: key, model: name };
}
async function googleJSON(url: string, init: RequestInit, request: Fetcher) {
  const response = await request(url, init);
  let data: any;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) throw { status: response.status };
    throw new AppError(
      502,
      "Google Gemini mengembalikan respons yang tidak valid. Uji koneksi dari Pengaturan atau coba kembali.",
    );
  }
  if (!response.ok)
    throw {
      status: response.status,
      error: data.error,
      message: data.error?.message || "Google API error",
    };
  return data;
}
export async function generateGeminiContent(
  p: GenerateContentParameters,
  apiKey: string,
  request: Fetcher = fetch,
): Promise<GenerateContentResponse> {
  if (typeof p.contents !== "string")
    throw new AppError(500, "Format permintaan pemeriksaan tidak valid.");
  const config = p.config || {};
  const body: any = {
    contents: [{ role: "user", parts: [{ text: p.contents }] }],
    generationConfig: { temperature: config.temperature ?? 0.1 },
  };
  if (typeof config.systemInstruction === "string")
    body.systemInstruction = { parts: [{ text: config.systemInstruction }] };
  if (config.tools?.length) body.tools = [{ google_search: {} }];
  if (config.responseMimeType)
    body.generationConfig.responseMimeType = config.responseMimeType;
  if (config.responseJsonSchema)
    body.generationConfig.responseJsonSchema = config.responseJsonSchema;
  const data = await googleJSON(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(p.model) +
      ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: config.abortSignal,
      cache: "no-store",
    },
    request,
  );
  const text = (data.candidates?.[0]?.content?.parts || [])
    .filter((part: any) => !part.thought && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("");
  return { ...data, text } as GenerateContentResponse;
}
export async function checkGeminiConnection(
  options: { apiKey?: string; model?: string; request?: Fetcher } = {},
) {
  const config = geminiConfiguration(options.apiKey, options.model);
  try {
    const result = await googleJSON(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(config.model),
      {
        headers: { "x-goog-api-key": config.apiKey },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
      options.request || fetch,
    );
    if (!result.supportedGenerationMethods?.includes("generateContent"))
      fail(
        503,
        "Model ini tidak mendukung generateContent. Pilih model Gemini teks yang mendukung pemeriksaan.",
      );
    return {
      ok: true,
      model: config.model,
      message:
        "Koneksi Gemini berhasil. Model " +
        config.model +
        " tersedia untuk project API ini.",
    };
  } catch (error) {
    throw geminiError(error);
  }
}
