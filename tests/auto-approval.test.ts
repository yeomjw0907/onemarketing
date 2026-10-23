import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import {
  submitApplication,
  listApplications,
  reviewApplication,
  reviewApplicationsBulk,
} from "../src/lib/participant-applications";
import { save, command } from "../src/lib/domain";
import { get, list, create, transaction, execute } from "../src/lib/db";
import {
  settleReferrals,
  syncReferral,
  syncSignupBonus,
} from "../src/lib/referrals";
import { readFileSync } from "node:fs";
import { referralRates } from "../src/lib/workflow-policy";
const actor = "auto-review@test.local";
let sequence = 0;
function application(referralCode?: string) {
  const key = crypto.randomUUID();
  return {
    key,
    consent: true,
    data: {
      name: "자동 승인 테스트",
      phone: "01088" + String(++sequence).padStart(6, "0"),
      referralCode,
      payment: { method: "kakaopay" },
      accounts: [
        {
          id: crypto.randomUUID(),
          channel: "blog",
          url: "https://blog.naver.com/" + key,
          label: "",
        },
      ],
    },
  };
}
async function referrer() {
  return save(
    "participants",
    {
      name: "추천인",
      phone: "01077" + String(++sequence).padStart(6, "0"),
      accounts: [],
      payment: { method: "kakaopay" },
    },
    actor,
  );
}
async function app(id: string) {
  return (await listApplications()).find((a) => a.id === id)!;
}
async function bonus(id: string) {
  return (await list("referral_credits")).find((c) => c.sourceId === id)!;
}
test("신규 신청은 자동 승인되고 재전송해도 한 번만 등록된다", async () => {
  const input = application();
  const result = await submitApplication(input);
  assert.deepEqual(await submitApplication(input), result);
  const a = await app(result.id);
  assert.equal(a.status, "approved");
  assert.equal(a.data.reviewStatus, "pending");
  const p = await get(a.participant_id!);
  assert.equal(p?.status, "active");
  assert.equal((p?.accounts as any[])[0].approvalStatus, "approved");
  assert.equal(await bonus(a.id), undefined);
  await assert.rejects(
    submitApplication({
      ...application(),
      data: { ...input.data, accounts: application().data.accounts },
    }),
    /전화번호/,
  );
});
test("추천 보상은 회원 검수만으로 지급 불가, 첫 원고료 지급 후 최초 한 번 추가 적립", async () => {
  const r = await referrer();
  const input = application(String(r.referralCode));
  const { id } = await submitApplication(input);
  assert.equal((await bonus(id)).status, "pending_campaign");
  assert.equal((await bonus(id)).amount, 2000);
  await assert.rejects(settleReferrals(r.id, actor), /지급 가능한/);
  const a = await app(id);
  await reviewApplication({ id, version: a.version, action: "verify" }, actor);
  assert.equal((await bonus(id)).status, "pending_campaign");
  await paidCampaign(a.participant_id!);
  assert.equal((await bonus(id)).status, "available");
  await assert.rejects(
    reviewApplication({ id, version: a.version, action: "verify" }, actor),
    /변경/,
  );
  await submitApplication(input);
  assert.equal(
    (await list("referral_credits")).filter((c) => c.sourceId === id).length,
    1,
  );
  const settlement = await settleReferrals(r.id, actor);
  assert.equal(settlement.total, 2500);
  assert.equal((await bonus(id)).status, "paid");
  assert.deepEqual(referralRates, { blog: 500, clip: 500, bundle: 1200 });
});
test("검수에서 보상 제외할 수 있고 삭제 회원의 미지급 보상은 취소된다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  await reviewApplication({ id, version: a.version, action: "exclude" }, actor);
  assert.equal((await bonus(id)).status, "cancelled");
  assert.equal((await get(a.participant_id!))?.status, "active");
  for (const verified of [false, true]) {
    const input = application(String(r.referralCode));
    const result = await submitApplication(input);
    const a = await app(result.id);
    if (verified)
      await reviewApplication(
        { id: a.id, version: a.version, action: "verify" },
        actor,
      );
    const p = (await get(a.participant_id!))!;
    await command(
      "participant-delete",
      { id: p.id, version: p.version },
      actor,
      crypto.randomUUID(),
    );
    assert.equal((await bonus(a.id)).status, "cancelled");
    await assert.rejects(
      submitApplication({
        ...application(),
        data: { ...input.data, accounts: application().data.accounts },
      }),
      /전화번호/,
    );
  }
});
test("동시 중복 신청과 본인 추천은 거절된다", async () => {
  const input = application();
  const outcomes = await Promise.allSettled([
    submitApplication(input),
    submitApplication({ ...input, key: crypto.randomUUID() }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const r = await referrer();
  const self = application(String(r.referralCode));
  self.data.phone = String(r.phone);
  await assert.rejects(submitApplication(self), /본인/);
});

test("일괄 검수는 재요청에도 한 번만 확정하고 충돌 시 전체 롤백한다", async () => {
  const r = await referrer();
  const one = await submitApplication(application(String(r.referralCode)));
  const two = await submitApplication(application(String(r.referralCode)));
  const a = await app(one.id),
    b = await app(two.id);
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-verify",
        key: crypto.randomUUID(),
        items: [
          { id: a.id, version: a.version },
          { id: b.id, version: b.version + 1 },
        ],
      },
      actor,
    ),
    /변경/,
  );
  assert.equal((await bonus(a.id)).status, "pending_campaign");
  const input = {
    action: "bulk-verify",
    key: crypto.randomUUID(),
    items: [
      { id: a.id, version: a.version },
      { id: b.id, version: b.version },
    ],
  };
  const result = await reviewApplicationsBulk(input, actor);
  assert.deepEqual(await reviewApplicationsBulk(input, actor), result);
  assert.equal((await bonus(a.id)).status, "pending_campaign");
  assert.equal((await bonus(b.id)).status, "pending_campaign");
});
test("자동 승인은 필수 동의와 정산 정보 검사를 유지한다", async () => {
  const input = application();
  await assert.rejects(submitApplication({ ...input, consent: false }));
  await assert.rejects(
    submitApplication({
      ...input,
      data: { ...input.data, payment: undefined },
    }),
  );
  assert.equal(await app(input.key), undefined);
});

