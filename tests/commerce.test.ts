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
  commerceDeadlineTick,
  cancelUnpaidOrder,
} from "../src/lib/commerce";
import { create, query, get } from "../src/lib/db";
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
async function setup(overrides: Record<string, unknown> = {}) {
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
      campaigns: [{ ...input, ...overrides }],
      expectedTotal: campaignQuote({ ...input, ...overrides }).total,
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

async function applicant(c: any, index: number) {
  const p = await save(
    "participants",
    {
      name: "참여자" + index,
      phone: "01012341234",
      payment: { method: "kakaopay" },
      accounts: [
        {
          id: crypto.randomUUID(),
          channel: "blog",
          url: "https://blog.naver.com/commerce" + index,
          approvalStatus: "approved",
          ownershipVerifiedAt: new Date().toISOString(),
        },
      ],
    },
    admin.id,
  );
  const a = await applyCommerce(p.id, {
    campaignId: c.id,
    blogAccountId: (p.accounts as any[])[0].id,
    consent: true,
  });
  return { p, a };
}
test("concurrent selection reserves one seat, expired proposal releases it, cancellation blocks payment", async () => {
  const { actor, order } = await setup({ quantity: 1 });
  await confirmPayment(admin, order.id, order.version, "실제 입금 검증");
  let c = (await commerceView(actor)).campaigns[0];
  const x = await applicant(c, 11),
    y = await applicant(c, 12);
  const results = await Promise.allSettled(
    [x, y].map((v) =>
      campaignAction(actor, {
        campaignId: c.id,
        version: c.version,
        action: "select",
        applicationId: v.a.id,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const [selected] = await query<any>(
    "select * from commerce_applications where campaign_id=$1 and data->>'status'='selected'",
    [c.id],
  );
  await query(
    "update commerce_applications set data=jsonb_set(data,'{expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) where id=$1",
    [selected.id],
  );
  await commerceDeadlineTick();
  c = (await commerceView(actor)).campaigns[0];
  assert.equal(
    (c.applications.find((a) => a.id === selected.id)!.data as any).status,
    "expired",
  );
  const remaining = c.applications.find(
    (a) => (a.data as any).status === "applied",
  )!;
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "select",
    applicationId: remaining.id,
  });
  c = (await commerceView(actor)).campaigns[0];
  await assert.rejects(() =>
    campaignAction(admin, {
      campaignId: c.id,
      version: c.version,
      action: "status",
      status: "cancelled",
    }),
  );
  const unpaid = await setup();
  await cancelUnpaidOrder(unpaid.actor, unpaid.order.id, unpaid.order.version);
  await assert.rejects(() =>
    confirmPayment(
      admin,
      unpaid.order.id,
      unpaid.order.version,
      "취소 후 입금",
    ),
  );
});
test("managed campaign delegates decisions and records scope, messages and schedule changes", async () => {
  const { actor, order } = await setup({ managed: true });
  await confirmPayment(admin, order.id, order.version, "실제 입금 검증");
  let c = (await commerceView(actor)).campaigns[0];
  const { a } = await applicant(c, 13);
  await assert.rejects(() =>
    campaignAction(actor, {
      campaignId: c.id,
      version: c.version,
      action: "select",
      applicationId: a.id,
    }),
  );
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "message",
    note: "일정 연장을 요청합니다.",
  });
  c = (await commerceView(actor)).campaigns[0];
  assert.equal(c.data.messages.length, 1);
  await assert.rejects(() =>
    campaignAction(actor, {
      campaignId: c.id,
      version: c.version,
      action: "schedule",
      deadline: "2027-11-02",
      submissionDeadline: "2027-11-16",
      note: "일정 변경 요청",
    }),
  );
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "schedule",
    deadline: "2027-11-02",
    submissionDeadline: "2027-11-16",
    note: "고객 동의 일정 연장",
  });
  c = (await commerceView(actor)).campaigns[0];
  assert.equal(c.data.scheduleHistory[0].previous.deadline, "2027-11-01");
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "refund-request",
    note: "모집 전 취소 요청",
  });
  c = (await commerceView(actor)).campaigns[0];
  await assert.rejects(() =>
    campaignAction(admin, {
      campaignId: c.id,
      version: c.version,
      action: "refund-decide",
      refundId: c.data.refunds[0].id,
      decision: "approve",
      amount: c.data.total,
      note: "근거 없는 전액 환불",
    }),
  );
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "usage",
    used: { managed: 20000 },
    note: "가이드 정리와 최초 일정 조율 수행",
  });
  c = (await commerceView(actor)).campaigns[0];
  await assert.rejects(() =>
    campaignAction(admin, {
      campaignId: c.id,
      version: c.version,
      action: "refund-decide",
      refundId: c.data.refunds[0].id,
      decision: "approve",
      amount: c.data.total,
      note: "사용 금액 초과 환불",
    }),
  );
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "refund-decide",
    refundId: c.data.refunds[0].id,
    decision: "approve",
    amount: c.data.total - 20000,
    note: "수행 내역 제외 환불",
  });
});
test("production linking checks advertiser ownership, protects legacy assignment and delivers only linked assets", async () => {
  const { actor, order } = await setup();
  await confirmPayment(admin, order.id, order.version, "실제 입금 검증");
  let c = (await commerceView(actor)).campaigns[0];
  const [account] = await query<{ customer_id: string }>(
    "select customer_id from advertiser_accounts where id=$1",
    [actor.id],
  );
  const customer = (await get(account.customer_id))!;
  const project = await create("projects", {
    name: "제작 전용",
    customerId: customer.id,
    status: "materials",
  });
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "link-production",
    projectId: project.id,
  });
  assert.equal((await get(project.id))?.commerceCampaignId, c.id);
  c = (await commerceView(actor)).campaigns[0];
  const { a, p } = await applicant(c, 14);
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "select",
    applicationId: a.id,
  });
  c = (await commerceView(actor)).campaigns[0];
  const foreign = await create("assets", {
    name: "타 고객 이미지",
    projectId: crypto.randomUUID(),
    category: "image",
    current: true,
  });
  await assert.rejects(() =>
    campaignAction(admin, {
      campaignId: c.id,
      version: c.version,
      action: "materials",
      applicationId: a.id,
      materials: { copy: "원고", urls: [], assetIds: [foreign.id] },
    }),
  );
  const file = await create("assets", {
    name: "승인 이미지",
    projectId: project.id,
    category: "image",
    current: true,
  });
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "materials",
    applicationId: a.id,
    materials: { copy: "전달 원고", urls: [], assetIds: [file.id] },
  });
  const own = (await commerceView({ role: "participant", id: p.id }))
    .campaigns[0];
  assert.deepEqual((own.applications[0].data as any).materials.assetIds, [
    file.id,
  ]);
});

