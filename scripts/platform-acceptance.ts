import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import http from "node:http";
import next from "next";
config({ path: ".env.local", quiet: true });
process.env.DB_SCHEMA =
  "platform_" + randomUUID().replaceAll("-", "").slice(0, 12);
process.env.SUPABASE_STORAGE_PREFIX = process.env.DB_SCHEMA + "/";
process.env.APP_URL = "http://127.0.0.1:3109";
process.env.JOB_RUNNER = "worker";
process.env.SENS_ENABLED = "false";
const { applyMigrations, dropSchema } = await import("../src/lib/migrate");
const { execute, create, closeDb } = await import("../src/lib/db");
const { save } = await import("../src/lib/domain");
const hashBase64 = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const base = process.env.APP_URL;
const app = next({ dev: false, hostname: "127.0.0.1", port: 3109 });
let server: http.Server | undefined;
async function cleanup() {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
  }
  await app.close();
  await dropSchema();
  await closeDb();
}
try {
  await applyMigrations();
  await app.prepare();
  server = http.createServer(app.getRequestHandler());
  await new Promise<void>((r) => server!.listen(3109, "127.0.0.1", r));
  async function call(path: string, body?: unknown, cookie = "") {
    const r = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await r.json();
    assert.ok(r.ok, `${path}: ${JSON.stringify(value)}`);
    return {
      value,
      cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie,
    };
  }
  const adminToken = randomBytes(32).toString("hex"),
    admin = "om_session=" + adminToken;
  await execute(
    "insert into sessions(token_hash,email,expires) values($1,$2,$3)",
    [hash(adminToken), "platform-acceptance@test.local", Date.now() + 3600000],
  );
  assert.equal((await fetch(base + "/api/commerce?role=admin")).status, 401);
  await call(
    "/api/commerce",
    {
      role: "admin",
      action: "bank",
      data: {
        enabled: true,
        bank: "검증 은행",
        account: "TEST-NOT-A-REAL-ACCOUNT",
        holder: "격리 검증",
      },
    },
    admin,
  );
  const registered = await call("/api/advertiser-auth", {
    action: "register",
    email: randomUUID() + "@test.local",
    password: randomBytes(20).toString("hex"),
    name: "검증 광고주",
    phone: "01012345678",
    consent: true,
  });
  const advertiser = registered.cookie;
  const catalog = await call("/api/commerce?mode=catalog");
  const input = {
    category: "cafe",
    fulfillment: "provided",
    title: "격리 카페 캠페인",
    brand: "테스트 카페",
    product: "테스트 제품",
    guide: "제공 원고와 이미지 확인 후 블로그에 게시하고 링크를 제출하세요.",
    kind: "self_cash",
    channel: "blog",
    quantity: 5,
    reward: 20000,
    benefit: "제품 제공",
    managed: false,
    deadline: "2027-11-01",
    submissionDeadline: "2027-11-15",
  };
  const order = (
    await call(
      "/api/commerce",
      {
        action: "checkout",
        data: {
          id: randomUUID(),
          campaigns: [input],
          expectedTotal: 110000,
          policyVersion: catalog.value.policyVersion,
          consent: true,
        },
      },
      advertiser,
    )
  ).value;
  await call(
    "/api/commerce",
    {
      role: "admin",
      action: "payment",
      id: order.id,
      version: order.version,
      reference: "테스트 실제 송금 없음",
    },
    admin,
  );
  let c = (await call("/api/commerce", undefined, advertiser)).value
    .campaigns[0];
  const p = await save(
    "participants",
    {
      name: "검증 게시자",
      phone: "01099998888",
      payment: { method: "kakaopay" },
      accounts: [
        {
          id: randomUUID(),
          channel: "blog",
          url: "https://blog.naver.com/platform-acceptance",
          approvalStatus: "approved",
          ownershipVerifiedAt: new Date().toISOString(),
        },
      ],
    },
    "platform-acceptance",
  );
  const parent = await create("portal_links", {
    participantId: p.id,
    tokenHash: hash(randomBytes(32).toString("hex")),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const pt = randomBytes(32).toString("hex");
  await create("portal_links", {
    purpose: "session",
    parentId: parent.id,
    participantId: p.id,
    tokenHash: hash(pt),
    verifiedPhone: "01099998888",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const participant = "om_participant=" + pt;
  const a = (
    await call(
      "/api/commerce",
      {
        role: "participant",
        action: "apply",
        data: {
          campaignId: c.id,
          blogAccountId: (p.accounts as any[])[0].id,
          consent: true,
        },
      },
      participant,
    )
  ).value;
  await call(
    "/api/commerce",
    {
      action: "campaign",
      data: {
        campaignId: c.id,
        version: c.version,
        action: "select",
        applicationId: a.id,
      },
    },
    advertiser,
  );
  let av = (
    await call("/api/commerce?role=participant", undefined, participant)
  ).value.campaigns[0].applications[0];
  await call(
    "/api/commerce",
    {
      role: "participant",
      action: "participant",
      data: { id: av.id, version: av.version, action: "accept" },
    },
    participant,
  );
  av = (await call("/api/commerce?role=participant", undefined, participant))
    .value.campaigns[0].applications[0];
  await call(
    "/api/commerce",
    {
      role: "participant",
      action: "participant",
      data: {
        id: av.id,
        version: av.version,
        action: "submit",
        links: { blog: "https://blog.naver.com/platform-acceptance/123456" },
      },
    },
    participant,
  );
  c = (await call("/api/commerce", undefined, advertiser)).value.campaigns[0];
  await call(
    "/api/commerce",
    {
      action: "campaign",
      data: {
        campaignId: c.id,
        version: c.version,
        action: "review",
        applicationId: a.id,
        decision: "approve",
        note: "검증 승인",
      },
    },
    advertiser,
  );
  c = (await call("/api/commerce", undefined, advertiser)).value.campaigns[0];
  await call(
    "/api/commerce",
    {
      role: "admin",
      action: "campaign",
      data: { campaignId: c.id, version: c.version, action: "settle-self" },
    },
    admin,
  );
  c = (await call("/api/commerce", undefined, advertiser)).value.campaigns[0];
  assert.equal(c.data.refunds[0].amount, 85000);
  const key = (
    await call(
      "/api/advertiser-connections",
      { action: "create", label: "격리 AI" },
      advertiser,
    )
  ).value;
  async function mcp(method: string, params: unknown, id: number) {
    const r = await fetch(base + "/api/advertiser-mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key.token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
    });
    assert.ok(r.ok);
    return r.json();
  }
  assert.ok(
    (
      await mcp(
        "initialize",
        {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "acceptance", version: "1" },
        },
        1,
      )
    ).result,
  );
  assert.equal((await mcp("tools/list", {}, 2)).result.tools.length, 4);
  assert.ok(
    (
      await mcp("tools/call", { name: "list_my_campaigns", arguments: {} }, 3)
    ).result.content[0].text.includes(c.id),
  );
  await call(
    "/api/advertiser-connections",
    { action: "revoke", id: key.id },
    advertiser,
  );
  assert.equal(
    (
      await fetch(base + "/api/advertiser-mcp", {
        method: "POST",
        headers: { Authorization: "Bearer " + key.token },
        body: "{}",
      })
    ).status,
    401,
  );
  const registration = (
    await call("/advertiser/oauth/register", {
      client_name: "격리 OAuth",
      redirect_uris: ["http://127.0.0.1:1455/callback"],
    })
  ).value;
  const verifier = randomBytes(32).toString("base64url");
  const authorization = new URLSearchParams({
    client_id: registration.client_id,
    redirect_uri: "http://127.0.0.1:1455/callback",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: hashBase64(verifier),
    state: "acceptance-state",
    scope: "campaigns:read campaigns:order",
    resource: base + "/api/advertiser-mcp",
  });
  const auth = await fetch(
    base + "/advertiser/oauth/authorize?" + authorization,
    { redirect: "manual" },
  );
  assert.equal(auth.status, 302);
  const consentId = new URL(auth.headers.get("location")!).searchParams.get(
    "request",
  );
  const consentCookie = auth.headers.get("set-cookie")!.split(";")[0];
  const approved = (
    await call(
      "/advertiser/oauth/consent",
      { request: consentId, allow: true },
      advertiser + "; " + consentCookie,
    )
  ).value;
  const callback = new URL(approved.redirect);
  assert.equal(callback.searchParams.get("iss"), base + "/advertiser");
  const exchanged = await fetch(base + "/advertiser/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registration.client_id,
      redirect_uri: "http://127.0.0.1:1455/callback",
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
      resource: base + "/api/advertiser-mcp",
    }),
  });
  assert.equal(exchanged.status, 200);
  const oauthToken = await exchanged.json();
  const oauthCall = await fetch(base + "/api/advertiser-mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + oauthToken.access_token,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal((await oauthCall.json()).result.tools.length, 4);
  const connections = (
    await call("/api/advertiser-connections", undefined, advertiser)
  ).value;
  const oauthConnection = connections.find((r: any) => r.oauth);
  assert.ok(oauthConnection);
  await call(
    "/api/advertiser-connections",
    { action: "oauth-revoke", id: oauthConnection.id },
    advertiser,
  );
  const revoked = await fetch(base + "/api/advertiser-mcp", {
    method: "POST",
    headers: { Authorization: "Bearer " + oauthToken.access_token },
    body: "{}",
  });
  assert.equal(revoked.status, 401);
  const guestDetail = (await call("/api/campaigns?id=" + c.id)).value;
  assert.equal(guestDetail.locked, true);
  assert.equal(guestDetail.details, null);
  assert.equal(JSON.stringify(guestDetail).includes(input.guide), false);
  const memberDetail = (
    await call("/api/campaigns?id=" + c.id, undefined, participant)
  ).value;
  assert.equal(memberDetail.locked, false);
  assert.equal(memberDetail.details.guide, input.guide);
  assert.equal((await fetch(base + "/campaigns/" + c.id)).status, 200);
  assert.equal(
    (await call("/api/viewer", undefined, advertiser)).value.advertiser,
    true,
  );
  for (const page of [
    "/",
    "/signup",
    "/login",
    "/marketing",
    "/campaigns",
    "/ai",
    "/guide",
    "/participants/apply",
    "/participants/guide",
    "/advertisers",
    "/advertisers/connections",
    "/admin",
    "/admin/platform",
    "/participants/portal",
    "/policy",
  ])
    assert.equal((await fetch(base + page)).status, 200, page);
  console.log(
    "PASS: isolated HTTP role flow, checkout, payment, application, review, refund, MCP initialization/list/call/revoke, 15 pages and login-gated campaign details.",
  );
  if (process.env.PLATFORM_KEEP_SERVER === "1") {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      "outputs/platform-browser-session.json",
      JSON.stringify({
        base,
        schema: process.env.DB_SCHEMA,
        admin,
        advertiser,
        participant,
        campaignId: c.id,
      }),
    );
    console.log("Browser acceptance ready at " + base);
    process.once("SIGINT", () => {
      void cleanup().then(() => process.exit(0));
    });
    process.once("SIGTERM", () => {
      void cleanup().then(() => process.exit(0));
    });
  } else await cleanup();
} catch (e) {
  console.error(e);
  await cleanup();
  process.exitCode = 1;
}
