import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "om-participants-"));
const { save, command, projectCosts } = await import("../src/lib/domain");
const { get, list } = await import("../src/lib/db");
const actor = "participants@local";
const account = () => ({
  id: crypto.randomUUID(),
  channel: "blog",
  url: "https://blog.naver.com/participant-test",
  label: "메인 블로그",
});
function task() {
  const c = save("customers", { name: "고객" }, actor),
    product = save("products", { name: "제품", customerId: c.id }, actor),
    price = save(
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
    contract = save(
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
    p = save(
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
  return { p, t: list("tasks").find((t) => t.projectId === p.id)! };
}
test("참여자 등록·다중 계정·중복 계정 및 위험 URL 차단", () => {
  const a = account();
  const p = save(
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
  assert.throws(
    () =>
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
  assert.throws(() =>
    save(
      "participants",
      { name: "위험", accounts: [{ ...a, url: "javascript:alert(1)" }] },
      actor,
    ),
  );
  assert.throws(
    () => save("participants", { name: "중복내부", accounts: [a, a] }, actor),
    /중복/,
  );
});
test("참여자 배정·채널 확인·기본 단가 변경 시 기존 보수 유지·지급 후 재배정 차단", () => {
  const a = { ...account(), url: "https://blog.naver.com/assignment-test" },
    p = save(
      "participants",
      { name: "배정 참여자", accounts: [a], blogRate: 8000 },
      actor,
    );
  const { p: project, t } = task();
  const edit = (extra: Record<string, unknown> = {}) =>
    command(
      "task-edit",
      {
        id: t.id,
        version: get(t.id)!.version,
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
  const assigned = edit();
  assert.equal(assigned.participantId, p.id);
  assert.equal(assigned.payout, 5000);
  assert.equal(
    (assigned.participantSnapshot as { account: { url: string } }).account.url,
    a.url,
  );
  save("participants", { ...p, blogRate: 12000 }, actor, p.id, p.version);
  assert.equal(get(t.id)!.payout, 5000);
  assert.throws(
    () => edit({ participantAccountId: crypto.randomUUID() }),
    /계정/,
  );
  command(
    "payout",
    { id: t.id, version: get(t.id)!.version, paid: true },
    actor,
    crypto.randomUUID(),
  );
  assert.throws(() => edit({ payout: 9000 }), /지급 완료/);
  assert.throws(
    () => edit({ participantId: "", participantAccountId: "" }),
    /지급 완료/,
  );
  assert.equal(projectCosts(project).actual, 5000);
});
test("섭외 보류 참여자 신규 배정 차단과 과거 협업 이력 정산 검증", () => {
  const a = { ...account(), url: "https://blog.naver.com/paused-test" },
    p = save(
      "participants",
      { name: "보류 참여자", status: "paused", accounts: [a] },
      actor,
    ),
    { p: project, t } = task();
  assert.throws(
    () =>
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
  assert.throws(() =>
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
  );
  const h = save(
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
  assert.equal(projectCosts(project).actual, 5000);
  save("participants", { ...p, notes: "수정된 메모" }, actor, p.id, p.version);
  assert.throws(
    () => save("participants", { ...p, name: "충돌" }, actor, p.id, p.version),
    /수정/,
  );
});
