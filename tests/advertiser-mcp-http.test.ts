import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "./helpers";
import { execute } from "../src/lib/db";
import { createAdvertiserKey } from "../src/lib/advertiser-ai";
import { POST, GET } from "../src/app/api/advertiser-mcp/route";
import { oauthError } from "../src/lib/mcp-http";
process.env.APP_URL = "https://example.test";
process.env.MCP_ENABLED = "true";
process.env.ADVERTISER_MCP_ENABLED = "true";
const endpoint = "https://example.test/api/advertiser-mcp";
test("authenticated optional SSE probes return 405, not a false authentication failure", async () => {
  const k = await key();
  const r = await GET(
    new Request(endpoint, {
      headers: {
        Authorization: "Bearer " + k.token,
        Accept: "text/event-stream",
      },
    }),
  );
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("Allow"), "POST, OPTIONS");
  assert.equal((await GET(new Request(endpoint))).status, 401);
});
async function key() {
  const id = randomUUID();
  await execute(
    "insert into advertiser_accounts(id,email,password_hash,name,phone) values($1,$2,'qa','QA','01000000000')",
    [id, id + "@qa.local"],
  );
  return createAdvertiserKey(id, "HTTP QA");
}
const request = (
  token?: string,
  extra: Record<string, string> = {},
  body = "{}",
) =>
  new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...extra,
    },
    body,
  });
test("advertiser MCP rejects untrusted browser origins before authentication", async () => {
  assert.equal(
    (await POST(request(undefined, { Origin: "https://evil.test" }))).status,
    403,
  );
  assert.equal(
    (await POST(request(undefined, { Origin: "null" }))).status,
    403,
  );
  for (const origin of ["https://example.test", "https://chatgpt.com"])
    assert.equal(
      (await POST(request(undefined, { Origin: origin }))).status,
      401,
    );
  assert.equal((await POST(request())).status, 401);
});
test("oversized authenticated MCP requests retain 413 instead of being mislabeled as bad input", async () => {
  const k = await key();
  const r = await POST(request(k.token, { "Content-Length": "70000" }));
  assert.equal(r.status, 413);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("MCP rate limiting preserves 429 and supports client backoff", async () => {
  const k = await key();
  // Saturate both adjacent minute buckets to avoid a wall-clock boundary race.
  const { tokenHash } = await import("../src/lib/auth");
  const minute = Math.floor(Date.now() / 60000);
  for (const bucket of [minute, minute + 1])
    await execute(
      "insert into mcp_rate_limits(key,count,expires) values($1,60,$2)",
      [tokenHash("advertiser:" + k.id + ":" + bucket), (bucket + 1) * 60000],
    );
  const r = await POST(request(k.token));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "60");
});
test("disabled MCP reports service unavailable rather than invalid client input", async () => {
  process.env.ADVERTISER_MCP_ENABLED = "false";
  try {
    assert.equal((await POST(request())).status, 503);
  } finally {
    process.env.ADVERTISER_MCP_ENABLED = "true";
  }
});
test("transient database failures are retriable 503 responses without backend details", async () => {
  const r = oauthError(
    Object.assign(new Error("private database hostname"), {
      code: "ECONNRESET",
    }),
  );
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("Retry-After"), "5");
  assert.doesNotMatch(await r.text(), /private database hostname/);
});
