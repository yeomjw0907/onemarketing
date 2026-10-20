import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import "./helpers";
import {
  registerMcpClient,
  beginMcpAuthorization,
  approveMcpAuthorization,
  exchangeMcpToken,
  mcpIdentity,
  mcpConsent,
  revokeMcpToken,
  mcpResource,
  validRedirect,
  mcpConnections,
  revokeMcpGrant,
  mcpRateLimit,
} from "../src/lib/mcp-oauth";
import { callMcpTool, mcpToolDefinitions } from "../src/lib/mcp-tools";
import { query, list, view, execute } from "../src/lib/db";
import { save } from "../src/lib/domain";
import { POST as mcpPost } from "../src/app/api/mcp/route";
import { GET as protectedMetadata } from "../src/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as authMetadata } from "../src/app/.well-known/oauth-authorization-server/route";
const email = "mcp-test@local.test";
const old = {
  admin: process.env.ADMIN_USERS_JSON,
  url: process.env.APP_URL,
  enabled: process.env.MCP_ENABLED,
};
process.env.ADMIN_USERS_JSON = JSON.stringify([{ email, hash: "not-used" }]);
process.env.APP_URL = "http://127.0.0.1:3118";
process.env.MCP_ENABLED = "true";
after(() => {
  for (const [key, value] of Object.entries({
    ADMIN_USERS_JSON: old.admin,
    APP_URL: old.url,
    MCP_ENABLED: old.enabled,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const redirect = "http://127.0.0.1:1455/callback";
async function start(scope = "catalog:read catalog:write campaigns:draft") {
  const client = await registerMcpClient({
    client_name: "MCP QA",
    redirect_uris: [redirect],
  });
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "opaque-state",
    scope,
    resource: mcpResource(),
  });
  const consent = await beginMcpAuthorization(params);
  return { client, verifier, params, consent };
}
async function authorized(scope?: string) {
  const s = await start(scope);
  const url = new URL(
    await approveMcpAuthorization(s.consent.id, s.consent.binding, email, true),
  );
  const p = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: s.client.client_id,
    redirect_uri: redirect,
    code: url.searchParams.get("code")!,
    code_verifier: s.verifier,
    resource: mcpResource(),
  });
  const tokens = await exchangeMcpToken(p);
  const identity = (await mcpIdentity(tokens.access_token))!;
  return { ...s, p, tokens, identity };
}

test("OAuth discovery binds exact resource, public PKCE clients and registered safe callbacks", async () => {
  const meta = await (await authMetadata()).json();
  assert.deepEqual(meta.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(meta.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(
    (await (await protectedMetadata()).json()).resource,
    mcpResource(),
  );
  for (const uri of [
    "https://evil.test/callback",
    "javascript:alert(1)",
    "https://chatgpt.com.evil.test/connector/callback",
    "http://localhost:1234/callback#leak",
    "http://user@localhost:1234/callback",
  ])
    assert.equal(validRedirect(uri), false);
  assert.equal(
    validRedirect("https://chatgpt.com/connector_platform_oauth_redirect"),
    true,
  );
  assert.equal(
    validRedirect("https://chatgpt.com/connector/abc/oauth/callback"),
    true,
  );
  await assert.rejects(
    registerMcpClient({ redirect_uris: ["https://evil.test/callback"] }),
  );
  const s = await start();
  s.params.set("redirect_uri", "http://127.0.0.1:9999/callback");
  await assert.rejects(beginMcpAuthorization(s.params));
});
test("OAuth rejects wrong audience, unsupported scopes, plain PKCE and forged browser binding", async () => {
  const s = await start();
  for (const [key, value] of [
    ["resource", "https://evil.test"],
    ["scope", "contracts:confirm"],
    ["code_challenge_method", "plain"],
  ]) {
    const p = new URLSearchParams(s.params);
    p.set(key, value);
    await assert.rejects(beginMcpAuthorization(p));
  }
  await assert.rejects(
    approveMcpAuthorization(s.consent.id, "forged", email, true),
  );
  await assert.rejects(
    approveMcpAuthorization(
      s.consent.id,
      s.consent.binding,
      "not-admin@test",
      true,
    ),
  );
  const denied = new URL(
    await approveMcpAuthorization(
      s.consent.id,
      s.consent.binding,
      email,
      false,
    ),
  );
  assert.equal(denied.searchParams.get("state"), "opaque-state");
  assert.equal(denied.searchParams.get("error"), "access_denied");
  assert.equal(denied.searchParams.has("code"), false);
  await assert.rejects(mcpConsent(s.consent.id));
});
test("authorization code needs matching PKCE, redirect and client; code is single use", async () => {
  const s = await start();
  const callback = new URL(
    await approveMcpAuthorization(s.consent.id, s.consent.binding, email, true),
  );
  const p = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: s.client.client_id,
    redirect_uri: redirect,
    code: callback.searchParams.get("code")!,
    code_verifier: s.verifier,
  });
  for (const [key, value] of [
    ["code_verifier", "x".repeat(43)],
    ["redirect_uri", "http://127.0.0.1:9999/callback"],
  ]) {
    const bad = new URLSearchParams(p);
    bad.set(key, value);
    await assert.rejects(exchangeMcpToken(bad));
  }
  const token = await exchangeMcpToken(p);
  assert.equal((await mcpIdentity(token.access_token))?.email, email);
  await assert.rejects(exchangeMcpToken(p));
  assert.equal(await mcpIdentity("not-a-token"), null);
  const rows = await query<{ data: unknown; key: string }>(
    "select key,data from mcp_oauth",
  );
  const stored = JSON.stringify(rows);
  assert.equal(stored.includes(token.access_token), false);
  assert.equal(stored.includes(token.refresh_token), false);
  assert.equal(Object.hasOwn(await view(), "mcp_oauth"), false);
});
test("rotating refresh replay revokes the whole grant, and explicit revocation invalidates access", async () => {
  const a = await authorized();
  const p = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: a.client.client_id,
    refresh_token: a.tokens.refresh_token,
    resource: mcpResource(),
  });
  const next = await exchangeMcpToken(p);
  assert.ok(await mcpIdentity(next.access_token));
  await assert.rejects(exchangeMcpToken(p));
  assert.equal(await mcpIdentity(next.access_token), null);
  assert.equal(await mcpIdentity(a.tokens.access_token), null);
  const b = await authorized();
  await revokeMcpToken(b.tokens.refresh_token, b.client.client_id);
  assert.equal(await mcpIdentity(b.tokens.access_token), null);
  const c = await authorized();
  assert.ok(
    (await mcpConnections(email)).some((g) => g.id === c.identity.grantId),
  );
  await assert.rejects(
    revokeMcpGrant(c.identity.grantId, "another-admin@test"),
  );
  await revokeMcpGrant(c.identity.grantId, email);
  assert.equal(await mcpIdentity(c.tokens.access_token), null);
});
test("expired access and removed admins are rejected; rate limits persist", async () => {
  const a = await authorized();
  process.env.ADMIN_USERS_JSON = "[]";
  assert.equal(await mcpIdentity(a.tokens.access_token), null);
  process.env.ADMIN_USERS_JSON = JSON.stringify([{ email }]);
  await execute(
    "update mcp_oauth set expires=0 where kind='access' and data->>'grantId'=$1",
    [a.identity.grantId],
  );
  assert.equal(await mcpIdentity(a.tokens.access_token), null);
  const key = randomUUID();
  await mcpRateLimit(key, 1);
  await assert.rejects(mcpRateLimit(key, 1));
});
test("read-only scopes cannot mutate or call forbidden contract/message tools", async () => {
  const { identity } = await authorized("catalog:read");
  await assert.rejects(
    callMcpTool(
      "create_customer",
      { name: "No write", requestId: randomUUID(), confirmed: true },
      identity,
    ),
  );
  for (const tool of [
    "confirm_contract",
    "confirm_quote",
    "send_kakao",
    "propose_work",
    "generate_video",
    "pay",
  ])
    await assert.rejects(callMcpTool(tool, {}, identity));
  assert.equal(mcpToolDefinitions.length, 6);
  assert.ok(
    mcpToolDefinitions.every((t) => t.annotations.openWorldHint === false),
  );
});
test("confirmed catalog writes are idempotent, detect changed retries and return duplicates without overwriting", async () => {
  const { identity } = await authorized();
  const body = {
    name: "연결 테스트 고객",
    brand: "원케이션",
    confirmed: true,
    requestId: randomUUID(),
  };
  await assert.rejects(
    callMcpTool("create_customer", { ...body, confirmed: false }, identity),
  );
  const [a, b] = (await Promise.all([
    callMcpTool("create_customer", body, identity),
    callMcpTool("create_customer", body, identity),
  ])) as any[];
  assert.equal(a.record.id, b.record.id);
  await assert.rejects(
    callMcpTool("create_customer", { ...body, brand: "changed" }, identity),
  );
  const dup = (await callMcpTool(
    "create_customer",
    { ...body, requestId: randomUUID(), brand: "do not overwrite" },
    identity,
  )) as any;
  assert.equal(dup.existing, true);
  assert.equal(dup.record.brand, "원케이션");
  const prod = (await callMcpTool(
    "create_product",
    {
      customerId: a.record.id,
      name: "연결 제품",
      facts: "확인된 정보",
      confirmed: true,
      requestId: randomUUID(),
    },
    identity,
  )) as any;
  const search = (await callMcpTool(
    "search",
    { query: "연결 제품" },
    identity,
  )) as any;
  assert.ok(search.results.some((r: any) => r.id === prod.record.id));
  const customer = (await callMcpTool(
    "fetch",
    { id: a.record.id },
    identity,
  )) as any;
  assert.equal(Object.hasOwn(customer, "contact"), false);
  assert.equal(Object.hasOwn(customer, "notes"), false);
});
test("campaign tools save only a real reviewable draft with exact totals and no downstream effects", async () => {
  const { identity } = await authorized();
  const c = await save("customers", { name: "초안 고객" }, email),
    p = await save("products", { name: "초안 제품", customerId: c.id }, email);
  const price = await save(
    "prices",
    {
      name: "블로그 3장",
      channel: "blog",
      sale: 30000,
      payout: 4000,
      aiEstimate: 1000,
      images: 3,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    email,
  );
  const kinds = [
    "contracts",
    "projects",
    "work_offers",
    "notification_outbox",
    "jobs",
  ] as const;
  const before = await Promise.all(
    kinds.map(async (k) => (await list(k)).length),
  );
  const input = {
    name: "확인용 캠페인",
    customerId: c.id,
    productId: p.id,
    start: "2030-01-01",
    end: "2030-01-31",
    blog: 3,
    clip: 0,
    blogPriceId: price.id,
    requestId: randomUUID(),
    confirmed: true,
  };
  const d = (await callMcpTool(
    "create_campaign_draft",
    input,
    identity,
  )) as any;
  assert.equal(d.status, "draft");
  assert.equal(d.supply, 90000);
  assert.equal(d.total, 99000);
  assert.equal(
    (d.timeline as any[]).reduce((n, w) => n + w.blog, 0),
    3,
  );
  assert.deepEqual(
    await Promise.all(kinds.map(async (k) => (await list(k)).length)),
    before,
  );
  const retry = (await callMcpTool(
    "create_campaign_draft",
    input,
    identity,
  )) as any;
  assert.equal(retry.id, d.id);
  await assert.rejects(
    callMcpTool(
      "create_campaign_draft",
      { ...input, requestId: randomUUID(), start: undefined },
      identity,
    ),
  );
  await assert.rejects(
    callMcpTool(
      "create_campaign_draft",
      { ...input, requestId: randomUUID(), status: "confirmed" },
      identity,
    ),
  );
});
test("actual Streamable HTTP discovery, initialize and tool calls require bearer auth, never admin cookies", async () => {
  const unauth = await mcpPost(
    new Request(mcpResource(), {
      method: "POST",
      headers: { cookie: "om_session=fake" },
      body: "{}",
    }),
  );
  assert.equal(unauth.status, 401);
  assert.match(
    unauth.headers.get("www-authenticate")!,
    /oauth-protected-resource/,
  );
  const { tokens } = await authorized();
  async function rpc(method: string, params: unknown = {}) {
    return mcpPost(
      new Request(mcpResource(), {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokens.access_token,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
  }
  const init = await (
    await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "qa", version: "1" },
    })
  ).json();
  assert.equal(init.result.serverInfo.name, "onecation");
  const definitions = await (await rpc("tools/list")).json();
  assert.equal(definitions.result.tools.length, 6);
  const search = await (
    await rpc("tools/call", {
      name: "search",
      arguments: { query: "초안 고객" },
    })
  ).json();
  assert.ok(search.result.structuredContent.results.length);
  const denied = await (
    await rpc("tools/call", { name: "send_kakao", arguments: {} })
  ).json();
  assert.equal(denied.result.isError, true);
  const crossOrigin = await mcpPost(
    new Request(mcpResource(), {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        authorization: "Bearer " + tokens.access_token,
      },
      body: "{}",
    }),
  );
  assert.equal(crossOrigin.status, 403);
});