test("회원 상세에서 추천 보상만 정산하고 삭제 후 취소해도 다시 지급 가능해지지 않는다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  const credit = await bonus(id);
  await assert.rejects(
    command(
      "participant-settle",
      {
        id: r.id,
        version: r.version,
        items: [],
        referralCreditIds: [credit.id],
      },
      actor,
      crypto.randomUUID(),
    ),
    /추천료/,
  );
  await reviewApplication({ id, version: a.version, action: "verify" }, actor);
  await paidCampaign(a.participant_id!);
  const settlement = await command(
    "participant-settle",
    { id: r.id, version: r.version, items: [], referralCreditIds: [credit.id] },
    actor,
    crypto.randomUUID(),
  );
  assert.equal(settlement.total, 2000);
  const p = (await get(a.participant_id!))!;
  await command(
    "participant-delete",
    { id: p.id, version: p.version },
    actor,
    crypto.randomUUID(),
  );
  await command(
    "participant-settlement-cancel",
    { id: settlement.id, version: settlement.version },
    actor,
    crypto.randomUUID(),
  );
  assert.equal((await bonus(id)).status, "cancelled");
});

test("추천인이 삭제되어 보상이 취소되어도 신규 회원의 검수는 완료할 수 있다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  await command(
    "participant-delete",
    { id: r.id, version: r.version },
    actor,
    crypto.randomUUID(),
  );
  await reviewApplication({ id, version: a.version, action: "verify" }, actor);
  assert.equal((await app(id)).data.reviewStatus, "verified");
  assert.equal((await bonus(id)).status, "cancelled");
});

test("프로필의 전화번호·계정을 수정해도 최초 가입 정보로 중복 가입을 막는다", async () => {
  const input = application();
  const { id } = await submitApplication(input);
  const a = await app(id);
  const p = (await get(a.participant_id!))!;
  await save(
    "participants",
    { ...p, phone: application().data.phone, accounts: [] },
    actor,
    p.id,
    p.version,
  );
  await assert.rejects(
    submitApplication({
      ...application(),
      data: { ...input.data, accounts: application().data.accounts },
    }),
    /전화번호/,
  );
  await assert.rejects(
    submitApplication({
      ...application(),
      data: { ...input.data, phone: application().data.phone },
    }),
    /활동 계정/,
  );
});

