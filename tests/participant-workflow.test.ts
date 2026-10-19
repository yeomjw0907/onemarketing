import { test } from "node:test";
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
} from "../src/lib/work-offers";
import { defaultWorkflowPolicy } from "../src/lib/workflow-policy";
import { settlementItems } from "../src/lib/participant-settlement-view";
import { portalView } from "../src/lib/portal";
const actor = "workflow-audit@local";
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
test("bundle offer → accept → approved materials → submit → 3-day review → single settlement and referral", async () => {
  const ref = await save(
    "participants",
    { name: "추천인", phone: "01010000001", payment: { method: "kakaopay" } },
    actor,
  );
  const account = {
    id: crypto.randomUUID(),
    channel: "blog",
    url: "https://blog.naver.com/workflow-audit",
    approvalStatus: "approved",
    ownershipVerifiedAt: new Date().toISOString(),
  };
  const worker = await save(
    "participants",
    {
      name: "작업자",
      phone: "01010000002",
      accounts: [account],
      payment: { method: "kakaopay" },
      referrerId: ref.id,
    },
    actor,
  );
  const project = await create("projects", {
    name: "묶음 흐름",
    status: "producing",
    due: "2027-01-31",
    workflowPolicy: defaultWorkflowPolicy,
    guide: "광고 표시 유지",
    guideVersion: 1,
  });
  const slot = await create("work_slots", {
    projectId: project.id,
    type: "bundle",
    name: "블로그 + 클립 1세트",
    status: "unassigned",
    taskIds: [],
    payoutStatus: "pending",
  });
  const tasks = [];
  for (const channel of ["blog", "clip"]) {
    const t = await create("tasks", {
      projectId: project.id,
      workSlotId: slot.id,
      channel,
      name: channel,
      status: "producing",
      payoutStatus: "pending",
      images: channel === "blog" ? 1 : 0,
    });
    tasks.push(t);
  }
  await update(slot.id, { taskIds: tasks.map((t) => t.id) });
  const offer = await proposeWork(
    {
      slotId: slot.id,
      participantId: worker.id,
      blogAccountId: account.id,
      clipAccountId: account.id,
    },
    actor,
  );
  await assert.rejects(respondOffer(offer.id, ref.id, true), /본인/);
  await respondOffer(offer.id, worker.id, true);
  await assert.rejects(respondOffer(offer.id, worker.id, true), /이미 처리/);
  await assert.rejects(
    submitPublication(tasks[0].id, worker.id, account.url + "/100"),
    /자료 전달/,
  );
  await assert.rejects(releaseMaterials(slot.id, actor), /승인/);
  for (const task of tasks) {
    for (const category of task.channel === "blog"
      ? ["copy", "image"]
      : ["video", "copy"])
      await create("assets", {
        projectId: project.id,
        taskId: task.id,
        current: true,
        category,
        name: "승인 " + category,
        text:
          category === "copy" ? "[광고] 광고 표시를 유지하는 원고" : undefined,
      });
    await act("approve-task", task.id);
  }
  await releaseMaterials(slot.id, actor);
  assert.equal(
    (await portalView((await get(worker.id))!)).tasks.find(
      (t) => t.channel === "blog",
    )!.files.length,
    2,
  );
  assert.equal((await portalView((await get(ref.id))!)).tasks.length, 0);
  await assert.rejects(
    submitPublication(tasks[0].id, ref.id, account.url + "/100"),
    /본인/,
  );
  await assert.rejects(
    submitPublication(
      tasks[0].id,
      worker.id,
      "https://blog.naver.com/other/100",
    ),
    /배정된 계정/,
  );
  const links = [
    account.url + "/100",
    "https://m.naver.com/shorts/?mediaId=workflow-audit-200",
  ];
  for (let i = 0; i < tasks.length; i++)
    await submitPublication(tasks[i].id, worker.id, links[i]);
  for (const task of tasks)
    await assert.rejects(
      act("publication", task.id, {
        link: (await get(task.id))!.link,
        verified: true,
      }),
      /3일/,
    );
  assert.equal(settlementItems(await view(), worker.id).length, 0);
  await assert.rejects(act("work-slot-pay", slot.id, { paid: true }), /확인/);
  // Advance only isolated fixture timestamps; production policy remains three days.
  for (const task of tasks)
    await update(task.id, {
      submittedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      reviewEligibleAt: new Date(Date.now() - 86400000).toISOString(),
    });
  await act("publication", tasks[0].id, { link: links[0], verified: true });
  assert.equal(settlementItems(await view(), worker.id).length, 0);
  await act("publication", tasks[1].id, { link: links[1], verified: true });
  const verified = (await get(tasks[0].id))!;
  assert.ok(
    Date.parse(String(verified.retentionUntil)) > Date.now() + 89 * 86400000,
  );
  const items = settlementItems(await view(), worker.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount, 7000);
  const key = crypto.randomUUID(),
    input = {
      id: worker.id,
      version: (await get(worker.id))!.version,
      items: items.map((i) => ({ id: i.id, token: i.token })),
    };
  const results = await Promise.all([
    command("participant-settle", input, actor, key),
    command("participant-settle", input, actor, key),
  ]);
  assert.equal(results[0].id, results[1].id);
  await assert.rejects(
    command("participant-settle", input, actor, crypto.randomUUID()),
    /지급 가능 내역/,
  );
  const portal = await portalView((await get(worker.id))!);
  assert.equal(portal.settlements.length, 1);
  assert.equal(portal.settlements[0].total, 7000);
  assert.ok(portal.tasks.every((t) => t.payoutStatus === "paid"));
  assert.equal(
    (await list("referral_credits"))
      .filter((c) => c.participantId === ref.id)
      .reduce((n, c) => n + Number(c.amount), 0),
    1200,
  );
  await assert.rejects(
    submitPublication(tasks[0].id, worker.id, account.url + "/101"),
    /지급/,
  );
  assert.ok(
    (await list("notification_outbox")).some(
      (n) => n.type === "materials" && n.participantId === worker.id,
    ),
  );
  assert.ok(
    (await list("notification_outbox")).some(
      (n) => n.type === "payment" && n.participantId === worker.id,
    ),
  );
});
