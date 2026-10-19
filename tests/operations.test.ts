import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import "./helpers";
const { create, get, update, view, list } = await import("../src/lib/db");
const { command, projectCosts, save } = await import("../src/lib/domain");
const { saveAsset } = await import("../src/lib/assets");
const { participantBundle, recordDelivery } =
  await import("../src/lib/deliveries");
const { materialChecklist, materialRequest } =
  await import("../src/lib/material-checklist");
const { dashboard } = await import("../src/lib/dashboard");
const actor = "operations@test.local";
async function act(
  action: string,
  row: { id: string },
  extra: Record<string, unknown> = {},
  key = randomUUID(),
) {
  return command(
    action,
    { id: row.id, version: (await get(row.id))!.version, ...extra },
    actor,
    key,
  );
}
async function fixture() {
  const p = await create("projects", {
    name: "운영 테스트",
    status: "producing",
    customerId: randomUUID(),
    due: "2026-10-14",
    sale: 100000,
    payoutEstimate: 10000,
    aiEstimate: 0,
    budget: 10000,
    settled: false,
  });
  const blog = await create("tasks", {
    name: "블로그 1",
    projectId: p.id,
    channel: "blog",
    images: 3,
    status: "planned",
    brief: "기획",
    payout: 7000,
    payoutStatus: "pending",
    order: 1,
  });
  const clip = await create("tasks", {
    name: "클립 1",
    projectId: p.id,
    channel: "clip",
    images: 0,
    duration: 10,
    status: "planned",
    brief: "기획",
    payout: 7000,
    payoutStatus: "pending",
    order: 2,
  });
  const blogAccountId = randomUUID(),
    clipAccountId = randomUUID();
  const participant = await save(
    "participants",
    {
      name: "참여자",
      accounts: [
        {
          id: blogAccountId,
          channel: "blog",
          url: `https://blog.naver.com/${randomUUID()}`,
        },
        {
          id: clipAccountId,
          channel: "clip",
          url: `https://clip.naver.com/${randomUUID()}`,
        },
      ],
    },
    actor,
  );
  const input = {
    participantId: participant.id,
    blogTaskId: blog.id,
    clipTaskId: clip.id,
    blogAccountId,
    clipAccountId,
    amount: 10000,
    instructions: "필수 키워드: 제품 소개",
    replacePayouts: true,
  };
  return { p, blog, clip, participant, input };
}
test("게시 세트: 중복·교차 프로젝트 차단, 원가 1회 합산, 모두 확인한 뒤 통합 지급", async () => {
  const { p, blog, clip, input } = await fixture();
  await assert.rejects(
    act("posting-set-create", p, { ...input, replacePayouts: false }),
  );
  const other = await create("tasks", {
    projectId: randomUUID(),
    channel: "clip",
  });
  await assert.rejects(
    act("posting-set-create", p, { ...input, clipTaskId: other.id }),
    /같은 프로젝트/,
  );
  const key = randomUUID();
  const set = await act("posting-set-create", p, input, key);
  assert.equal((await act("posting-set-create", p, input, key)).id, set.id);
  await assert.rejects(act("posting-set-create", p, input), /이미/);
  assert.equal((await projectCosts(p)).actual, 10000);
  assert.equal((await get(blog.id))!.payout, 10000);
  assert.equal((await get(clip.id))!.payout, 0);
  await assert.rejects(act("payout", blog, { paid: true }), /통합 지급/);
  await assert.rejects(
    act("task-edit", blog, { brief: "기획", payout: 15000 }),
    /개별 변경/,
  );
  await assert.rejects(act("cancel-task", clip, { note: "취소" }), /개별 취소/);
  await assert.rejects(
    act("posting-set-pay", set, { paid: true }),
    /모두 확인/,
  );
  await update(blog.id, {
    status: "verified",
    link: "https://example.com/blog",
  });
  await assert.rejects(
    act("posting-set-pay", set, { paid: true }),
    /모두 확인/,
  );
  await update(clip.id, {
    status: "verified",
    link: "https://example.com/clip",
  });
  const paid = await act("posting-set-pay", set, { paid: true });
  assert.equal((await get(blog.id))!.paidAt, paid.paidAt);
  assert.equal((await get(clip.id))!.paidAt, paid.paidAt);
  assert.equal((await projectCosts(p)).actual, 10000);
  await assert.rejects(
    act("publication", blog, {
      link: "https://example.com/blog-new",
      verified: true,
    }),
    /먼저 세트 지급/,
  );
  await act("posting-set-pay", paid, { paid: false });
  assert.equal((await get(clip.id))!.payoutStatus, "pending");
  await update(p.id, { settled: true });
  await assert.rejects(
    act("posting-set-pay", paid, { paid: true }),
    /정산 마감/,
  );
});
test("동시 세트 배정은 한 번만 성공하고 보수를 중복 반영하지 않음", async () => {
  const { p, input } = await fixture();
  const outcomes = await Promise.allSettled([
    act("posting-set-create", p, input),
    act("posting-set-create", p, input),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await list("posting_sets")).filter((s) => s.projectId === p.id).length,
    1,
  );
  assert.equal((await projectCosts(p)).actual, 10000);
});
test("전달 전 세트 해제는 기존 개별 보수·담당자를 복원하고 재배정 가능", async () => {
  const { p, blog, clip, input } = await fixture();
  const set = await act("posting-set-create", p, input);
  await act("posting-set-dissolve", set);
  assert.equal((await get(blog.id))!.payout, 7000);
  assert.equal((await get(clip.id))!.postingSetId, null);
  assert.equal((await get(clip.id))!.participantId, null);
  const second = await act("posting-set-create", p, input);
  assert.notEqual(second.id, set.id);
  await update(blog.id, { status: "delivered" });
  await assert.rejects(act("posting-set-dissolve", second), /전달 전/);
});
test("참여자 ZIP: 해당 두 작업 승인본·게시 지침만 포함, 미승인·교차 접근 거절, 전달 재기록 시 게시 확인 보존", async () => {
  const { p, blog, clip, input } = await fixture();
  const set = await act("posting-set-create", p, input);
  await assert.rejects(participantBundle(p.id, set.id), /미승인/);
  await assert.rejects(
    participantBundle(randomUUID(), set.id),
    /다른 프로젝트/,
  );
  await saveAsset(
    {
      projectId: p.id,
      taskId: blog.id,
      category: "copy",
      name: "원고.md",
      buffer: Buffer.from("승인 원고"),
      text: "승인 원고",
    },
    actor,
  );
  for (let i = 0; i < 3; i++)
    await saveAsset(
      {
        projectId: p.id,
        taskId: blog.id,
        category: "image",
        name: `이미지${i}.png`,
        buffer: await sharp({
          create: {
            width: 8,
            height: 8,
            channels: 3,
            background: { r: 40 * i, g: 100, b: 200 },
          },
        })
          .png()
          .toBuffer(),
      },
      actor,
    );
  await saveAsset(
    {
      projectId: p.id,
      taskId: clip.id,
      category: "video",
      name: "클립.mp4",
      buffer: Buffer.from([
        0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109,
      ]),
    },
    actor,
  );
  await act("approve-task", blog);
  await saveAsset(
    {
      projectId: p.id,
      taskId: clip.id,
      category: "copy",
      name: "클립 설명.txt",
      text: "확인된 제품 정보를 소개합니다.",
      buffer: Buffer.from("확인된 제품 정보를 소개합니다."),
    },
    actor,
  );
  await act("approve-task", clip);
  const bundle = await participantBundle(p.id, set.id);
  assert.equal(bundle.tasks.length, 2);
  const instructions = bundle.entries
    .find((e) => e.path === "세트_게시안내.txt")!
    .buffer.toString();
  assert.match(instructions, /10000원/);
  assert.match(instructions, /필수 키워드/);
  assert.equal(bundle.entries.filter((e) => e.path.endsWith(".png")).length, 3);
  assert.ok(
    !bundle.entries.some((e) => /business|registration|비용/.test(e.path)),
  );
  await recordDelivery(
    { projectId: p.id, taskIds: [blog.id, clip.id], channel: "테스트" },
    actor,
  );
  await act("publication", blog, {
    link: `https://example.com/${blog.id}`,
    verified: true,
  });
  await recordDelivery(
    { projectId: p.id, taskIds: [blog.id, clip.id], channel: "재전달" },
    actor,
  );
  assert.equal((await get(blog.id))!.status, "verified");
  await update(
    (await list("assets")).find(
      (a) => a.taskId === blog.id && a.category === "image",
    )!.id,
    { current: false },
  );
  await assert.rejects(participantBundle(p.id, set.id), /다시 검수/);
});
test("자료 체크리스트: 접수 자동 인식·확인 분리·중복 키 검증, 한국 날짜 기준 대시보드 합산", async () => {
  const { p, blog, clip, input } = await fixture();
  await act("posting-set-create", p, input);
  await update(p.id, { status: "materials" });
  await create("assets", {
    projectId: p.id,
    category: "source",
    mime: "image/png",
    name: "사진.png",
  });
  const all = await view();
  const items = materialChecklist(
    all.projects.find((r) => r.id === p.id)!,
    all.assets,
  );
  assert.equal(items.find((i) => i.key === "photos")!.status, "received");
  assert.match(materialRequest(p, items), /원본 사진/);
  const duplicates = items.map(() => items[0]);
  await assert.rejects(
    act("materials-update", p, { items: duplicates }),
    /중복/,
  );
  items.forEach((i) => {
    i.status = "confirmed";
    i.note = "확인";
  });
  await act("materials-update", p, { items });
  assert.ok(
    materialChecklist((await get(p.id))!, all.assets).every(
      (i) => i.status === "confirmed",
    ),
  );
  const data = await view();
  data.projects = data.projects.filter((r) => r.id === p.id);
  data.tasks = data.tasks.filter((t) => [blog.id, clip.id].includes(t.id));
  data.jobs = [];
  const summary = dashboard(data, new Date("2026-10-13T15:01:00Z"));
  assert.equal(summary.today, "2026-10-14");
  assert.equal(summary.due, 1);
  assert.equal(summary.unpaid, 10000);
  assert.equal(summary.unpaidCount, 1);
  assert.equal(summary.rows[0].next, "기획 단계 시작");
});

