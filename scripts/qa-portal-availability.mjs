// Regression: ISSUE-002. Verify a real Next HTTP server distinguishes DB outages from missing sessions.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3138";
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "--port",
    "3138",
    "--hostname",
    "127.0.0.1",
  ],
  {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://qa:qa@127.0.0.1:1/qa",
      DATABASE_SSL: "disable",
      DATABASE_POOL_MAX: "1",
      DB_SCHEMA: "qa_outage",
      APP_URL: base,
      COOKIE_SECURE: "false",
    },
  },
);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base, { signal: AbortSignal.timeout(1000) });
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.ok(ready, "QA server did not start");
  const missing = await fetch(base + "/api/participant-portal");
  assert.equal(missing.status, 401);
  const cookie = "om_participant=" + "a".repeat(64);
  const get = await fetch(base + "/api/participant-portal", {
    headers: { Cookie: cookie },
  });
  assert.equal(get.status, 503);
  assert.equal(get.headers.get("retry-after"), "5");
  assert.match((await get.json()).error, /서버 연결/);
  const post = await fetch(base + "/api/participant-portal", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "marketing-consent", consent: true }),
  });
  assert.equal(post.status, 503);
  const account = await fetch(base + "/api/account-requests?role=participant", {
    headers: { Cookie: cookie },
  });
  assert.equal(account.status, 503);
  console.log(
    JSON.stringify({
      missingSession: 401,
      portalGetOutage: 503,
      portalPostOutage: 503,
      accountRequestOutage: 503,
      retryAfterSeconds: 5,
    }),
  );
} finally {
  child.kill();
}
