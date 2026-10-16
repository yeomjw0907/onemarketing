import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import "./helpers";
const { save, command, projectCosts } = await import("../src/lib/domain");
const { get, list, update, create } = await import("../src/lib/db");
const { saveAsset } = await import("../src/lib/assets");
const { workSlotBundle, recordDelivery } =
  await import("../src/lib/deliveries");
const actor = "slots@test.local";
async function act(
  action: string,
  id: string,
  values: Record<string, unknown> = {},
) {
  return command(
    action,
    { id, version: (await get(id))!.version, ...values },
    actor,
    crypto.randomUUID(),
  );
}
async function fixture() {
  const customer = await save("customers", { name: "슬롯 고객" }, actor),
    product = await save(
      "products",
      { name: "피자설기", customerId: customer.id },
      actor,
    );
  const blog = await save(
    "prices",
    {
      name: "블로그",
      channel: "blog",
      sale: 10000,
      payout: 5000,
      aiEstimate: 1000,
      images: 3,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    actor,
  );
  const clip = await save(
    "prices",
    {
      name: "클립",
      channel: "clip",
      sale: 10000,
      payout: 5000,
      aiEstimate: 1000,
      images: 0,
      duration: 10,
      mode: "generated",
      revisions: 1,
    },
    actor,
  );
  const contract = await save(
    "contracts",
    {
      name: "장바구니",
      customerId: customer.id,
      packages: [
        {
          type: "bundle",
          quantity: 3,
          blogPriceId: blog.id,
          clipPriceId: clip.id,
        },
        { type: "clip", quantity: 2, clipPriceId: clip.id },
      ],
      months: 1,
      setsPerMonth: 1,
      startMonth: "2026-10",
    },
    actor,
  );
  const p = await save(
    "projects",
    {
      name: "장바구니 프로젝트",
      contractId: contract.id,
      productId: product.id,
      slot: 0,
      due: "2026-12-30",
      budget: 100000,
    },
    actor,
  );
  const accounts = [
    {
      id: crypto.randomUUID(),
      channel: "blog",
      url: "https://blog.naver.com/" + crypto.randomUUID(),
    },
    {
      id: crypto.randomUUID(),
      channel: "clip",
      url: "https://m.naver.com/clip/profile/" + crypto.randomUUID(),
    },
  ];
  accounts.push(
    ...accounts.map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      url: a.url + "extra",
    })),
    {
      id: crypto.randomUUID(),
      channel: "clip",
      url: "https://m.naver.com/clip/profile/" + crypto.randomUUID(),
    },
  );
  const participant = await save(
    "participants",
    {
      name: "체험단",
      phone: "010-1234-5678",
      email: "worker@example.com",
      accounts,
    },
    actor,
  );
  return { p, contract, participant, accounts, blog };
}
test("new cart projects create unassigned slots, immutable scope, exact rewards, and assign the same worker to multiple distinct slots", async () => {
  const { p, contract, participant, accounts, blog } = await fixture();
  assert.equal(participant.blogRate, 3000);
  assert.equal(participant.clipRate, 3000);
  assert.equal(participant.bundleRate, 7000);
  assert.equal(participant.email, "worker@example.com");
  assert.equal(contract.sale, 80000);
  assert.equal(contract.cost, 35000);
  const tasks = (await list("tasks")).filter((t) => t.projectId === p.id),
    slots = (await list("work_slots")).filter((s) => s.projectId === p.id);
  assert.equal(tasks.filter((t) => t.channel === "blog").length, 3);
  assert.equal(tasks.filter((t) => t.channel === "clip").length, 5);
  assert.equal(slots.length, 5);
  assert.equal(
    tasks.reduce((n, t) => n + Number(t.payout), 0),
    27000,
  );
  assert.equal(
    slots.every((s) => s.participantId === null),
    true,
  );
  await update(blog.id, { sale: 999999, images: 9, payout: 99999 });
  assert.equal((await get(contract.id))!.sale, 80000);
  assert.equal((await get(p.id))!.payoutEstimate, 27000);
  const bundles = slots.filter((s) => s.type === "bundle");
  await saveAsset(
    {
      projectId: p.id,
      category: "source",
      name: "기준.png",
      buffer: await sharp({
        create: { width: 20, height: 20, channels: 3, background: "white" },
      })
        .png()
        .toBuffer(),
    },
    actor,
  );
  const { mediaBinding } = await import("../src/lib/media-plans");
  const imageTask = tasks.find(
    (t) => t.workSlotId === bundles[0].id && t.channel === "blog",
  )!;
  const initialFingerprint = (await mediaBinding(p.id, imageTask.id, "image"))
    .fingerprint;
  for (const [index, slot] of bundles.slice(0, 2).entries())
    await act("work-slot-assign", slot.id, {
      participantId: participant.id,
      blogAccountId: accounts[index * 2].id,
      clipAccountId: accounts[index * 2 + 1].id,
    });
  const slot = (await get(bundles[0].id))!;
  assert.equal(slot.amount, 7000);
  assert.equal(
    (await mediaBinding(p.id, imageTask.id, "image")).fingerprint,
    initialFingerprint,
    "담당자 배정만으로 생성 브리핑을 다시 만들지 않음",
  );
  const assignedSecond = (await get(bundles[1].id))!;
  await assert.rejects(
    act("work-slot-assign", assignedSecond.id, {
      participantId: participant.id,
      blogAccountId: accounts[1].id,
      clipAccountId: accounts[0].id,
    }),
    /채널/,
  );
  assert.equal(
    (await get(assignedSecond.id))!.postingSetId,
    assignedSecond.postingSetId,
  );
  assert.notEqual(
    (await get(String(assignedSecond.postingSetId)))!.status,
    "cancelled",
  );
  assert.ok(slot.postingSetId);
  const linked = (await list("tasks")).filter((t) => t.workSlotId === slot.id);
  assert.equal(
    linked.reduce((n, t) => n + Number(t.payout), 0),
    7000,
  );
  await assert.rejects(
    act("work-slot-pay", slot.id, { paid: true }),
    /모든 게시물/,
  );
  await update(linked[0].id, { status: "verified" });
  await assert.rejects(
    act("work-slot-pay", slot.id, { paid: true }),
    /모든 게시물/,
  );
  await update(linked[1].id, { status: "verified" });
  await act("work-slot-pay", slot.id, { paid: true });
  assert.equal((await get(linked[0].id))!.payoutStatus, "paid");
  assert.equal((await get(linked[1].id))!.payoutStatus, "paid");
  await assert.rejects(
    act("work-slot-assign", slot.id, { participantId: "" }),
    /전달·지급/,
  );
  assert.equal((await projectCosts(p)).actual, 27000);
  const single = slots.find((s) => s.type === "clip")!;
  await act("work-slot-assign", single.id, {
    participantId: participant.id,
    clipAccountId: accounts[0].id,
  });
  assert.equal((await get(single.id))!.participantId, participant.id);
});
test("approved files are scoped to the worker; delivery, submission, verification and correction timestamps remain auditable", async () => {
  const { p, participant, accounts } = await fixture();
  const tasks = (await list("tasks")).filter((t) => t.projectId === p.id);
  const t = tasks.find((t) => t.channel === "blog")!;
  // Use a standalone slot to exercise the same file flow without an unrelated video.
  const slot = await create("work_slots", {
    projectId: p.id,
    type: "blog",
    name: "체험단 only",
    amount: 3000,
    participantId: null,
    taskIds: [t.id],
  });
  await update(t.id, { workSlotId: slot.id, payout: 3000 });
  await act("work-slot-assign", slot.id, {
    participantId: participant.id,
    blogAccountId: accounts[0].id,
  });
  await update(p.id, { status: "producing" });
  await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "원고.txt",
      text: "게시용 원고",
      buffer: Buffer.from("게시용 원고"),
    },
    actor,
  );
  for (let i = 0; i < 3; i++)
    await saveAsset(
      {
        projectId: p.id,
        taskId: t.id,
        category: "image",
        name: `이미지${i}.png`,
        buffer: await sharp({
          create: {
            width: 20,
            height: 20,
            channels: 3,
            background: { r: 20 * i, g: 100, b: 100 },
          },
        })
          .png()
          .toBuffer(),
      },
      actor,
    );
  await assert.rejects(workSlotBundle(p.id, slot.id), /미승인/);
  await act("approve-task", t.id);
  const bundle = await workSlotBundle(p.id, slot.id);
  assert.equal(bundle.tasks.length, 1);
  assert.ok(bundle.entries.some((e) => e.path.endsWith("원고.txt")));
  assert.equal(
    bundle.entries.filter((e) => e.path.includes("이미지_")).length,
    3,
  );
  assert.ok(bundle.entries.some((e) => e.path === "체험단_게시안내.txt"));
  await assert.rejects(
    workSlotBundle(crypto.randomUUID(), slot.id),
    /동일 프로젝트/,
  );
  await recordDelivery(
    {
      projectId: p.id,
      taskIds: [t.id],
      channel: "카톡",
      postingDeadlineAt: "2026-12-30T14:59:59Z",
    },
    actor,
  );
  const requested = (await get(t.id))!.requestedAt;
  assert.ok(requested);
  await recordDelivery(
    { projectId: p.id, taskIds: [t.id], channel: "재전달" },
    actor,
  );
  assert.equal((await get(t.id))!.requestedAt, requested);
  await assert.rejects(
    act("work-slot-assign", slot.id, { participantId: "" }),
    /전달·지급/,
  );
  await act("publication", t.id, {
    link: "https://blog.naver.com/post/" + crypto.randomUUID(),
    verified: false,
  });
  const submitted = (await get(t.id))!.submittedAt;
  assert.ok(submitted);
  const link = (await get(t.id))!.link;
  await act("publication", t.id, {
    link,
    verified: true,
    qualityScore: 5,
    qualityNotes: "요청대로 게시",
  });
  const verified = (await get(t.id))!.verifiedAt;
  await act("publication", t.id, { link, verified: true, qualityScore: 5 });
  assert.equal((await get(t.id))!.verifiedAt, verified);
  assert.equal((await get(t.id))!.submittedAt, submitted);
  await act("posting-feedback", t.id, { note: "광고 표시 위치 수정" });
  assert.equal((await get(t.id))!.qualityScore, null);
  assert.equal((await get(t.id))!.postingRevisionCount, 1);
  await act("publication", t.id, { link, verified: true, qualityScore: 4 });
  await act("work-slot-pay", slot.id, { paid: true });
  await assert.rejects(
    act("posting-feedback", t.id, { note: "변경" }),
    /미지급/,
  );
  const history = (await list("participant_events")).filter(
    (e) => e.participantId === participant.id,
  );
  for (const type of [
    "assignment",
    "request",
    "submission",
    "verification",
    "revision",
  ])
    assert.ok(history.some((e) => e.type === type));
});

