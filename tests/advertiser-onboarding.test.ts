import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { advertiserAuth, advertiserSession } from "../src/lib/market";
import { provisionCustomerAccount } from "../src/lib/customer-account";
import {
  advertiserKakaoLogin,
  advertiserKakaoPending,
} from "../src/lib/advertiser-social";
import { beginKakao, completeKakao, unlinkKakao } from "../src/lib/kakao-auth";
import { get, list, query } from "../src/lib/db";
const profile = {
  companyName: "테스트 업체",
  brand: "테스트 브랜드",
  industry: "생활용품",
  businessType: "individual",
  businessNumber: "123-45-67890",
  address: "서울 강남구",
  website: "https://example.com",
  description: "친환경 생활용품 판매",
};
const registration = () => ({
  ...profile,
  action: "register",
  email: `${crypto.randomUUID()}@test.local`,
  password: "test-password-123",
  name: "담당자",
  phone: "01012345678",
  consent: true,
});
test("가입 시 고객 생성·연결 및 업체 정보 보존, 필수 정보 누락 거절", async () => {
  const input = registration();
  const auth = await advertiserAuth(input, crypto.randomUUID());
  const customer = await get(auth.account.customer_id!);
  assert.equal(customer?.name, profile.companyName);
  assert.equal(customer?.industry, profile.industry);
  assert.equal(customer?.businessNumber, "1234567890");
  assert.equal(customer?.email, input.email);
  assert.equal(customer?.description, profile.description);
  assert.equal(customer?.contactName, input.name);
  assert.equal(customer?.phone, input.phone);
  assert.equal(customer?.brand, profile.brand);
  assert.equal(customer?.businessType, profile.businessType);
  assert.equal(customer?.address, profile.address);
  assert.equal(customer?.website, profile.website);
  await assert.rejects(
    advertiserAuth({ ...registration(), industry: "" }, crypto.randomUUID()),
  );
  await assert.rejects(
    advertiserAuth({ ...registration(), consent: false }, crypto.randomUUID()),
  );
  const login = await advertiserAuth(
    { action: "login", email: input.email, password: input.password },
    crypto.randomUUID(),
  );
  assert.equal(login.account.customer_id, customer?.id);
  const customerCount = (await list("customers")).length;
  await assert.rejects(advertiserAuth(input, crypto.randomUUID()));
  assert.equal((await list("customers")).length, customerCount);
});
test("관리자 발급 계정은 지정 고객에 연결되며 비밀번호 해시 저장·중복 거절", async () => {
  const { save } = await import("../src/lib/domain");
  const customer = await save(
    "customers",
    { name: "수동 고객" },
    "admin@test.local",
  );
  const input = {
    customerId: customer.id,
    email: `${crypto.randomUUID()}@test.local`,
    password: "initial-password-123",
    name: "수동 담당자",
    phone: "010-1234-5678",
  };
  const issued = await provisionCustomerAccount(input, "admin@test.local");
  const login = await advertiserAuth(
    { action: "login", email: issued.email, password: input.password },
    crypto.randomUUID(),
  );
  assert.equal(login.account.customer_id, customer.id);
  const [stored] = await query<{ password_hash: string }>(
    "select password_hash from advertiser_accounts where id=$1",
    [issued.id],
  );
  assert.notEqual(stored.password_hash, input.password);
  await assert.rejects(
    provisionCustomerAccount(
      { ...input, email: `other-${input.email}` },
      "admin@test.local",
    ),
  );
  await assert.rejects(
    provisionCustomerAccount(
      { ...input, customerId: crypto.randomUUID() },
      "admin@test.local",
    ),
  );
});
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
test("광고주 카카오 신규 가입·재로그인·state 재사용 차단·연결 해제", async () => {
  Object.assign(process.env, {
    KAKAO_LOGIN_ENABLED: "true",
    KAKAO_CLIENT_ID: "test",
    KAKAO_CLIENT_SECRET: "secret",
    APP_URL: "https://example.com",
  });
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/oauth/token"))
      return Response.json({ access_token: "test-token" });
    if (String(url) === "https://kapi.kakao.com/v2/user/me")
      return Response.json({
        id: 987654321,
        kakao_account: { profile: { nickname: "광고주" } },
      });
    return originalFetch(url, init);
  };
  async function identity() {
    const { state } = await beginKakao(undefined, false, false, "advertiser");
    const result = await completeKakao(state, state, "code");
    await assert.rejects(completeKakao(state, state, "code"));
    assert.ok(result.advertiserIdentity);
    assert.equal(result.session, undefined);
    return result.advertiserIdentity;
  }
  const pending = await identity();
  assert.equal(await advertiserKakaoLogin(pending), null);
  const socialInput = registration();
  const created = await advertiserKakaoLogin(
    pending,
    socialInput,
    crypto.randomUUID(),
  );
  assert.ok(created);
  const socialCustomer = await get(created.account.customer_id!);
  for (const [key, value] of Object.entries({
    name: profile.companyName,
    brand: profile.brand,
    industry: profile.industry,
    businessType: profile.businessType,
    businessNumber: "1234567890",
    address: profile.address,
    website: profile.website,
    description: profile.description,
    email: socialInput.email,
    contactName: socialInput.name,
    phone: socialInput.phone,
  })) {
    assert.equal(socialCustomer?.[key], value, key);
  }
  assert.equal(
    (await advertiserSession(created.token))?.id,
    created.account.id,
  );
  await assert.rejects(advertiserKakaoPending(pending));
  const next = await advertiserKakaoLogin(await identity());
  assert.equal(next?.account.id, created.account.id);
  await unlinkKakao("987654321");
  assert.equal(await advertiserSession(created.token), null);
  const unlinked = await identity();
  assert.equal(await advertiserKakaoLogin(unlinked), null);
  const manual = registration();
  const manualAccount = await advertiserAuth(manual, crypto.randomUUID());
  await assert.rejects(
    advertiserKakaoLogin(
      unlinked,
      {
        action: "social-link",
        email: manual.email,
        password: "wrong-password",
      },
      "social-link-test",
    ),
  );
  const [attempt] = await query<{ count: number }>(
    "select count from login_attempts where key like 'advertiser:%' order by until_time desc limit 1",
  );
  assert.ok(attempt.count > 0);
  const linked = await advertiserKakaoLogin(
    unlinked,
    { action: "social-link", email: manual.email, password: manual.password },
    "social-link-test",
  );
  assert.equal(linked?.account.id, manualAccount.account.id);
  assert.equal(linked?.account.customer_id, manualAccount.account.customer_id);
  assert.equal(
    (await advertiserKakaoLogin(await identity()))?.account.id,
    manualAccount.account.id,
  );
});
