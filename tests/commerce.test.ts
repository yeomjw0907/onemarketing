import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { advertiserAuth } from "../src/lib/market";
import {
  campaignQuote,
  policyVersion,
  selfSettlement,
} from "../src/lib/commerce-policy";
import {
  checkout,
  savePaymentSettings,
  confirmPayment,
  commerceView,
  campaignAction,
  applyCommerce,
  participantCommerceAction,
  publicCommerceCampaigns,
} from "../src/lib/commerce";
import { save } from "../src/lib/domain";
const admin = { role: "admin" as const, id: "commerce@test.local" };
const input = {
  title: "카페 신규 캠페인",
  brand: "테스트",
  product: "커피",
  guide: "제공한 원고와 이미지로 블로그 게시 후 URL을 제출하세요.",
  kind: "self_cash" as const,
  channel: "blog" as const,
  quantity: 5,
  reward: 20000,
  benefit: "음료",
  managed: false,
  deadline: "2027-11-01",
  submissionDeadline: "2027-11-15",
};
test("VAT-inclusive self fee, reward floor, package and settlement boundaries", () => {
  assert.equal(campaignQuote(input).total, 110000);
  assert.equal(
    campaignQuote({ ...input, kind: "self_product", reward: 0 }).total,
    15000,
  );
  assert.equal(
    campaignQuote({
      ...input,
      kind: "package",
      channel: "bundle",
      reward: 0,
      quantity: 5,
    }).total,
    220000,
  );
  assert.deepEqual(selfSettlement(input, 3), {
    reward: 60000,
    operation: 6000,
  });
  assert.deepEqual(selfSettlement(input, 0), { reward: 0, operation: 0 });
  assert.throws(() => campaignQuote({ ...input, kind: "package" }));
  assert.throws(() => selfSettlement(input, 6));
  assert.throws(() => campaignQuote({ ...input, deadline: "2027-02-30" }));
});
async function setup() {
  const a = await advertiserAuth(
    {
      action: "register",
      email: crypto.randomUUID() + "@test.local",
      password: "strong-password-123",
      name: "광고주",
      phone: "01012345678",
      consent: true,
    },
    crypto.randomUUID(),
  );
  const actor = { role: "advertiser" as const, id: a.account.id };
  await savePaymentSettings(admin, {
    enabled: true,
    bank: "테스트 은행",
    account: "123-4567",
    holder: "테스트",
  });
  const id = crypto.randomUUID(),
    data = {
      id,
      campaigns: [input],
      expectedTotal: 110000,
      policyVersion,
      consent: true as const,
    };
  const order = await checkout(actor.id, data);
  return { actor, order, data };
}
test("idempotent checkout, price tampering, owner isolation and payment status", async () => {
  const { actor, order, data } = await setup();
  assert.equal((await checkout(actor.id, data)).id, order.id);
  await assert.rejects(() => checkout(actor.id, { ...data, expectedTotal: 1 }));
  await assert.rejects(() => checkout(crypto.randomUUID(), data));
  assert.equal(
    (await commerceView({ role: "advertiser", id: crypto.randomUUID() })).orders
      .length,
    0,
  );
  assert.equal(
    (await publicCommerceCampaigns()).some((c) => c.title === input.title),
    false,
  );
  await assert.rejects(() =>
    confirmPayment(actor, order.id, order.version, "입금 확인 001"),
  );
  await confirmPayment(admin, order.id, order.version, "입금 확인 001");
  await assert.rejects(() =>
    confirmPayment(admin, order.id, order.version, "중복 확인"),
  );
  const view = await commerceView(actor);
  assert.equal(view.orders[0].data.status, "paid");
  assert.equal(view.campaigns[0].data.status, "recruiting");
  const c = view.campaigns[0];
  await assert.rejects(() =>
    campaignAction(
      { role: "advertiser", id: crypto.randomUUID() },
      {
        campaignId: c.id,
        version: c.version,
        action: "refund-request",
        note: "타인 요청",
      },
    ),
  );
});
test("selection capacity, participant ownership, submission, review and refund lifecycle", async () => {
  const { actor, order } = await setup();
  await confirmPayment(admin, order.id, order.version, "송금 확인 002");
  let c = (await commerceView(actor)).campaigns[0];
  const p = await save(
    "participants",
    {
      name: "게시자",
      phone: "01012341234",
      payment: { method: "kakaopay" },
      accounts: [
        {
          id: crypto.randomUUID(),
          channel: "blog",
          url: "https://blog.naver.com/test-commerce",
          approvalStatus: "approved",
          ownershipVerifiedAt: new Date().toISOString(),
        },
      ],
    },
    admin.id,
  );
  const account = (p.accounts as any[])[0];
  const a = await applyCommerce(p.id, {
    campaignId: c.id,
    blogAccountId: account.id,
    consent: true,
  });
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "select",
    applicationId: a.id,
  });
  let av = (await commerceView({ role: "participant", id: p.id })).campaigns[0]
    .applications[0];
  await assert.rejects(() =>
    participantCommerceAction("wrong", {
      id: av.id,
      version: av.version,
      action: "accept",
    }),
  );
  await participantCommerceAction(p.id, {
    id: av.id,
    version: av.version,
    action: "accept",
  });
  av = (await commerceView({ role: "participant", id: p.id })).campaigns[0]
    .applications[0];
  await participantCommerceAction(p.id, {
    id: av.id,
    version: av.version,
    action: "submit",
    links: { blog: "https://blog.naver.com/test-commerce/123456" },
  });
  c = (await commerceView(actor)).campaigns[0];
  av = c.applications[0];
  assert.equal(av.participant_id, undefined);
  assert.equal(av.data.referrerSnapshot, undefined);
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "review",
    applicationId: av.id,
    decision: "approve",
    note: "가이드 충족 확인",
  });
  c = (await commerceView(actor)).campaigns[0];
  await assert.rejects(() =>
    campaignAction(actor, {
      campaignId: c.id,
      version: c.version,
      action: "payout",
      applicationId: av.id,
      reference: "지급 증빙 001",
    }),
  );
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "payout",
    applicationId: av.id,
    reference: "은행 지급 증빙 001",
  });
  c = (await commerceView(actor)).campaigns[0];
  assert.equal((c.applications[0].data as any).status, "paid");
  await assert.rejects(() =>
    campaignAction(admin, {
      campaignId: c.id,
      version: c.version,
      action: "payout",
      applicationId: av.id,
      reference: "은행 지급 중복",
    }),
  );
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "settle-self",
  });
  c = (await commerceView(actor)).campaigns[0];
  const refund = c.data.refunds[0];
  assert.equal(refund.amount, 85000); // 20,000 reward + 5,000 minimum fee used
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "refund-paid",
    refundId: refund.id,
    reference: "은행 실제 환불 송금 003",
  });
  c = (await commerceView(actor)).campaigns[0];
  assert.equal(c.data.refunds[0].status, "paid");
  assert.equal(c.data.status, "completed");
  await assert.rejects(() =>
    campaignAction(admin, {
      campaignId: c.id,
      version: c.version,
      action: "refund-paid",
      refundId: refund.id,
      reference: "중복 송금",
    }),
  );
});