async function paidCampaign(
  participantId: string,
  bundle = false,
  partial = false,
) {
  return transaction(async () => {
    const slot =
      bundle || partial
        ? await create("work_slots", {
            participantId,
            type: "bundle",
            payoutStatus: partial ? "pending" : "paid",
          })
        : undefined;
    const source = partial
      ? await create("tasks", {
          participantId,
          channel: "blog",
          type: "blog",
          workSlotId: slot!.id,
          status: "verified",
          payoutStatus: "paid",
        })
      : slot ||
        (await create("tasks", {
          participantId,
          channel: "blog",
          type: "blog",
          status: "verified",
          payoutStatus: "paid",
        }));
    await syncReferral(source, true, actor);
    return source;
  });
}
test("회원 검수 전에도 첫 묶음 완료 시 3200원, 두 번째는 기존 추천료만 적립한다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  await paidCampaign(a.participant_id!, true);
  assert.equal((await bonus(id)).status, "available");
  assert.equal((await bonus(id)).amount, 2000);
  assert.equal((await app(id)).data.reviewStatus, "pending");
  await paidCampaign(a.participant_id!);
  const credits = (await list("referral_credits")).filter(
    (c) => c.participantId === r.id && c.status === "available",
  );
  assert.equal(
    credits.reduce((n, c) => n + Number(c.amount), 0),
    3700,
  );
  assert.equal(credits.filter((c) => c.type === "signup").length, 1);
});
test("묶음 일부 지급은 특별 보상을 발생시키지 않는다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  await paidCampaign(a.participant_id!, false, true);
  assert.equal((await bonus(id)).status, "pending_campaign");
  assert.equal(
    (await list("referral_credits"))
      .filter((c) => c.participantId === r.id && c.status === "available")
      .reduce((n, c) => n + Number(c.amount), 0),
    500,
  );
});
test("원고료 지급 취소·재지급과 이미 지급한 특별 보상을 중복 적립하지 않는다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  const source = await paidCampaign(a.participant_id!);
  await transaction(() => syncReferral(source, false, actor));
  assert.equal((await bonus(id)).status, "pending_campaign");
  await transaction(() => syncReferral(source, true, actor));
  const settlement = await settleReferrals(r.id, actor);
  assert.equal(settlement.total, 2500);
  await transaction(() => syncReferral(source, false, actor));
  assert.equal((await bonus(id)).status, "recovery_required");
  await transaction(() => syncReferral(source, true, actor));
  assert.equal((await bonus(id)).status, "recovery_required");
  await assert.rejects(settleReferrals(r.id, actor), /지급 가능한/);
});

test("기존 미지급 보상은 새 조건으로 전환하고 완료 이력만 재적립한다", async () => {
  const r = await referrer();
  const p = await save(
    "participants",
    { ...application().data, accounts: [], referrerId: r.id },
    actor,
  );
  const legacy = await create("referral_credits", {
    type: "signup",
    sourceId: crypto.randomUUID(),
    participantId: r.id,
    referredParticipantId: p.id,
    amount: 2000,
    status: "available",
  });
  await assert.rejects(settleReferrals(r.id, actor), /첫 캠페인/);
  const sql = readFileSync(
    "supabase/migrations/20261023010000_signup_bonus_campaign_eligibility.sql",
    "utf8",
  );
  await transaction(async () => {
    await execute(sql);
    await syncSignupBonus(p.id, actor);
  });
  assert.equal((await get(legacy.id))?.status, "pending_campaign");
  await transaction(async () => {
    await execute(sql);
    await syncSignupBonus(p.id, actor);
  });
  assert.equal((await get(legacy.id))?.amount, 2000);
  await paidCampaign(p.id);
  assert.equal((await get(legacy.id))?.status, "available");
  await transaction(() => execute(sql));
  assert.equal((await get(legacy.id))?.status, "available");
});

test("동시에 완료한 캠페인도 최초 특별 보상은 한 번만 적립한다", async () => {
  const r = await referrer();
  const { id } = await submitApplication(application(String(r.referralCode)));
  const a = await app(id);
  await Promise.all([
    paidCampaign(a.participant_id!),
    paidCampaign(a.participant_id!),
  ]);
  const credits = (await list("referral_credits")).filter(
    (c) => c.participantId === r.id && c.status === "available",
  );
  assert.equal(credits.filter((c) => c.type === "signup").length, 1);
  assert.equal(
    credits.reduce((n, c) => n + Number(c.amount), 0),
    3000,
  );
});
