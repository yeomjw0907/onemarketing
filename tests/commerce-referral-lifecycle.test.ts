import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "./helpers";
import { create, query, get, list, update, execute } from "../src/lib/db";
import { submitApplication } from "../src/lib/participant-applications";
import {
  savePaymentSettings,
  checkout,
  confirmPayment,
  commerceView,
  applyCommerce,
  campaignAction,
  participantCommerceAction,
} from "../src/lib/commerce";
import { campaignQuote, policyVersion } from "../src/lib/commerce-policy";
import { settleReferrals } from "../src/lib/referrals";
process.env.SENS_ENABLED = "false";
test("public referral signup → ownership gate → commerce verification/payment earns the bonus once", async () => {
  const admin = { role: "admin" as const, id: "launch-qa@local.test" };
  const ref = await create("participants", {
    name: "QA 추천인",
    phone: "01090001111",
    status: "active",
    referralCode: "launch-ref",
    payment: { method: "kakaopay" },
    accounts: [],
  });
  const accountId = randomUUID(),
    signupId = randomUUID();
  const signup = {
    key: signupId,
    consent: true,
    data: {
      name: "QA 추천 가입",
      phone: "01090002222",
      payment: { method: "kakaopay" },
      referralCode: "launch-ref",
      accounts: [
        {
          id: accountId,
          channel: "blog",
          url: "https://blog.naver.com/launch-referral",
        },
      ],
    },
  };
  await submitApplication(signup);
  await submitApplication(signup);
  const [application] = await query<{ participant_id: string }>(
    "select participant_id from participant_applications where id=$1",
    [signupId],
  );
  const participantId = application.participant_id;
  const bonus = () =>
    list("referral_credits").then((rows) =>
      rows.filter((c) => c.referredParticipantId === participantId),
    );
  assert.equal((await bonus()).length, 1);
  assert.equal((await bonus())[0].status, "pending_campaign");
  await assert.rejects(() => settleReferrals(ref.id, admin.id));
  const advertiserId = randomUUID();
  await execute(
    "insert into advertiser_accounts(id,email,password_hash,name,phone) values($1,'referral-ad@qa.local','hash','QA','01090003333')",
    [advertiserId],
  );
  await savePaymentSettings(admin, {
    enabled: true,
    bank: "QA은행",
    account: "TEST-NOT-REAL",
    holder: "QA",
  });
  const input = {
    title: "추천 전체 흐름 검증",
    brand: "QA",
    product: "테스트",
    guide: "격리된 검증 캠페인입니다.",
    kind: "self_cash" as const,
    channel: "blog" as const,
    quantity: 1,
    reward: 20000,
    benefit: "",
    managed: false,
    deadline: "2099-11-01",
    submissionDeadline: "2099-11-15",
  };
  const order = await checkout(advertiserId, {
    id: randomUUID(),
    campaigns: [input],
    expectedTotal: campaignQuote(input).total,
    policyVersion,
    consent: true,
  });
  await confirmPayment(admin, order.id, order.version, "격리 QA 가상 입금");
  const advertiser = { role: "advertiser" as const, id: advertiserId };
  const campaign = async () => (await commerceView(advertiser)).campaigns[0];
  let c = await campaign();
  const apply = () =>
    applyCommerce(participantId, {
      campaignId: c.id,
      blogAccountId: accountId,
      consent: true,
    });
  await assert.rejects(apply, /소유 확인/);
  const p = (await get(participantId))!;
  await update(p.id, {
    accounts: (p.accounts as any[]).map((a) => ({
      ...a,
      ownershipVerifiedAt: new Date().toISOString(),
    })),
  });
  const a = await apply();
  await campaignAction(advertiser, {
    campaignId: c.id,
    version: c.version,
    action: "select",
    applicationId: a.id,
  });
  let av = (await campaign()).applications[0];
  await participantCommerceAction(participantId, {
    id: av.id,
    version: av.version,
    action: "accept",
  });
  av = (await campaign()).applications[0];
  await participantCommerceAction(participantId, {
    id: av.id,
    version: av.version,
    action: "submit",
    links: { blog: "https://blog.naver.com/launch-referral/123456" },
  });
  c = await campaign();
  await campaignAction(advertiser, {
    campaignId: c.id,
    version: c.version,
    action: "review",
    applicationId: a.id,
    decision: "approve",
    note: "격리 QA 검수",
  });
  assert.equal((await bonus())[0].status, "pending_campaign");
  c = await campaign();
  const payout = {
    campaignId: c.id,
    version: c.version,
    action: "payout",
    applicationId: a.id,
    reference: "격리 QA 기록 — 실제 송금 없음",
  };
  await campaignAction(admin, payout);
  await assert.rejects(() => campaignAction(admin, payout));
  const credits = await bonus();
  assert.equal(credits.length, 2);
  assert.equal(credits.find((c) => c.type === "signup")?.amount, 2000);
  assert.equal(credits.find((c) => c.type === "blog")?.amount, 500);
  assert.ok(credits.every((c) => c.status === "available"));
  const settlement = await settleReferrals(ref.id, admin.id);
  assert.equal(settlement.total, 2500);
  await assert.rejects(() => settleReferrals(ref.id, admin.id));
  assert.ok((await bonus()).every((c) => c.status === "paid"));
});
