import test from "node:test";
import assert from "node:assert/strict";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { reviewDocument } from "../lib/ai";
import { geminiError } from "../lib/gemini-errors";
const doc = {
  title: "Phishing",
  theme_title: "Keamanan",
  name: "Private Author",
  email: "private@example.com",
  nim: "0012345678",
  pages: [{ id: "page-1", title: "Definisi", blocks: [] }],
  references: [],
};
const response = (v: any) => v as GenerateContentResponse;
const json = JSON.stringify({
  status: "VALID",
  summary: "Definisi sesuai bukti.",
  findings: [
    {
      page: 1,
      claim: "Phishing memakai penyamaran.",
      status: "VALID",
      reason: "Sesuai sumber.",
      suggestion: "Pertahankan.",
    },
  ],
});
const research = response({
  text: "Analisis",
  candidates: [
    {
      groundingMetadata: {
        groundingChunks: [
          { web: { title: "CISA", uri: "https://www.cisa.gov/" } },
          { web: { title: "Unsafe", uri: "javascript:alert(1)" } },
        ],
      },
    },
  ],
});
const options = {
  apiKey: "test-fixture-key",
  model: "gemini-3.5-flash-lite",
  searchGrounding: true,
  sleep: async () => {},
};
test("Gemini review sends no author identity, uses grounding then structured JSON, and preserves sources", async () => {
  const calls: GenerateContentParameters[] = [];
  const result = await reviewDocument(doc, {
    ...options,
    generate: async (p) => {
      calls.push(p);
      return calls.length === 1 ? research : response({ text: json });
    },
  });
  assert.equal(result.status, "VALID");
  assert.equal(result.sources.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].config?.tools?.length, 1);
  assert.equal(calls[1].config?.responseMimeType, "application/json");
  assert.equal(calls[0].config?.httpOptions?.retryOptions?.attempts, 1);
  assert.ok(!JSON.stringify(calls).includes("private@example.com"));
  assert.ok(!JSON.stringify(calls).includes("Private Author"));
  assert.ok(!JSON.stringify(calls).includes("0012345678"));
});
test("Gemini error messages distinguish credentials, quota, model, timeout and service failure without leaking raw message", () => {
  const cases: [[number, string], RegExp][] = [
    [[401, "secret key test"], /key Gemini/],
    [[403, "secret key test"], /Akses Gemini/],
    [[404, "secret key test"], /Model Gemini/],
    [[429, "secret key test"], /Kuota/],
    [[503, "secret key test"], /Layanan Gemini/],
    [[400, "API_KEY_INVALID secret key test"], /key Gemini/],
  ];
  for (const [[status, message], pattern] of cases) {
    const e = geminiError({ status, message });
    assert.match(e.message, pattern);
    assert.ok(!e.message.includes("secret key test"));
  }
  assert.equal(geminiError({ name: "TimeoutError" }).status, 504);
});
test("Gemini retries one transient 503 but does not retry invalid keys or quota", async () => {
  let calls = 0;
  await reviewDocument(doc, {
    ...options,
    generate: async () => {
      calls++;
      if (calls === 1) throw { status: 503 };
      return calls === 2 ? research : response({ text: json });
    },
  });
  assert.equal(calls, 3);
  for (const status of [401, 429]) {
    let n = 0;
    await assert.rejects(
      reviewDocument(doc, {
        ...options,
        generate: async () => {
          n++;
          throw { status };
        },
      }),
      (e: any) => e.status === (status === 429 ? 429 : 503),
    );
    assert.equal(n, 1);
  }
});
test("invalid JSON or invalid page numbers are rejected while missing grounding does not force an inaccurate rating", async () => {
  for (const text of [
    "not-json",
    JSON.stringify({
      status: "VALID",
      summary: "Test",
      findings: [
        {
          page: 2,
          claim: "Test",
          status: "VALID",
          reason: "Test",
          suggestion: "Test",
        },
      ],
    }),
  ]) {
    let n = 0;
    await assert.rejects(
      reviewDocument(doc, {
        ...options,
        generate: async () => (++n === 1 ? research : response({ text })),
      }),
      (e: any) => e.status === 502,
    );
  }
  let n = 0;
  const r = await reviewDocument(doc, {
    ...options,
    generate: async () =>
      ++n === 1
        ? response({ text: "Analisis tanpa sumber" })
        : response({ text: json }),
  });
  assert.equal(r.status, "VALID");
  assert.equal(r.findings[0].status, "VALID");
  assert.deepEqual(r.sources, []);
});

