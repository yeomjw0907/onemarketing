import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { advertiserAuth } from "../src/lib/market";
import {
  createAdvertiserKey,
  advertiserKeyIdentity,
  revokeAdvertiserKey,
  listAdvertiserKeys,
  callAdvertiserTool,
} from "../src/lib/advertiser-ai";
import { savePaymentSettings } from "../src/lib/commerce";
import { query } from "../src/lib/db";
test("advertiser MCP keys are hashed, owner-scoped, expiring and immediately revocable", async () => {
  const register = () =>
    advertiserAuth(
      {
        action: "register",
        companyName: "테스트 업체",
        brand: "테스트 브랜드",
        industry: "생활용품",
        businessType: "preparing",
        businessNumber: "",
        address: "서울",
        description: "테스트 제품과 서비스",
        email: crypto.randomUUID() + "@test.local",
        password: "strong-password-123",
        name: "AI광고주",
        phone: "01012345678",
        consent: true,
      },
      crypto.randomUUID(),
    );
  const a = await register(),
    b = await register();
  const key = await createAdvertiserKey(a.account.id, "내 AI");
  const who = await advertiserKeyIdentity(String(key.token));
  assert.equal(who?.advertiser_id, a.account.id);
  const stored = (
    await query<{ token_hash: string }>(
      "select token_hash from advertiser_api_keys where id=$1",
      [key.id],
    )
  )[0];
  assert.notEqual(stored.token_hash, key.token);
  assert.equal(stored.token_hash.length, 64);
  assert.equal(
    JSON.stringify(await listAdvertiserKeys(a.account.id)).includes(key.token),
    false,
  );
  await revokeAdvertiserKey(b.account.id, key.id);
  assert.ok(await advertiserKeyIdentity(key.token));
  await revokeAdvertiserKey(a.account.id, key.id);
  assert.equal(await advertiserKeyIdentity(key.token), null);
  assert.equal(await advertiserKeyIdentity("invalid"), null);
  const expired = await createAdvertiserKey(a.account.id, "만료 테스트");
  await query(
    "update advertiser_api_keys set expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  assert.equal(await advertiserKeyIdentity(expired.token), null);
});
test("AI and web use identical quote/checkout and cannot invoke admin tools", async () => {
  const a = await advertiserAuth(
    {
      action: "register",
      companyName: "테스트 업체",
      brand: "테스트 브랜드",
      industry: "생활용품",
      businessType: "preparing",
      businessNumber: "",
      address: "서울",
      description: "테스트 제품과 서비스",
      email: crypto.randomUUID() + "@test.local",
      password: "strong-password-123",
      name: "AI주문",
      phone: "01012345678",
      consent: true,
    },
    crypto.randomUUID(),
  );
  const id = a.account.id;
  await savePaymentSettings(
    { role: "admin", id: "test-admin" },
    { enabled: true, bank: "테스트", account: "123-456", holder: "테스트" },
  );
  const input = {
    title: "제품만 제공",
    brand: "브랜드",
    product: "제품",
    guide: "제품 제공 조건을 확인하고 리뷰를 게시하세요.",
    kind: "self_product",
    channel: "blog",
    quantity: 5,
    reward: 0,
    benefit: "화장품 1개, 배송비 광고주 부담",
    managed: false,
    deadline: "2027-11-01",
    submissionDeadline: "2027-11-15",
  };
  const q: any = await callAdvertiserTool(id, "quote_campaigns", {
    campaigns: [input],
  });
  assert.equal(q.total, 15000);
  const body = {
    id: crypto.randomUUID(),
    campaigns: [input],
    expectedTotal: q.total,
    policyVersion: q.policyVersion,
    consent: true,
  };
  const order: any = await callAdvertiserTool(
    id,
    "create_campaign_order",
    body,
  );
  assert.equal(order.data.status, "awaiting_payment");
  const again: any = await callAdvertiserTool(
    id,
    "create_campaign_order",
    body,
  );
  assert.equal(again.id, order.id);
  await assert.rejects(() =>
    callAdvertiserTool(id, "create_campaign_order", {
      ...body,
      id: crypto.randomUUID(),
      consent: false,
    }),
  );
  await assert.rejects(() => callAdvertiserTool(id, "confirmPayment", {}));
});
