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
test("invalid JSON or invalid page numbers are rejected and missing grounding cannot be called verified", async () => {
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
  assert.equal(r.status, "KURANG VALID");
  assert.equal(r.findings[0].status, "KURANG VALID");
  assert.match(r.summary, /belum terverifikasi/);
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
        return calls.length === 1 ? research : response({ text: json });
      },
    });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.model, "gemini-3.5-flash-lite");
      assert.equal(call.config?.tools, undefined);
    }
    assert.match(String(calls[0].config?.systemInstruction), /Tidak ada akses penelusuran/);
    assert.equal(result.status, "KURANG VALID");
    assert.deepEqual(result.sources, []);
    assert.equal(result.search_html, "");
    assert.match(result.summary, /tanpa penelusuran web.*belum terverifikasi/);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_SEARCH_GROUNDING;
    else process.env.GEMINI_SEARCH_GROUNDING = previous;
  }
});
