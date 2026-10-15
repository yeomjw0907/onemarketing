import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
const { save, command, projectCosts } = await import("../src/lib/domain");
const { get, list } = await import("../src/lib/db");
const actor = "participants@local";
const account = () => ({
  id: crypto.randomUUID(),
  channel: "blog",
  url: "https://blog.naver.com/participant-test",
  label: "메인 블로그",
});
async function task() {
  const c = await save("customers", { name: "고객" }, actor),
    product = await save("products", { name: "제품", customerId: c.id }, actor),
    price = await save(
      "prices",
      {
        name: "블로그",
        channel: "blog",
        sale: 30000,
        payout: 5000,
        aiEstimate: 1000,
        images: 1,
        duration: 0,
        mode: "slideshow",
        revisions: 1,
      },
      actor,
    ),
    contract = await save(
      "contracts",
      {
        name: "계약",
        customerId: c.id,
        lines: [{ priceId: price.id, quantity: 1 }],
        months: 1,
        setsPerMonth: 1,
        startMonth: "2026-10",
      },
      actor,
    ),
    p = await save(
      "projects",
      {
        name: "프로젝트",
        contractId: contract.id,
        productId: product.id,
        slot: 0,
        due: "2026-10-30",
        budget: 10000,
      },
      actor,
    );
  return { p, t: (await list("tasks")).find((t) => t.projectId === p.id)! };
}
test("참여자 등록·다중 계정·중복 계정 및 위험 URL 차단", async () => {
  const a = account();
  const p = await save(
    "participants",
    {
      name: "김참여",
      nickname: "리뷰어",
      accounts: [
        a,
        {
          id: crypto.randomUUID(),
          channel: "clip",
          url: "https://m.naver.com/clip/profile/example",
        },
      ],
    },
    actor,
  );
  assert.equal((p.accounts as unknown[]).length, 2);
  await assert.rejects(
    save(
      "participants",
      {
        name: "중복",
        accounts: [{ ...a, id: crypto.randomUUID(), url: a.url + "/" }],
      },
      actor,
    ),
    /다른 참여자/,
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      save(
        "participants",
        { name: "위험", accounts: [{ ...a, url: "javascript:alert(1)" }] },
        actor,
      ),
    ),
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      save("participants", { name: "중복내부", accounts: [a, a] }, actor),
    ),
    /중복/,
  );
});
test("참여자 배정·채널 확인·기본 단가 변경 시 기존 보수 유지·지급 후 재배정 차단", async () => {
  const a = { ...account(), url: "https://blog.naver.com/assignment-test" },
    p = await save(
      "participants",
      { name: "배정 참여자", accounts: [a], blogRate: 8000 },
      actor,
    );
  const { p: project, t } = await task();
  const edit = async (extra: Record<string, unknown> = {}) =>
    command(
      "task-edit",
      {
        id: t.id,
        version: (await get(t.id))!.version,
        brief: "제품 소개",
        assignee: "",
        payout: 5000,
        participantId: p.id,
        participantAccountId: a.id,
        ...extra,
      },
      actor,
      crypto.randomUUID(),
    );
  const assigned = await edit();
  assert.equal(assigned.participantId, p.id);
  assert.equal(assigned.payout, 5000);
  assert.equal(
    (assigned.participantSnapshot as { account: { url: string } }).account.url,
    a.url,
  );
  await save("participants", { ...p, blogRate: 12000 }, actor, p.id, p.version);
  assert.equal((await get(t.id))!.payout, 5000);
  await assert.rejects(
    edit({ participantAccountId: crypto.randomUUID() }),
    /계정/,
  );
  await command(
    "payout",
    { id: t.id, version: (await get(t.id))!.version, paid: true },
    actor,
    crypto.randomUUID(),
  );
  await assert.rejects(edit({ payout: 9000 }), /지급 완료/);
  await assert.rejects(
    edit({ participantId: "", participantAccountId: "" }),
    /지급 완료/,
  );
  assert.equal((await projectCosts(project)).actual, 5000);
});
test("섭외 보류 참여자 신규 배정 차단과 과거 협업 이력 정산 검증", async () => {
  const a = { ...account(), url: "https://blog.naver.com/paused-test" },
    p = await save(
      "participants",
      { name: "보류 참여자", status: "paused", accounts: [a] },
      actor,
    ),
    { p: project, t } = await task();
  await assert.rejects(
    command(
      "task-edit",
      {
        id: t.id,
        version: t.version,
        brief: "",
        assignee: "",
        payout: 5000,
        participantId: p.id,
        participantAccountId: a.id,
      },
      actor,
      crypto.randomUUID(),
    ),
    /새로 배정/,
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      save(
        "participant_history",
        {
          participantId: p.id,
          name: "과거 협업",
          channel: "blog",
          date: "2026-09-01",
          amount: null,
          paid: true,
          paidDate: "",
        },
        actor,
      ),
    ),
  );
  const h = await save(
    "participant_history",
    {
      participantId: p.id,
      name: "과거 협업",
      channel: "blog",
      date: "2026-09-01",
      amount: 10000,
      paid: true,
      paidDate: "2026-09-10",
      link: "https://blog.naver.com/past/123",
    },
    actor,
  );
  assert.equal(h.participantId, p.id);
  assert.equal(h.paid, true);
  assert.equal((await projectCosts(project)).actual, 5000);
  await save(
    "participants",
    { ...p, notes: "수정된 메모" },
    actor,
    p.id,
    p.version,
  );
  await assert.rejects(
    save("participants", { ...p, name: "충돌" }, actor, p.id, p.version),
    /수정/,
  );
});

test("legacy standalone tasks settle to their coordinator and a closed project blocks settlement cancellation", async () => {
  const { p: project, t } = await task();
  const { update, view } = await import("../src/lib/db");
  const { settlementItems } =
    await import("../src/lib/participant-settlement-view");
  const participant = await save(
    "participants",
    {
      name: "기존 담당자",
      payment: {
        method: "bank",
        bankName: "국민은행",
        accountNumber: "123456789",
      },
      accounts: [
        { ...account(), url: "https://blog.naver.com/legacy-settlement" },
      ],
    },
    actor,
  );
  // A pre-slot task from the existing workflow remains eligible.
  await update(t.id, {
    workSlotId: null,
    postingSetId: null,
    participantId: participant.id,
    status: "verified",
    payout: 5000,
    payoutStatus: "pending",
  });
  const items = settlementItems(await view(), participant.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "tasks");
  const act = async (action: string, id: string, extra = {}) =>
    command(
      action,
      { id, version: (await get(id))!.version, ...extra },
      actor,
      crypto.randomUUID(),
    );
  const paid = await act("participant-settle", participant.id, { items });
  assert.equal(paid.total, 5000);
  assert.equal((await get(t.id))!.settlementId, paid.id);
  await update(project.id, { settled: true });
  await assert.rejects(act("participant-settlement-cancel", paid.id), /마감/);
  assert.equal((await get(t.id))!.payoutStatus, "paid");
  await update(project.id, { settled: false });
  await act("participant-settlement-cancel", paid.id);
  assert.equal((await get(t.id))!.payoutStatus, "pending");
});
