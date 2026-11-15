import test from "node:test";
import assert from "node:assert/strict";
import {
  generateGeminiContent,
  DEFAULT_GEMINI_MODEL,
  geminiConfiguration,
  checkGeminiConnection,
} from "../lib/gemini-transport";
import { geminiError, geminiStatus } from "../lib/gemini-errors";
import { reviewDocument } from "../lib/ai";

test("REST transport sends key in headers, serializes Google Search/JSON correctly and excludes thinking text", async () => {
  let capturedUrl = "",
    captured: RequestInit | undefined;
  const request: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    captured = init;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "internal-thought" },
                { text: "Final answer" },
              ],
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: "https://www.cisa.gov/", title: "CISA" } },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const result = await generateGeminiContent(
    {
      model: "gemini-3.5-flash-lite",
      contents: "Materi artikel",
      config: {
        systemInstruction: "Periksa fakta",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    },
    "test-fixture-secret",
    request,
  );
  assert.ok(!capturedUrl.includes("test-fixture-secret"));
  assert.equal(
    new Headers(captured?.headers).get("x-goog-api-key"),
    "test-fixture-secret",
  );
  const body = JSON.parse(String(captured?.body));
  assert.equal(body.contents[0].parts[0].text, "Materi artikel");
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal("httpOptions" in body, false);
  assert.equal(result.text, "Final answer");
  assert.equal(
    result.candidates?.[0].groundingMetadata?.groundingChunks?.length,
    1,
  );
  await generateGeminiContent(
    {
      model: "gemini-3.5-flash-lite",
      contents: "Format",
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object" },
      },
    },
    "test-fixture-secret",
    request,
  );
  const jsonBody = JSON.parse(String(captured?.body));
  assert.equal(jsonBody.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(jsonBody.generationConfig.responseJsonSchema, {
    type: "object",
  });
});
test("wrapped or serialized provider errors and network causes retain actionable diagnostics", () => {
  const samples = [
    { cause: { statusCode: 404 } },
    {
      message: JSON.stringify({
        error: { code: 404, status: "NOT_FOUND", message: "private" },
      }),
    },
    { error: { status: "NOT_FOUND" } },
  ];
  for (const sample of samples) {
    assert.equal(geminiStatus(sample), 404);
    assert.match(geminiError(sample).message, /Model Gemini/);
    assert.ok(!geminiError(sample).message.includes("private"));
  }
  assert.match(
    geminiError(new Error("fetch failed", { cause: { code: "ENOTFOUND" } }))
      .message,
    /DNS/,
  );
  assert.match(
    geminiError(
      new Error("fetch failed", {
        cause: { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" },
      }),
    ).message,
    /TLS/,
  );
});
test("connection check requests model metadata only and distinguishes a missing model", async () => {
  let url = "",
    init: RequestInit | undefined;
  const result = await checkGeminiConnection({
    apiKey: "test-fixture-key",
    model: "gemini-3.5-flash-lite",
    request: async (input, options) => {
      url = String(input);
      init = options;
      return new Response(
        JSON.stringify({
          name: "models/gemini-3.5-flash-lite",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.model, "gemini-3.5-flash-lite");
  assert.equal(init?.body, undefined);
  assert.ok(url.endsWith("/models/gemini-3.5-flash-lite"));
  await assert.rejects(
    checkGeminiConnection({
      apiKey: "test-fixture-key",
      model: "missing-model",
      request: async () =>
        new Response(
          JSON.stringify({
            error: { code: 404, message: "private provider detail" },
          }),
          { status: 404 },
        ),
    }),
    (e: any) =>
      e.status === 503 &&
      /Model Gemini/.test(e.message) &&
      !e.message.includes("private provider detail"),
  );
});
test("non-JSON provider errors preserve their HTTP status", async () => {
  await assert.rejects(
    checkGeminiConnection({
      apiKey: "test-fixture-key",
      model: "missing-model",
      request: async () => new Response("Not Found", { status: 404 }),
    }),
    (e: any) => e.status === 503 && /Model Gemini/.test(e.message),
  );
});
test("review completes through REST after one transient HTTP 503", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    if (calls === 1)
      return new Response(
        JSON.stringify({
          error: { code: 503, status: "UNAVAILABLE", message: "busy" },
        }),
        { status: 503 },
      );
    if (calls === 2)
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "Riset sesuai CISA" }] },
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: "https://www.cisa.gov/", title: "CISA" } },
                ],
              },
            },
          ],
        }),
      );
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    status: "VALID",
                    summary: "Tepat",
                    findings: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  };
  const result = await reviewDocument(
    {
      title: "Phishing",
      theme_title: "Keamanan",
      pages: [{ title: "Pengantar", blocks: [] }],
      references: [],
    },
    {
      apiKey: "test-fixture-key",
      model: "gemini-3.5-flash-lite",
      searchGrounding: true,
      generate: (p) => generateGeminiContent(p, "test-fixture-key", request),
      sleep: async () => {},
    },
  );
  assert.equal(calls, 3);
  assert.equal(result.status, "VALID");
  assert.equal(result.sources[0].title, "CISA");
});

test("requested Flash Lite model is the default and explicit environment configuration is retained", () => {
  assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.5-flash-lite");
  assert.equal(geminiConfiguration("fixture", DEFAULT_GEMINI_MODEL).model, "gemini-3.5-flash-lite");
  assert.equal(geminiConfiguration("fixture", "models/other-model").model, "other-model");
});
