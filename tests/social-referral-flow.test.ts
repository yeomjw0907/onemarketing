import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, get, list, transaction } from "../src/lib/db";
import {
  beginKakao,
  completeKakao,
  pendingKakao,
  kakaoOnboarding,
} from "../src/lib/kakao-auth";
import { beginSocial, completeSocial } from "../src/lib/social-oauth";
import { socialSignupPath, referralContext } from "../src/lib/social-referral";
import {
  submitApplication,
  listApplications,
} from "../src/lib/participant-applications";
import { portalParticipant } from "../src/lib/portal";
import { revokePortalSession } from "../src/lib/portal-auth";
import { settleReferrals, syncReferral } from "../src/lib/referrals";
Object.assign(process.env, {
  APP_URL: "https://example.com",
  KAKAO_LOGIN_ENABLED: "true",
  KAKAO_CLIENT_ID: "qa-kakao",
  KAKAO_CLIENT_SECRET: "qa-secret",
  GOOGLE_LOGIN_ENABLED: "true",
  GOOGLE_CLIENT_ID: "qa-google",
  GOOGLE_CLIENT_SECRET: "qa-secret",
  SENS_ENABLED: "false",
});
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
let subject = 9001;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/token"))
    return Response.json({ access_token: "test-token" });
  if (url.includes("googleapis"))
    return Response.json({ sub: String(subject), name: "가상 참여자" });
  if (url.includes("kapi.kakao"))
    return Response.json({
      id: subject,
      kakao_account: { profile: { nickname: "가상 참여자" } },
    });
  return original(input, init);
};
for (const provider of ["kakao", "google"] as const)
  test(`${provider}: OAuth referral survives signup, logout/relogin and first-campaign reward lifecycle`, async () => {
    subject = provider === "kakao" ? 9001 : 9002;
    const code = "ref-" + provider;
    const referrer = await create("participants", {
      name: "추천인",
      phone: "0105555000" + (provider === "kakao" ? "1" : "2"),
      status: "active",
      referralCode: code,
      payment: { method: "kakaopay" },
      accounts: [],
    });
    async function login(referral?: string) {
      const { state } =
        provider === "kakao"
          ? await beginKakao(undefined, false, false, "participant", referral)
          : await beginSocial("google", "participant", undefined, referral);
      return provider === "kakao"
        ? completeKakao(state, state, "code")
        : completeSocial("google", state, state, "code");
    }
    const signed = await login(code);
    assert.ok(signed.identity);
    assert.equal(signed.referralCode, code);
    const pending = await pendingKakao(signed.identity!);
    assert.equal(pending.referralCode, code);
    assert.equal((await kakaoOnboarding(signed.identity!)).referralCode, code);
    const callback = new URL(
      socialSignupPath(provider, signed.referralCode),
      "https://example.com",
    );
    assert.equal(callback.pathname, "/participants/apply");
    assert.equal(callback.searchParams.get("ref"), code);
    const input = {
      key: crypto.randomUUID(),
      consent: true,
      data: {
        name: "소셜 추천 가입",
        phone: provider === "kakao" ? "01090019001" : "01090029002",
        payment: { method: "kakaopay" },
        referralCode: callback.searchParams.get("ref"),
        accounts: [
          {
            id: crypto.randomUUID(),
            channel: "blog",
            url: "https://blog.naver.com/social-referral-" + provider,
          },
        ],
      },
    };
    const identityKey = String(pending.kakaoId);
    await assert.rejects(
      submitApplication(
        {
          ...input,
          key: crypto.randomUUID(),
          data: { ...input.data, phone: referrer.phone },
        },
        identityKey,
      ),
      /본인을 추천/,
    );
    await submitApplication(input, identityKey);
    await submitApplication(input, identityKey);
    const application = (await listApplications()).find(
      (a) => a.id === input.key,
    )!;
    const participant = await get(application.participant_id!);
    assert.equal(participant?.referrerId, referrer.id);
    let credits = (await list("referral_credits")).filter(
      (c) => c.sourceId === input.key,
    );
    assert.equal(credits.length, 1);
    assert.equal(credits[0].amount, 2000);
    assert.equal(credits[0].status, "pending_campaign");
    await assert.rejects(settleReferrals(referrer.id, "admin"));
    const first = await login();
    assert.equal((await portalParticipant(first.session!)).id, participant!.id);
    await revokePortalSession(first.session!);
    await assert.rejects(portalParticipant(first.session!));
    const again = await login("different-referrer");
    assert.equal((await portalParticipant(again.session!)).id, participant!.id);
    assert.equal((await get(participant!.id))?.referrerId, referrer.id);
    const task = await create("tasks", {
      participantId: participant!.id,
      channel: "blog",
      status: "completed",
      referralRate: 1000,
    });
    await transaction(() => syncReferral(task, true, "admin"));
    await transaction(() => syncReferral(task, true, "admin"));
    credits = (await list("referral_credits")).filter(
      (c) => c.participantId === referrer.id,
    );
    assert.equal(credits.length, 2);
    assert.equal(credits.find((c) => c.type === "signup")?.status, "available");
    const settlement = await settleReferrals(referrer.id, "admin");
    assert.equal(settlement.total, 3000);
    await assert.rejects(settleReferrals(referrer.id, "admin"));
    await transaction(() => syncReferral(task, false, "admin"));
    assert.equal(
      (await get(credits.find((c) => c.type === "signup")!.id))?.status,
      "recovery_required",
    );
  });
test("referral context cannot inject return parameters or carry oversized values", () => {
  assert.equal(referralContext("x".repeat(41)), "");
  const url = new URL(
    socialSignupPath("google", "abc&next=https://bad.example"),
    "https://example.com",
  );
  assert.equal(url.searchParams.get("ref"), "abc&next=https://bad.example");
  assert.equal(url.searchParams.has("next"), false);
});
