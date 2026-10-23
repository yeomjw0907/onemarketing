import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import "./helpers";
import { advertiserAuth } from "../src/lib/market";
import {
  registerMcpClient,
  beginMcpAuthorization,
  approveMcpAuthorization,
  exchangeMcpToken,
  mcpIdentity,
  mcpResource,
  revokeMcpGrant,
  validRedirect,
} from "../src/lib/advertiser-oauth";
import { mcpIdentity as adminIdentity } from "../src/lib/mcp-oauth";
import { POST as mcpPost } from "../src/app/api/advertiser-mcp/route";
import {
  advertiserMetadata,
  advertiserProtectedMetadata,
} from "../src/lib/advertiser-oauth-http";
const redirect = "http://127.0.0.1:1455/callback";
async function start(scope = "campaigns:read campaigns:order") {
  const a = await advertiserAuth(
    {
      action: "register",
      email: crypto.randomUUID() + "@test.local",
      password: "strong-password-123",
      name: "OAuth광고주",
      phone: "01012345678",
      consent: true,
    },
    crypto.randomUUID(),
  );
  const client = await registerMcpClient({
    client_name: "검증 AI",
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
  return { id: a.account.id, client, verifier, params, consent };
}
async function authorize(scope?: string) {
  const s = await start(scope);
  const callback = new URL(
    await approveMcpAuthorization(s.consent.id, s.consent.binding, s.id, true),
  );
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: s.client.client_id,
    redirect_uri: redirect,
    code: callback.searchParams.get("code")!,
    code_verifier: s.verifier,
    resource: mcpResource(),
  });
  const tokens = await exchangeMcpToken(params);
  return { ...s, callback, params, tokens };
}
test("advertiser OAuth discovery, browser binding, PKCE, audience and administrator isolation", async () => {
  assert.equal(
    advertiserMetadata().issuer,
    advertiserProtectedMetadata().authorization_servers[0],
  );
  assert.equal(
    advertiserMetadata().authorization_response_iss_parameter_supported,
    true,
  );
  assert.equal(
    validRedirect("https://chatgpt.com/connector_platform_oauth_redirect"),
    true,
  );
  assert.equal(
    validRedirect("https://chatgpt.com.evil.test/connector/callback"),
    false,
  );
  const s = await start();
  await assert.rejects(() =>
    approveMcpAuthorization(s.consent.id, "forged", s.id, true),
  );
  const wrong = new URLSearchParams(s.params);
  wrong.set("resource", "https://evil.test");
  await assert.rejects(() => beginMcpAuthorization(wrong));
  const result = await authorize();
  assert.equal(
    result.callback.searchParams.get("iss"),
    advertiserMetadata().issuer,
  );
  assert.equal(result.callback.searchParams.get("state"), "opaque-state");
  assert.equal(
    (await mcpIdentity(result.tokens.access_token))?.advertiserId,
    result.id,
  );
  assert.equal(await adminIdentity(result.tokens.access_token), null);
  await assert.rejects(() => exchangeMcpToken(result.params));
  const other = new URLSearchParams(result.params);
  other.set("code_verifier", "x".repeat(43));
  await assert.rejects(() => exchangeMcpToken(other));
});
test("read-only OAuth grant cannot invoke ordering tools and disconnect revokes access immediately", async () => {
  const s = await authorize("campaigns:read");
  const request = (method: string, params: unknown) =>
    new Request(mcpResource(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + s.tokens.access_token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  const listed = await (await mcpPost(request("tools/list", {}))).json();
  assert.equal(listed.result.tools.length, 3);
  const denied = await (
    await mcpPost(
      request("tools/call", { name: "create_campaign_order", arguments: {} }),
    )
  ).json();
  assert.equal(denied.result.isError, true);
  assert.ok(denied.result._meta["mcp/www_authenticate"]);
  await assert.rejects(async () =>
    revokeMcpGrant(
      (await mcpIdentity(s.tokens.access_token))!.grantId,
      crypto.randomUUID(),
    ),
  );
  await revokeMcpGrant(
    (await mcpIdentity(s.tokens.access_token))!.grantId,
    s.id,
  );
  assert.equal((await mcpPost(request("tools/list", {}))).status, 401);
});
test("refresh token rotates and reuse revokes the entire advertiser grant", async () => {
  const s = await authorize();
  const p = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: s.client.client_id,
    refresh_token: s.tokens.refresh_token,
    resource: mcpResource(),
  });
  const rotated = await exchangeMcpToken(p);
  assert.ok(await mcpIdentity(rotated.access_token));
  await assert.rejects(() => exchangeMcpToken(p));
  assert.equal(await mcpIdentity(rotated.access_token), null);
  assert.equal(await mcpIdentity(s.tokens.access_token), null);
});
