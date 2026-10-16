import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, list, update } from "../src/lib/db";
import { issuePortal, portalParticipant } from "../src/lib/portal";
import {
  beginKakao,
  completeKakao,
  pendingKakao,
  requestKakaoLink,
  reviewKakaoLink,
  bindKakao,
  unlinkKakao,
} from "../src/lib/kakao-auth";
Object.assign(process.env, {
  KAKAO_LOGIN_ENABLED: "true",
  KAKAO_CLIENT_ID: "test",
  KAKAO_CLIENT_SECRET: "secret",
  APP_URL: "https://example.com",
});
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
let userId = 101,
  calls = 0;
globalThis.fetch = async (url, init) => {
  calls++;
  if (String(url).endsWith("/oauth/token")) {
    const b = init?.body as URLSearchParams;
    assert.equal(b.get("client_secret"), "secret");
    assert.equal(
      b.get("redirect_uri"),
      "https://example.com/api/auth/kakao/callback",
    );
    return Response.json({ access_token: "test-token" });
  }
  assert.equal(
    new Headers(init?.headers).get("authorization"),
    "Bearer test-token",
  );
  return Response.json({
    id: userId,
    kakao_account: { profile: { nickname: "동일한 이름" } },
  });
};
async function login(id: number, access?: string) {
  userId = id;
  const { state } = await beginKakao(access);
  return completeKakao(state, state, "code");
}
test("OAuth state mismatch, expiry and replay are rejected before provider requests", async () => {
  const { state } = await beginKakao();
  const before = calls;
  await assert.rejects(completeKakao(state, "f".repeat(64), "code"));
  assert.equal(calls, before);
  await completeKakao(state, state, "code");
  const sent = calls;
  await assert.rejects(completeKakao(state, state, "code"));
  assert.equal(calls, sent);
  const next = await beginKakao();
  for (const r of (await list("portal_links")).filter(
    (r) => r.purpose === "kakao-oauth" && !r.usedAt,
  ))
    await update(r.id, { expiresAt: new Date(0).toISOString() });
  await assert.rejects(completeKakao(next.state, next.state, "code"));
});
test("link possession and matching name do not authenticate; manual review binds once", async () => {
  const p = await create("participants", {
    name: "동일한 이름",
    phone: "01011112222",
    status: "active",
  });
  const { url } = await issuePortal(p.id, "admin"),
    access = url.split("access=")[1];
  const pending = await login(102, access);
  assert.equal(pending.session, undefined);
  assert.equal((await pendingKakao(pending.identity!)).candidateId, p.id);
  await assert.rejects(portalParticipant(access));
  const request = await requestKakaoLink(
    pending.identity!,
    "동일한 이름",
    "01011112222",
  );
  assert.equal(
    (await requestKakaoLink(pending.identity!, "동일한 이름", "01011112222"))
      .id,
    request.id,
  );
  await assert.rejects(reviewKakaoLink(request.id, p.id, true, "", "admin"));
  await reviewKakaoLink(
    request.id,
    p.id,
    true,
    "기존 등록 연락처 확인",
    "admin",
  );
  const linked = await login(102);
  assert.equal((await portalParticipant(linked.session!)).id, p.id);
  const other = await create("participants", {
    name: "다른 사람",
    phone: "01011113333",
    status: "active",
  });
  await assert.rejects(bindKakao("102", other.id, "admin", "확인"));
  await assert.rejects(bindKakao("103", p.id, "admin", "확인"));
  await issuePortal(p.id, "admin");
  await assert.rejects(portalParticipant(linked.session!));
  const again = await login(102);
  assert.equal((await portalParticipant(again.session!)).id, p.id);
  await update(p.id, { status: "paused" });
  await assert.rejects(login(102));
  await assert.rejects(portalParticipant(again.session!));
});
test("declining channel consent does not block login; rejected connection can be requested again", async () => {
  const result = await login(104);
  const r = await requestKakaoLink(result.identity!, "이름", "01022223333");
  await reviewKakaoLink(
    r.id,
    "",
    false,
    "등록 연락처로 확인되지 않음",
    "admin",
  );
  const next = await requestKakaoLink(
    result.identity!,
    "수정 이름",
    "01022224444",
  );
  assert.notEqual(next.id, r.id);
  const begin = await beginKakao(undefined, true);
  assert.equal(new URL(begin.url).searchParams.get("prompt"), "login");
  assert.equal(
    new URL(begin.url).searchParams.get("redirect_uri"),
    "https://example.com/api/auth/kakao/callback",
  );
});
test("concurrent binding cannot assign one Kakao account to two participants", async () => {
  const a = await create("participants", {
    name: "A",
    phone: "01033334444",
    status: "active",
  });
  const b = await create("participants", {
    name: "B",
    phone: "01033335555",
    status: "active",
  });
  const outcomes = await Promise.allSettled([
    bindKakao("105", a.id, "admin", "확인"),
    bindKakao("105", b.id, "admin", "확인"),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
});

test("unlink removes login identity and invalidates browser access", async () => {
  const p = await create("participants", {
    name: "unlink",
    phone: "01055556666",
    status: "active",
  });
  await bindKakao("106", p.id, "admin", "확인");
  const signed = await login(106);
  assert.equal((await portalParticipant(signed.session!)).id, p.id);
  await unlinkKakao("106");
  await assert.rejects(portalParticipant(signed.session!));
  assert.equal((await login(106)).session, undefined);
  await bindKakao("106", p.id, "admin", "재연결 확인");
  await assert.rejects(portalParticipant(signed.session!));
  assert.equal((await portalParticipant((await login(106)).session!)).id, p.id);
});