test("촬영 대상·추가 요청 저장, 기존 수정 호환, 자동 기획 전환과 입력 검증", async () => {
  const { p } = await fixture();
  const base = { materialNotes: "확인", instructions: "", budget: 10000 };
  await act("project-notes", p, {
    ...base,
    shootingTarget: "factory",
    mediaInstructions: "  설비 연결부를 보존하고 밝은 낮 분위기로  ",
  });
  assert.equal((await get(p.id))!.shootingTarget, "factory");
  assert.equal(
    (await get(p.id))!.mediaInstructions,
    "설비 연결부를 보존하고 밝은 낮 분위기로",
  );
  await act("project-notes", p, base);
  assert.equal((await get(p.id))!.shootingTarget, "factory");
  assert.equal(
    (await get(p.id))!.mediaInstructions,
    "설비 연결부를 보존하고 밝은 낮 분위기로",
  );
  await assert.rejects(
    act("project-notes", p, { ...base, shootingTarget: "invalid" }),
  );
  await assert.rejects(
    act("project-notes", p, { ...base, mediaInstructions: "a".repeat(5001) }),
  );
  await act("project-notes", p, {
    ...base,
    shootingTarget: "",
    mediaInstructions: "",
  });
  assert.equal((await get(p.id))!.shootingTarget, "");
  assert.equal((await get(p.id))!.mediaInstructions, "");
});