test("managed accounts are approved individually and settlement groups verified slots without double counting", async () => {
  const { p, participant, accounts } = await fixture();
  await update(participant.id, {
    operationType: "managed",
    payment: { method: "kakaopay" },
  });
  await act("participant-account-review", participant.id, {
    accountId: accounts[0].id,
    status: "pending",
  });
  const slots = (await list("work_slots")).filter((s) => s.projectId === p.id);
  const bundle = slots.find((s) => s.type === "bundle")!;
  await assert.rejects(
    act("work-slot-assign", bundle.id, {
      participantId: participant.id,
      blogAccountId: accounts[0].id,
      clipAccountId: accounts[0].id,
    }),
    /계정/,
  );
  await act("participant-account-review", participant.id, {
    accountId: accounts[0].id,
    status: "approved",
  });
  await act("work-slot-assign", bundle.id, {
    participantId: participant.id,
    blogAccountId: accounts[0].id,
    clipAccountId: accounts[0].id,
  });
  const { settlementItems } =
    await import("../src/lib/participant-settlement-view");
  const { view } = await import("../src/lib/db");
  assert.equal(settlementItems(await view(), participant.id).length, 0);
  const tasks = (await list("tasks")).filter((t) => t.workSlotId === bundle.id);
  for (const t of tasks) await update(t.id, { status: "verified" });
  const history = await save(
    "participant_history",
    {
      participantId: participant.id,
      name: "추가 보수",
      channel: "blog",
      date: "2026-10-16",
      amount: 3000,
      paid: false,
    },
    actor,
  );
  const items = settlementItems(await view(), participant.id);
  assert.equal(items.length, 2);
  assert.equal(
    items.reduce((sum, i) => sum + i.amount, 0),
    10000,
  );
  const result = await act("participant-settle", participant.id, { items });
  assert.equal(result.total, 10000);
  assert.equal((await get(history.id))!.paid, true);
  for (const t of tasks) assert.equal((await get(t.id))!.payoutStatus, "paid");
  assert.equal(settlementItems(await view(), participant.id).length, 0);
  await assert.rejects(
    act("participant-settle", participant.id, { items }),
    /변경/,
  );
  await assert.rejects(
    act("work-slot-pay", bundle.id, { paid: false }),
    /합산/,
  );
  await act("participant-settlement-cancel", result.id);
  assert.equal((await get(history.id))!.paid, false);
  assert.equal(settlementItems(await view(), participant.id).length, 2);
  await assert.rejects(
    act("participant-settle", participant.id, { items }),
    /변경/,
  );
});
