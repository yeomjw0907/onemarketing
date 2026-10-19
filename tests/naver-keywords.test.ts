import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectNaverKeywordMetrics,
  metricDates,
} from "../src/lib/naver-keywords";
test("Korean day boundary excludes today and uses a consistent 90-day comparison", () => {
  assert.deepEqual(metricDates(new Date("2026-10-18T16:00:00Z")), {
    startDate: "2026-09-19",
    endDate: "2026-10-18",
    trendStartDate: "2026-07-21",
  });
});
test("counts only unique posts in window, caps pagination and batches trend comparison together", async () => {
  const real = globalThis.fetch;
  const previousId = process.env.NAVER_API_HUB_CLIENT_ID,
    previousSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  process.env.NAVER_API_HUB_CLIENT_ID = "test-id";
  process.env.NAVER_API_HUB_CLIENT_SECRET = "test-secret";
  let trendCalls = 0,
    blogCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "naverapihub.apigw.ntruss.com");
    assert.equal(
      new Headers(init?.headers).get("X-NCP-APIGW-API-KEY-ID"),
      "test-id",
    );
    if (url.pathname.includes("search-trend")) {
      trendCalls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.keywordGroups.length, 2);
      assert.equal(body.endDate, "2026-10-18");
      return Response.json({
        results: [
          { title: "A", data: [{ period: "2026-10-17", ratio: 50 }] },
          { title: "B", data: [] },
        ],
      });
    }
    blogCalls++;
    if (url.searchParams.get("query") === "A")
      return Response.json({
        total: 99,
        items: [
          { link: "https://example.com/1", postdate: "20261018" },
          { link: "https://example.com/1", postdate: "20261018" },
          { link: "https://example.com/2", postdate: "20260918" },
          { link: "https://example.com/today", postdate: "20261019" },
        ],
      });
    const start = Number(url.searchParams.get("start"));
    return Response.json({
      total: 10000,
      items: Array.from({ length: 100 }, (_, i) => ({
        link: "https://example.com/" + (start + i),
        postdate: "20261017",
      })),
    });
  };
  try {
    const m = await collectNaverKeywordMetrics(
      ["A", "A", "B"],
      new Date("2026-10-19T00:00:00Z"),
    );
    assert.equal(m.rows[0].recentObserved, 1);
    assert.equal(m.rows[0].sampleSize, 3);
    assert.equal(m.rows[1].recentObserved, 300);
    assert.equal(m.rows[1].limited, true);
    assert.equal(m.rows[1].trend.length, 0);
    assert.equal(trendCalls, 1);
    assert.equal(blogCalls, 4);
    assert.doesNotMatch(JSON.stringify(m), /test-secret|test-id/);
  } finally {
    globalThis.fetch = real;
    if (previousId === undefined) delete process.env.NAVER_API_HUB_CLIENT_ID;
    else process.env.NAVER_API_HUB_CLIENT_ID = previousId;
    if (previousSecret === undefined)
      delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    else process.env.NAVER_API_HUB_CLIENT_SECRET = previousSecret;
  }
});
test("API failure stays unknown and never becomes zero or exposes provider response", async () => {
  const real = globalThis.fetch;
  process.env.NAVER_API_HUB_CLIENT_ID = "test-id";
  process.env.NAVER_API_HUB_CLIENT_SECRET = "test-secret";
  globalThis.fetch = async () =>
    new Response("private-provider-response", { status: 403 });
  try {
    const m = await collectNaverKeywordMetrics(["A"]);
    assert.equal(m.rows[0].blogTotal, null);
    assert.equal(m.rows[0].recentObserved, null);
    assert.equal(m.rows[0].trend.length, 0);
    assert.match(m.rows[0].blogError!, /사용 권한/);
    assert.doesNotMatch(
      JSON.stringify(m),
      /private-provider-response|test-secret/,
    );
  } finally {
    globalThis.fetch = real;
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    delete process.env.NAVER_API_HUB_CLIENT_SECRET;
  }
});
