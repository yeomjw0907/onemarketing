import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, get, list, update } from "../src/lib/db";
import { issuePortal, portalParticipant } from "../src/lib/portal";
import {
  requestPortalCode,
  verifyPortalCode,
  revokePortalSession,
} from "../src/lib/portal-auth";
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
Object.assign(process.env, {
  SENS_SMS_ENABLED: "true",
  SENS_SMS_SERVICE_ID: "test",
  SENS_SMS_FROM: "0212345678",
  NCP_ACCESS_KEY: "test",
  NCP_SECRET_KEY: "test",
});
let lastCode = "",
  sends = 0,
  fail = false;
globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(String(options?.body));
  assert.equal(body.type, "SMS");
  assert.equal(body.contentType, "COMM");
  lastCode = body.content.match(/\d{6}/)[0];
  sends++;
  return new Response(
    JSON.stringify(fail ? { statusCode: "400" } : { statusCode: "202" }),
  );
};
async function fixture(phone: string) {
  const p = await create("participants", {
    name: "test",
    phone,
    status: "active",
  });
  const { url } = await issuePortal(p.id, "test");
  return {
    p,
    access: new URL(url, "https://example.com").searchParams.get("access")!,
  };
}
test("personal link cannot login until OTP; session differs, code single-use, logout revokes", async () => {
  const { p, access } = await fixture("01011110001");
  await assert.rejects(portalParticipant(access));
  const { challenge } = await requestPortalCode({ access, ip: "a" });
  const code = lastCode;
  await assert.rejects(verifyPortalCode(challenge, "000000"));
  const session = await verifyPortalCode(challenge, code);
  assert.notEqual(session, access);
  assert.equal((await portalParticipant(session)).id, p.id);
  await assert.rejects(verifyPortalCode(challenge, code));
  const rows = await list("portal_links");
  assert.ok(!JSON.stringify(rows).includes(code));
  await revokePortalSession(session);
  await assert.rejects(portalParticipant(session));
});
test("common notification URL can authenticate by registered phone; phone change invalidates session", async () => {
  const { p } = await fixture("01011110002");
  const { challenge } = await requestPortalCode({
    phone: "010-1111-0002",
    ip: "b",
  });
  const session = await verifyPortalCode(challenge, lastCode);
  assert.equal((await portalParticipant(session)).id, p.id);
  await update(p.id, { phone: "01011110003" });
  await assert.rejects(portalParticipant(session));
});
test("five bad attempts lock code, expiry and resend cooldown enforced", async () => {
  const { access } = await fixture("01011110004");
  const { challenge } = await requestPortalCode({ access, ip: "c" });
  const code = lastCode;
  await assert.rejects(requestPortalCode({ access, ip: "c" }), /1분/);
  for (let i = 0; i < 5; i++)
    await assert.rejects(verifyPortalCode(challenge, "000000"));
  await assert.rejects(verifyPortalCode(challenge, code));
  const { access: other } = await fixture("01011110005");
  const r = await requestPortalCode({ access: other, ip: "d" });
  const row = (await list("portal_links")).find(
    (l) =>
      l.purpose === "challenge" &&
      l.participantId &&
      l.ipHash &&
      l.status === "sent" &&
      l.attempts === 0,
  );
  assert.ok(row);
  const all = await list("portal_links");
  for (const l of all.filter((l) => l.purpose === "challenge"))
    await update(l.id, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
  await assert.rejects(verifyPortalCode(r.challenge, lastCode));
});
test("reissue invalidates session and pending OTP; unregistered/ambiguous phone cannot login", async () => {
  const { p, access } = await fixture("01011110006");
  const { challenge } = await requestPortalCode({ access, ip: "e" });
  const code = lastCode;
  await issuePortal(p.id, "test");
  await assert.rejects(verifyPortalCode(challenge, code));
  const before = sends;
  const missing = await requestPortalCode({ phone: "01099999999", ip: "f" });
  assert.equal(sends, before);
  await assert.rejects(verifyPortalCode(missing.challenge, lastCode));
  await create("participants", {
    name: "duplicate",
    phone: "01011110006",
    status: "active",
  });
  await requestPortalCode({ phone: "01011110006", ip: "g" });
  assert.equal(sends, before);
});
test("provider failure never enables verification; missing config fails closed", async () => {
  const { access } = await fixture("01011110007");
  fail = true;
  await assert.rejects(requestPortalCode({ access, ip: "h" }), /보내지 못/);
  fail = false;
  process.env.SENS_SMS_ENABLED = "false";
  await assert.rejects(requestPortalCode({ access, ip: "i" }), /준비 중/);
  process.env.SENS_SMS_ENABLED = "true";
});
