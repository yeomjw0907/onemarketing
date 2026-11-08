import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, list, update } from "../src/lib/db";
import {
  beginSocial,
  completeSocial,
  type AdditionalProvider,
  socialConfigured,
} from "../src/lib/social-oauth";
import { socialIdentityKey } from "../src/lib/social-identity";
import { bindKakao, pendingKakao, unlinkKakao } from "../src/lib/kakao-auth";
import { portalParticipant } from "../src/lib/portal";
import { advertiserKakaoLogin } from "../src/lib/advertiser-social";
import { advertiserAuth } from "../src/lib/market";
Object.assign(process.env, {
  APP_URL: "https://example.com",
  GOOGLE_LOGIN_ENABLED: "true",
  GOOGLE_CLIENT_ID: "google-test",
  GOOGLE_CLIENT_SECRET: "google-secret",
  NAVER_LOGIN_ENABLED: "true",
  NAVER_CLIENT_ID: "naver-test",
  NAVER_CLIENT_SECRET: "naver-secret",
});
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
let subject = "same-subject",
  calls = 0,
  bad = false;
globalThis.fetch = async (input, init) => {
  calls++;
  const url = String(input);
  if (url.endsWith("/token")) {
    const body = init!.body as URLSearchParams;
    const google = url.includes("googleapis");
    assert.equal(
      body.get("client_secret"),
      google ? "google-secret" : "naver-secret",
    );
    assert.equal(
      body.get("redirect_uri"),
      `https://example.com/api/auth/${google ? "google" : "naver"}/callback`,
    );
    if (google) assert.match(body.get("code_verifier")!, /^[\w-]{43}$/);
    else assert.match(body.get("state")!, /^[a-f0-9]{64}$/);
    return Response.json({ access_token: "provider-token" });
  }
  assert.equal(
    new Headers(init?.headers).get("authorization"),
    "Bearer provider-token",
  );
  if (bad)
    return Response.json({ resultcode: "99", response: { id: subject } });
  return Response.json(
    url.includes("googleapis")
      ? { sub: subject, name: "동일 표시명", email: "same@test.local" }
      : { resultcode: "00", response: { id: subject } },
  );
};
async function login(
  provider: AdditionalProvider,
  role: "participant" | "advertiser" = "participant",
) {
  const { state } = await beginSocial(provider, role);
  return completeSocial(provider, state, state, "code");
}
for (const provider of ["google", "naver"] as const) {
  test(`${provider}: state cookie, provider binding, expiry and replay enforced before requests`, async () => {
    const { state, url } = await beginSocial(provider, "participant");
    const parsed = new URL(url);
    assert.equal(
      parsed.searchParams.get("redirect_uri"),
      `https://example.com/api/auth/${provider}/callback`,
    );
    if (provider === "google") {
      assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
      assert.equal(parsed.searchParams.get("scope"), "openid profile");
    }
    const before = calls;
    await assert.rejects(
      completeSocial(provider, state, "f".repeat(64), "code"),
    );
    await assert.rejects(
      completeSocial(
        provider === "google" ? "naver" : "google",
        state,
        state,
        "code",
      ),
    );
    assert.equal(calls, before);
    await completeSocial(provider, state, state, "code");
    const sent = calls;
    await assert.rejects(completeSocial(provider, state, state, "code"));
    assert.equal(calls, sent);
    const expired = await beginSocial(provider, "participant");
    for (const r of (await list("portal_links")).filter(
      (r) => r.purpose === "social-oauth" && !r.usedAt,
    ))
      await update(r.id, { expiresAt: new Date(0).toISOString() });
    await assert.rejects(
      completeSocial(provider, expired.state, expired.state, "code"),
    );
    const disabled = provider.toUpperCase() + "_LOGIN_ENABLED";
    process.env[disabled] = "false";
    assert.equal(socialConfigured(provider), false);
    await assert.rejects(beginSocial(provider, "participant"));
    process.env[disabled] = "true";
  });
  test(`${provider}: independent participant identity and revoked binding invalidates sessions`, async () => {
    subject = "participant-" + provider;
    const first = await login(provider);
    assert.ok(first.identity);
    assert.equal(first.session, undefined);
    const key = String((await pendingKakao(first.identity!)).kakaoId);
    assert.equal(key, socialIdentityKey(provider, subject));
    const participant = await create("participants", {
      name: "회원",
      phone: "01012345678",
      status: "active",
      accounts: [],
    });
    await bindKakao(
      provider === "google" ? "9876543" : "9876544",
      participant.id,
      "admin",
      "기존 카카오 확인",
    );
    await bindKakao(key, participant.id, "admin", "새 제공자 소유 확인");
    const signed = await login(provider);
    assert.equal((await portalParticipant(signed.session!)).id, participant.id);
    const binding = (await list("portal_links")).find(
      (r) => r.purpose === "kakao-account" && r.kakaoId === key,
    )!;
    await update(binding.id, { revokedAt: new Date().toISOString() });
    await assert.rejects(portalParticipant(signed.session!));
  });
  test(`${provider}: advertiser registration and explicit existing-password link, no email auto-merge`, async () => {
    subject = "advertiser-" + provider;
    const first = await login(provider, "advertiser");
    assert.ok(first.advertiserIdentity);
    assert.equal(await advertiserKakaoLogin(first.advertiserIdentity!), null);
    const registration = {
      companyName: "업체",
      brand: "브랜드",
      industry: "생활용품",
      businessType: "individual",
      businessNumber: "1234567890",
      address: "서울",
      website: "https://example.com",
      description: "친환경 생활용품 판매",
      email: provider + "@test.local",
      name: "담당자",
      phone: "01012345678",
      consent: true,
      password: "password-test-123",
      action: "register",
    };
    const account = await advertiserAuth(registration, crypto.randomUUID());
    await assert.rejects(
      advertiserKakaoLogin(
        first.advertiserIdentity!,
        { ...registration, action: "social-register" },
        crypto.randomUUID(),
      ),
    );
    await assert.rejects(
      advertiserKakaoLogin(
        first.advertiserIdentity!,
        {
          action: "social-link",
          email: registration.email,
          password: "incorrect-password",
        },
        crypto.randomUUID(),
      ),
    );
    const linked = await advertiserKakaoLogin(
      first.advertiserIdentity!,
      {
        action: "social-link",
        email: registration.email,
        password: registration.password,
      },
      crypto.randomUUID(),
    );
    assert.equal(linked?.account.id, account.account.id);
    const repeat = await login(provider, "advertiser");
    assert.equal(
      (await advertiserKakaoLogin(repeat.advertiserIdentity!))?.account.id,
      account.account.id,
    );
    await unlinkKakao(socialIdentityKey(provider, subject));
    const next = await login(provider, "advertiser");
    assert.equal(await advertiserKakaoLogin(next.advertiserIdentity!), null);
  });
}
test("provider namespace prevents subject collisions; failed provider response never authenticates", async () => {
  assert.notEqual(
    socialIdentityKey("google", "123"),
    socialIdentityKey("naver", "123"),
  );
  assert.notEqual(
    socialIdentityKey("kakao", "123"),
    socialIdentityKey("google", "123"),
  );
  bad = true;
  try {
    await assert.rejects(login("naver"));
  } finally {
    bad = false;
  }
});
