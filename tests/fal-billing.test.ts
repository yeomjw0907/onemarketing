import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
const { create, get, list } = await import("../src/lib/db");
const { syncFalBilling, billedAmount } = await import("../src/lib/fal-billing");
test("billing sync follows pagination, scopes request IDs, replaces totals idempotently and preserves absent bills", async () => {
  const p = await create("projects", { name: "billing-test" });
  const job = await create("jobs", {
    projectId: p.id,
    type: "image",
    providerRequestId: "billing-request",
    providerState: { provider: "fal" },
    estimate: 500,
  });
  const cost = await create("costs", {
    projectId: p.id,
    jobId: job.id,
    category: "ai",
    amount: 500,
    confirmed: false,
    currency: "KRW",
  });
  const original = globalThis.fetch,
    oldKey = process.env.FAL_KEY;
  process.env.FAL_KEY = "test-billing";
  let mode = "pages",
    calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.fal.ai");
    assert.equal(url.searchParams.get("request_id"), "billing-request");
    if (mode === "failure") return Response.json({}, { status: 403 });
    if (mode === "missing")
      return Response.json({
        billing_events: [],
        has_more: false,
        next_cursor: null,
      });
    const e = {
      request_id: "billing-request",
      endpoint_id: "test/model",
      timestamp: "2026-10-15T00:00:00Z",
      cost_total: url.searchParams.has("cursor") ? 0.02 : 0.04,
      cost_estimate_nano_usd: 999,
    };
    return Response.json({
      billing_events: [
        e,
        { ...e, request_id: "another-account-request", cost_total: 100 },
      ],
      has_more: !url.searchParams.has("cursor"),
      next_cursor: url.searchParams.has("cursor") ? null : "next",
    });
  };
  try {
    assert.equal((await syncFalBilling(p.id)).totalUsd, 0.06);
    assert.equal(calls, 2);
    assert.equal(((await get(cost.id))!.providerBilling as any).amount, 0.06);
    await syncFalBilling(p.id);
    assert.equal(
      (await list("costs")).filter((c) => c.jobId === job.id).length,
      1,
    );
    assert.equal(((await get(cost.id))!.providerBilling as any).amount, 0.06);
    mode = "missing";
    assert.equal((await syncFalBilling(p.id)).pending, 1);
    assert.equal(((await get(cost.id))!.providerBilling as any).amount, 0.06);
    mode = "failure";
    await assert.rejects(syncFalBilling(p.id), /403/);
    assert.equal(((await get(cost.id))!.providerBilling as any).amount, 0.06);
    assert.equal(
      billedAmount([
        {
          request_id: "zero",
          endpoint_id: "test",
          timestamp: "",
          cost_total: 0,
        },
      ]),
      0,
    );
    assert.throws(
      () =>
        billedAmount([
          { request_id: "bad", endpoint_id: "test", timestamp: "" },
        ]),
      /형식/,
    );
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = oldKey;
  }
});