test("campaign discovery gates guides, keeps unpaid campaigns private, and restricts presentation edits", async () => {
  const { campaignCatalog, campaignDetails } =
    await import("../src/lib/campaign-discovery");
  const { actor, order } = await setup({
    category: "cafe",
    fulfillment: "provided",
  });
  let c = (await commerceView(actor)).campaigns[0];
  assert.equal(await campaignDetails(c.id, null), null);
  await confirmPayment(admin, order.id, order.version, "discovery payment");
  c = (await commerceView(actor)).campaigns[0];
  const catalog = await campaignCatalog();
  const summary = catalog.campaigns.find((x) => x.id === c.id)!;
  assert.equal(summary.category, "cafe");
  assert.equal(JSON.stringify(summary).includes(input.guide), false);
  assert.equal(
    JSON.stringify(await publicCommerceCampaigns()).includes(input.guide),
    false,
  );
  const guest = await campaignDetails(c.id, null);
  assert.equal(guest?.locked, true);
  assert.equal(guest?.details, null);
  assert.equal(JSON.stringify(guest).includes(input.guide), false);
  assert.equal(
    (await campaignDetails(c.id, actor))?.details?.guide,
    input.guide,
  );
  await assert.rejects(() =>
    campaignAction(
      { role: "advertiser", id: crypto.randomUUID() },
      {
        campaignId: c.id,
        version: c.version,
        action: "presentation",
        presentation: { category: "food" },
      },
    ),
  );
  await assert.rejects(() =>
    campaignAction(actor, {
      campaignId: c.id,
      version: c.version,
      action: "presentation",
      presentation: { imageUrl: "http://unsafe.example/image.jpg" },
    }),
  );
  await campaignAction(actor, {
    campaignId: c.id,
    version: c.version,
    action: "presentation",
    presentation: {
      category: "beauty",
      imageUrl: "https://example.com/image.jpg",
    },
  });
  c = (await commerceView(actor)).campaigns[0];
  assert.equal((await campaignDetails(c.id, null))?.summary.category, "beauty");
  const p = await save(
    "participants",
    {
      name: "공개 검증",
      phone: "01012341234",
      payment: { method: "kakaopay" },
      accounts: [
        {
          id: crypto.randomUUID(),
          channel: "blog",
          url: "https://blog.naver.com/discovery-test",
          approvalStatus: "approved",
          ownershipVerifiedAt: new Date().toISOString(),
        },
      ],
    },
    admin.id,
  );
  await applyCommerce(p.id, {
    campaignId: c.id,
    blogAccountId: (p.accounts as any[])[0].id,
    consent: true,
  });
  c = (await commerceView(actor)).campaigns[0];
  await assert.rejects(
    () =>
      campaignAction(actor, {
        campaignId: c.id,
        version: c.version,
        action: "presentation",
        presentation: { fulfillment: "visit", region: "서울" },
      }),
    /지원자가/,
  );
  const own = await campaignDetails(c.id, { role: "participant", id: p.id });
  assert.ok(own?.application);
  assert.equal(
    (
      await campaignDetails(c.id, {
        role: "participant",
        id: crypto.randomUUID(),
      })
    )?.application,
    null,
  );
  await query(
    "update commerce_campaigns set data=jsonb_set(data,'{input,deadline}','\"2020-01-01\"'::jsonb) where id=$1",
    [c.id],
  );
  const expired = (await campaignDetails(c.id, null))?.summary;
  assert.equal(expired?.canApply, false);
  assert.equal(expired?.status, "selecting");
});

test("admin can exclude test campaigns without changing their paid workflow, advertiser cannot publish them", async () => {
  const { campaignDetails } = await import("../src/lib/campaign-discovery");
  const { actor, order } = await setup();
  await confirmPayment(admin, order.id, order.version, "test visibility");
  let c = (await commerceView(actor)).campaigns[0];
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "presentation",
    presentation: { visibility: "preview" },
  });
  c = (await commerceView(actor)).campaigns[0];
  assert.equal(c.data.status, "recruiting");
  assert.equal(await campaignDetails(c.id, null), null);
  assert.equal(
    (await publicCommerceCampaigns()).some((x) => x.id === c.id),
    false,
  );
  await assert.rejects(
    () =>
      campaignAction(actor, {
        campaignId: c.id,
        version: c.version,
        action: "presentation",
        presentation: { visibility: "public" },
      }),
    /관리자/,
  );
  await campaignAction(admin, {
    campaignId: c.id,
    version: c.version,
    action: "presentation",
    presentation: { visibility: "public" },
  });
  assert.ok(await campaignDetails(c.id, null));
});
