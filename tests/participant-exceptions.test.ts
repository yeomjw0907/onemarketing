import { test } from "node:test";
import type { RecordData } from "../src/lib/types";
import assert from "node:assert/strict";
import "./helpers";
import { save, command } from "../src/lib/domain";
import { create, get, list, update, view } from "../src/lib/db";
import {
  proposeWork,
  respondOffer,
  releaseMaterials,
  submitPublication,
  requestRevision,
  partialPay,
  cancelUnfinished,
  cancelPartialPay,
} from "../src/lib/work-offers";
import { defaultWorkflowPolicy } from "../src/lib/workflow-policy";
import { portalView } from "../src/lib/portal";
import { settlementItems } from "../src/lib/participant-settlement-view";
const actor = "exception-qa@local";
const act = async (
  action: string,
  id: string,
  data: Record<string, unknown> = {},
) =>
  command(
    action,
    { id, version: (await get(id))!.version, ...data },
    actor,
    crypto.randomUUID(),
  );
async function fixture() {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const ref = await save(
    "participants",
    { name: "추천인", phone: "01010000000", payment: { method: "kakaopay" } },
    actor,
  );
  const workers: RecordData[] = [];
  for (const n of [1, 2]) {
    const account = {
      id: crypto.randomUUID(),
      channel: "blog",
      url: "https://blog.naver.com/u" + suffix + n,
      approvalStatus: "approved",
      ownershipVerifiedAt: new Date().toISOString(),
    };
    workers.push(
      await save(
        "participants",
        {
          name: "작업자 " + n,
          phone: "0101000000" + n,
          accounts: [account],
          payment: { method: "kakaopay" },
          referrerId: ref.id,
        },
        actor,
      ),
    );
  }
  const project = await create("projects", {
    name: "예외 캠페인",
    status: "producing",
    due: "2027-01-31",
    workflowPolicy: defaultWorkflowPolicy,
    guide: "광고 표시 유지",
    guideVersion: 1,
  });
  const slot = await create("work_slots", {
    projectId: project.id,
    type: "bundle",
    name: "묶음 1세트",
    status: "unassigned",
    taskIds: [],
    payoutStatus: "pending",
  });
  const tasks: RecordData[] = [];
  for (const channel of ["blog", "clip"]) {
    const task = await create("tasks", {
      projectId: project.id,
      workSlotId: slot.id,
      channel,
      name: channel,
      status: "producing",
      payoutStatus: "pending",
      images: 0,
    });
    tasks.push(task);
    await create("assets", {
      projectId: project.id,
      taskId: task.id,
      current: true,
      category: channel === "blog" ? "copy" : "video",
      name: channel,
      text: "광고 표시 원고",
    });
  }
  await update(slot.id, { taskIds: tasks.map((t) => t.id) });
  async function offer(worker = workers[0], slotId = slot.id) {
    const account = (worker.accounts as { id: string }[])[0];
    return proposeWork(
      {
        slotId,
        participantId: worker.id,
        blogAccountId: account.id,
        clipAccountId: account.id,
      },
      actor,
    );
  }
  async function deliver() {
    const o = await offer();
    await respondOffer(o.id, workers[0].id, true);
    for (const t of tasks) await act("approve-task", t.id);
    await releaseMaterials(slot.id, actor);
  }
  async function submitAndVerify(index: number) {
    const t = tasks[index],
      account = (workers[0].accounts as { url: string }[])[0];
    const link =
      index === 0
        ? account.url + "/123"
        : "https://m.naver.com/shorts/?mediaId=" + suffix;
    await submitPublication(t.id, workers[0].id, link);
    await update(t.id, {
      submittedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    });
    await act("publication", t.id, { link, verified: true });
    return link;
  }
  return {
    ref,
    workers,
    project,
    slot,
    tasks,
    offer,
    deliver,
    submitAndVerify,
  };
}
test("decline releases slot and expired offers cannot be accepted but can be replaced", async () => {
  const f = await fixture(),
    first = await f.offer();
  await respondOffer(first.id, f.workers[0].id, false);
  assert.equal((await get(f.slot.id))!.participantId, undefined);
  const next = await f.offer(f.workers[1]);
  await update(next.id, {
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  await assert.rejects(respondOffer(next.id, f.workers[1].id, true), /만료/);
  const fresh = await f.offer(f.workers[0]);
  assert.equal((await get(next.id))!.status, "expired");
  await respondOffer(fresh.id, f.workers[0].id, true);
  await assert.rejects(
    respondOffer(first.id, f.workers[0].id, true),
    /이미 처리/,
  );
});
test("major correction resets 3-day review, minor correction preserves original submission clock", async () => {
  const f = await fixture();
  await f.deliver();
  const account = (f.workers[0].accounts as { url: string }[])[0],
    link = account.url + "/321";
  await submitPublication(f.tasks[0].id, f.workers[0].id, link);
  const old = new Date(Date.now() - 4 * 86400000).toISOString();
  await update(f.tasks[0].id, { submittedAt: old });
  await requestRevision(f.tasks[0].id, "문구 수정", false, actor);
  await submitPublication(f.tasks[0].id, f.workers[0].id, link);
  assert.equal((await get(f.tasks[0].id))!.submittedAt, old);
  await act("publication", f.tasks[0].id, { link, verified: true });
  await requestRevision(f.tasks[0].id, "게시물 교체", true, actor);
  assert.equal((await get(f.tasks[0].id))!.submittedAt, null);
  await submitPublication(f.tasks[0].id, f.workers[0].id, link);
  await assert.rejects(
    act("publication", f.tasks[0].id, { link, verified: true }),
    /3일/,
  );
  assert.equal(settlementItems(await view(), f.workers[0].id).length, 0);
});
test("partial settlement then recruitment preserves quantities, ownership and 500 + 500 referral", async () => {
  const f = await fixture();
  const declined = await f.offer();
  await respondOffer(declined.id, f.workers[0].id, false);
  await f.deliver();
  await f.submitAndVerify(0);
  await partialPay(f.slot.id, f.tasks[0].id, actor);
  await assert.rejects(
    partialPay(f.slot.id, f.tasks[0].id, actor),
    /부분 지급/,
  );
  const next = await cancelUnfinished(f.slot.id, actor);
  assert.equal(next.type, "clip");
  assert.equal(
    (await list("tasks")).filter((t) => t.projectId === f.project.id).length,
    2,
  );
  assert.equal(
    (await portalView((await get(f.workers[0].id))!)).tasks.length,
    1,
  );
  const remaining = (await get(f.tasks[1].id))!;
  assert.equal(remaining.participantId, null);
  assert.equal(
    (await portalView((await get(f.workers[0].id))!)).offers[0]
      .partialFinalizedAmount,
    3000,
  );
  assert.equal(
    (await portalView((await get(f.workers[0].id))!)).offers.find(
      (o) => o.id === declined.id,
    )!.partialFinalizedAmount,
    null,
  );
  assert.equal(remaining.requestedAt, null);
  assert.equal(remaining.postingDeadlineAt, null);
  await assert.rejects(cancelPartialPay(f.slot.id, actor), /최종 지급/);
  const newOffer = await f.offer(f.workers[1], next.id);
  await respondOffer(newOffer.id, f.workers[1].id, true);
  await releaseMaterials(next.id, actor);
  await assert.rejects(
    submitPublication(
      f.tasks[1].id,
      f.workers[0].id,
      "https://m.naver.com/shorts/?mediaId=forbidden",
    ),
    /본인/,
  );
  const link = "https://m.naver.com/shorts/?mediaId=" + crypto.randomUUID();
  await submitPublication(f.tasks[1].id, f.workers[1].id, link);
  await update(f.tasks[1].id, {
    submittedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  });
  await act("publication", f.tasks[1].id, { link, verified: true });
  await act("work-slot-pay", next.id, { paid: true });
  const credits = (await list("referral_credits")).filter(
    (c) => c.projectId === f.project.id,
  );
  assert.deepEqual(credits.map((c) => c.amount).sort(), [500, 500]);
  assert.equal(
    (await portalView((await get(f.workers[0].id))!)).settlements.reduce(
      (n, s) => n + Number(s.total),
      0,
    ),
    3000,
  );
  assert.equal(
    (await portalView((await get(f.workers[1].id))!)).settlements.reduce(
      (n, s) => n + Number(s.total),
      0,
    ),
    3000,
  );
});
test("submitted remaining post blocks recruitment; cancelling partial payment restores eligibility", async () => {
  const f = await fixture();
  await f.deliver();
  await f.submitAndVerify(0);
  await partialPay(f.slot.id, f.tasks[0].id, actor);
  await submitPublication(
    f.tasks[1].id,
    f.workers[0].id,
    "https://m.naver.com/shorts/?mediaId=" + crypto.randomUUID(),
  );
  await assert.rejects(cancelUnfinished(f.slot.id, actor), /제출된 게시물/);
  await cancelPartialPay(f.slot.id, actor);
  assert.equal((await get(f.tasks[0].id))!.payoutStatus, "pending");
  assert.equal(
    (await portalView((await get(f.workers[0].id))!)).settlements.length,
    0,
  );
});

test("late submission remains possible and major revision deadline is independent", async () => {
  const f = await fixture();
  await f.deliver();
  const due = new Date(Date.now() - 86400000).toISOString();
  await update(f.tasks[0].id, { submissionDue: due, postingDeadlineAt: due });
  const link = (f.workers[0].accounts as { url: string }[])[0].url + "/999";
  await submitPublication(f.tasks[0].id, f.workers[0].id, link);
  assert.ok(
    Date.parse(String((await get(f.tasks[0].id))!.submittedAt)) >
      Date.parse(due),
  );
  await requestRevision(f.tasks[0].id, "주요 수정", true, actor);
  assert.ok(
    Date.parse(String((await get(f.tasks[0].id))!.revisionDue)) > Date.now(),
  );
});