test("default free-tier review never enables Search and never presents model citations as verified sources", async () => {
  const previous = process.env.GEMINI_SEARCH_GROUNDING;
  delete process.env.GEMINI_SEARCH_GROUNDING;
  const calls: GenerateContentParameters[] = [];
  try {
    const result = await reviewDocument(doc, {
      apiKey: "test-fixture-key",
      generate: async (p) => {
        calls.push(p);
        return response({ ...research, text: json });
      },
    });
    assert.equal(calls.length, 1);
    for (const call of calls) {
      assert.equal(call.model, "gemini-3.5-flash-lite");
      assert.equal(call.config?.tools, undefined);
    }
    assert.match(String(calls[0].config?.systemInstruction), /Tidak ada akses penelusuran/);
    assert.equal(result.status, "VALID");
    assert.deepEqual(result.sources, []);
    assert.equal(result.search_html, "");
    assert.equal(result.summary, JSON.parse(json).summary);
    assert.match(String(calls[0].config?.systemInstruction), /Ketiadaan sumber internet bukan alasan otomatis/);
    assert.match(String(calls[0].config?.systemInstruction), /Jangan menganggap teks benar hanya karena berasal dari ChatGPT/);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING;
    else process.env.GEMINI_SEARCH_GROUNDING = previous;
  }
});

const freeOptions = { apiKey: "test-fixture-key", model: "gemini-3.5-flash-lite", searchGrounding: false, sleep: async () => {} };
test("review accepts complete fenced JSON, status casing and numeric page strings without inventing findings", async () => {
  const value = JSON.parse(json);
  value.status = "kurang_valid";
  value.findings[0].status = "valid";
  value.findings[0].page = "1";
  delete value.findings[0].suggestion;
  let calls = 0;
  const result = await reviewDocument(doc, { ...freeOptions, generate: async () => {
    calls++;
    return response({ text: "```json\n" + JSON.stringify(value) + "\n```" });
  } });
  assert.equal(calls, 1);
  assert.equal(result.findings[0].page, 1);
  assert.equal(result.findings[0].suggestion, "");
  assert.equal(result.findings[0].claim, value.findings[0].claim);
});
test("malformed structured output is retried once with original material and a smaller schema", async () => {
  const calls: GenerateContentParameters[] = [];
  const result = await reviewDocument(doc, { ...freeOptions, generate: async (p) => {
    calls.push(p);
    return response({ text: calls.length === 1 ? '{"summary":"incomplete"}' : json });
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].contents, calls[1].contents);
  assert.equal(calls[0].config?.responseMimeType, "application/json");
  assert.equal((calls[0].config?.responseJsonSchema as any).properties.findings.maxItems, 20);
  assert.equal((calls[1].config?.responseJsonSchema as any).properties.findings.maxItems, 8);
  assert.equal(calls[1].config?.maxOutputTokens, 16384);
  assert.equal(result.findings.length, 1);
  assert.ok(!JSON.stringify(calls).includes("Private Author"));
});
test("MAX_TOKENS cannot be saved as complete even if the fragment parses, then compact retry succeeds", async () => {
  let calls = 0;
  const result = await reviewDocument(doc, { ...freeOptions, generate: async () => {
    calls++;
    return response({ text: json, candidates: [{ finishReason: calls === 1 ? "MAX_TOKENS" : "STOP" }] });
  } });
  assert.equal(calls, 2);
  assert.equal(result.findings.length, 1);
});
test("persistently truncated, malformed, empty or out-of-range results fail after two attempts", async () => {
  for (const [value, finishReason, message] of [
    ['{"summary":"cut', "MAX_TOKENS", /terpotong/],
    ["not-json", "STOP", /terstruktur/],
    ["", "STOP", /terstruktur/],
    [JSON.stringify({ ...JSON.parse(json), findings: [{ ...JSON.parse(json).findings[0], page: 9 }] }), "STOP", /terstruktur/],
  ] as const) {
    let calls = 0;
    await assert.rejects(reviewDocument(doc, { ...freeOptions, generate: async () => {
      calls++;
      return response({ text: value, candidates: [{ finishReason }] });
    } }), (error: any) => error.status === 502 && message.test(error.message));
    assert.equal(calls, 2);
  }
});
test("blocked content is distinguished from a JSON format failure and never retried", async () => {
  let calls = 0;
  await assert.rejects(reviewDocument(doc, { ...freeOptions, generate: async () => {
    calls++;
    return response({ candidates: [{ finishReason: "SAFETY" }] });
  } }), (error: any) => error.status === 502 && /kebijakan konten/.test(error.message));
  assert.equal(calls, 1);
});

test("material negative findings cannot be hidden by a VALID summary", async () => {
  for (const status of ["KURANG VALID", "TIDAK VALID"]) {
    const value = JSON.parse(json);
    value.findings[0].status = status;
    const result = await reviewDocument(doc, { ...freeOptions, generate: async () => response({ text: JSON.stringify(value) }) });
    assert.equal(result.status, status);
    assert.equal(result.findings[0].status, status);
  }
});
