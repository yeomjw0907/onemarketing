import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
const { exchangeRate } = await import("../src/lib/exchange-rate");
const { list } = await import("../src/lib/db");
test("daily FX is cached, refresh failures preserve the last verified rate, invalid pairs never replace it", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let mode = "fail";
  globalThis.fetch = async (input) => {
    calls++;
    assert.equal(
      String(input),
      "https://api.frankfurter.dev/v2/rate/USD/KRW?providers=ECB",
    );
    if (mode === "fail") throw new Error("offline");
    return Response.json({
      date: "2026-10-14",
      base: mode === "invalid" ? "EUR" : "USD",
      quote: "KRW",
      rate: mode === "zero" ? 0 : 1336.79,
    });
  };
  try {
    await assert.rejects(exchangeRate(), /조회하지 못했습니다/);
    assert.equal((await list("exchange_rates")).length, 0);
    mode = "ok";
    const first = await exchangeRate();
    assert.equal(first.rate, 1336.79);
    assert.equal(first.stale, false);
    assert.equal(first.date, "2026-10-14");
    const before = calls;
    await exchangeRate();
    assert.equal(calls, before);
    mode = "fail";
    const fallback = await exchangeRate(true);
    assert.equal(fallback.stale, true);
    assert.equal(fallback.rate, first.rate);
    assert.equal(fallback.checkedAt, first.checkedAt);
    mode = "invalid";
    assert.equal((await exchangeRate(true)).stale, true);
    mode = "zero";
    assert.equal((await exchangeRate(true)).stale, true);
    assert.equal((await list("exchange_rates")).length, 1);
    assert.equal((await list("costs")).length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
