// Regression: ISSUE-004 — a managed refund request erased confirmed work costs.
// Found by /qa on 2026-11-08
// Report: docs/service-lifecycle-qa-2026-11-08.md
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { advertiserAuth } from "../src/lib/market";
import { campaignQuote, policyVersion } from "../src/lib/commerce-policy";
import {
  checkout,
  confirmPayment,
  savePaymentSettings,
  commerceView,
  campaignAction,
  availableRefund,
} from "../src/lib/commerce";
const admin = { role: "admin" as const, id: "refund-qa@test.local" };
test("managed refund requests preserve all confirmed line costs and cannot over-refund", async () => {
  const { account } = await advertiserAuth(
    {
      action: "register",
      email: crypto.randomUUID() + "@test.local",
      password: "refund-qa-password",
      name: "환불 검증",
      phone: "01012345678",
      consent: true,
      companyName: "환불 검증 업체",
      brand: "검증",
      industry: "생활용품",
      businessType: "preparing",
      businessNumber: "",
      address: "서울",
      description: "격리 정산 검증",
    },
    crypto.randomUUID(),
  );
  const owner = { role: "advertiser" as const, id: account.id };
  await savePaymentSettings(admin, {
    enabled: true,
    bank: "QA 은행",
    account: "QA-123456",
    holder: "QA",
  });
  const input = {
    title: "대행 환불",
    brand: "검증",
    product: "검증 제품",
    guide: "확정된 업무 수행 금액을 보존합니다.",
    kind: "self_cash" as const,
    channel: "blog" as const,
    quantity: 5,
    reward: 20000,
    benefit: "",
    managed: true,
    deadline: "2027-11-01",
    submissionDeadline: "2027-11-15",
  };
  const order = await checkout(account.id, {
    id: crypto.randomUUID(),
    campaigns: [input],
    expectedTotal: campaignQuote(input).total,
    policyVersion,
    consent: true,
  });
  await confirmPayment(admin, order.id, order.version, "격리 QA 입금 확인");
  let c = (await commerceView(owner)).campaigns[0];
  const used = { reward: 20000, operation: 5000, managed: 20000 };
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "usage",
    used,
    note: "부분 수행 내역과 보상액 확인",
  });
  c = (await commerceView(owner)).campaigns[0];
  await campaignAction(owner, {
    campaignId: c.id,
    version: c.version,
    action: "refund-request",
    note: "부분 수행 후 잔액 환불 요청",
  });
  c = (await commerceView(owner)).campaigns[0];
  assert.deepEqual(c.data.used, used);
  assert.equal(availableRefund(c.data), 125000);
  const decision = {
    campaignId: c.id,
    version: c.version,
    action: "refund-decide",
    refundId: c.data.refunds[0].id,
    decision: "approve",
    note: "수행 비용을 제외한 잔액 환불",
  };
  await assert.rejects(
    () => campaignAction(admin, { ...decision, amount: 150000 }),
    /초과/,
  );
  await campaignAction(admin, { ...decision, amount: 125000 });
  c = (await commerceView(owner)).campaigns[0];
  assert.deepEqual(c.data.used, used);
  assert.equal(c.data.refunds[0].amount, 125000);
  assert.equal(c.data.refunds[0].status, "approved");
});
