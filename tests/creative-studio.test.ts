import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, get, list, update } from "../src/lib/db";
import { reviewCreative } from "../src/lib/creative-plans";
import {
  scenarioSchema,
  creativeBasis,
  taskFlow,
} from "../src/lib/creative-schema";
import { enqueue } from "../src/lib/jobs";
import { executeProviderJob } from "../src/lib/providers";
import { kinds, type DatabaseView } from "../src/lib/types";
import { videoStartFrame } from "../src/lib/video-frame";
import sharp from "sharp";
import { mediaBinding } from "../src/lib/media-plans";
const actor = "creative@test.local";
test("selected reference is bound to the same project/task and real-footage scenarios cannot silently become generated video", async () => {
  const { p, t } = await fixture();
  const source = await create("assets", {
    projectId: p.id,
    category: "source",
    current: true,
    mime: "image/png",
  });
  const bound = await mediaBinding(p.id, t.id, "video", undefined, source.id);
  assert.equal(bound.sourceAssetId, source.id);
  const other = await fixture();
  const foreign = await create("assets", {
    projectId: other.p.id,
    category: "source",
    current: true,
    mime: "image/png",
  });
  await assert.rejects(
    mediaBinding(p.id, t.id, "video", undefined, foreign.id),
    /기준 사진/,
  );
  await update(t.id, {
    creativeFormat: "story",
    approvedCreativeCandidate: { scenes: [{ method: "footage" }] },
  });
  await assert.rejects(
    mediaBinding(p.id, t.id, "video", undefined, source.id),
    /실제 촬영/,
  );
});
const proposal = {
  candidates: Array.from({ length: 3 }, (_, i) => ({
    title: `방향 ${i}`,
    concept: "서로 다른 상황을 소개",
    target: "이용 고객",
    rationale: "확인된 서비스 기능 소개",
    scenes: [
      {
        seconds: 5,
        visual: "실제 서비스 화면",
        caption: "서비스 소개",
        method: "source",
        requirements: "승인한 화면",
      },
    ],
    cta: "상담하기",
    risks: [],
  })),
};
async function fixture() {
  const p = await create("projects", {
    name: "캠페인",
    status: "review",
    budget: 10000,
    knowledge: {
      customer: { name: "회사" },
      product: { name: "서비스", facts: "예약 확인 기능" },
    },
  });
  const t = await create("tasks", {
    projectId: p.id,
    name: "클립",
    channel: "clip",
    duration: 5,
    images: 0,
    mode: "ai",
    status: "review",
    brief: "예약 기능 소개",
    briefApprovedAt: "2026-10-19T00:00:00Z",
  });
  return { p, t };
}
async function review(taskId: string, action: string, extra: object = {}) {
  const t = (await get(taskId))!;
  return reviewCreative(
    { taskId, version: t.version, action, ...extra },
    actor,
  );
}
test("scenario proposal uses only the text provider, approval attaches one candidate without changing contracted task quantity", async () => {
  const { p, t } = await fixture();
  await review(t.id, "format", { format: "story" });
  process.env.ANTHROPIC_API_KEY = "test-not-real";
  const job = await enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "scenario",
      estimate: 100,
      key: crypto.randomUUID(),
    },
    actor,
  );
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    calls++;
    return Response.json({
      id: "scenario-test",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(proposal) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  }) as typeof fetch;
  try {
    await executeProviderJob(job);
    await executeProviderJob(job);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 1);
  await update(job.id, { status: "succeeded" });
  const plans = (await list("media_plans")).filter((x) => x.jobId === job.id);
  assert.equal(plans.length, 1);
  await review(t.id, "approve", { planId: plans[0].id, candidate: 1 });
  assert.equal((await get(t.id))!.approvedCreativePlanId, plans[0].id);
  assert.equal(
    ((await get(t.id))!.approvedCreativeCandidate as { title: string }).title,
    "방향 1",
  );
  assert.equal(
    (await list("tasks")).filter((x) => x.projectId === p.id).length,
    1,
  );
});
test("rejection requires a reason, stale and cross-task approvals are rejected, switching to standard preserves task quantity", async () => {
  const { p, t } = await fixture();
  await review(t.id, "format", { format: "story" });
  const plan = await create("media_plans", {
    projectId: p.id,
    taskId: t.id,
    mediaType: "scenario",
    status: "draft",
    proposal,
    creativeBasis: creativeBasis(p, (await get(t.id))!),
  });
  await assert.rejects(review(t.id, "reject", { planId: plan.id }), /사유/);
  await review(t.id, "reject", {
    planId: plan.id,
    reason: "서비스를 더 일찍 보여주세요",
  });
  assert.equal((await get(plan.id))!.reason, "서비스를 더 일찍 보여주세요");
  const next = await create("media_plans", {
    projectId: p.id,
    taskId: t.id,
    mediaType: "scenario",
    status: "draft",
    proposal,
    creativeBasis: creativeBasis(p, (await get(t.id))!),
  });
  await update(p.id, { instructions: "새로운 제한" });
  await assert.rejects(
    review(t.id, "approve", { planId: next.id, candidate: 0 }),
    /변경/,
  );
  const other = await fixture();
  await review(other.t.id, "format", { format: "story" });
  await assert.rejects(
    review(other.t.id, "approve", { planId: next.id, candidate: 0 }),
    /해당 작업/,
  );
  await review(t.id, "format", { format: "standard" });
  assert.equal((await get(t.id))!.approvedCreativePlanId, null);
  assert.equal(
    (await list("tasks")).filter((x) => x.projectId === p.id).length,
    1,
  );
});
test("workflow reflects real failed jobs, blocked copy and final approval instead of simulated progress", async () => {
  const { p, t } = await fixture();
  const data = Object.fromEntries(
    kinds.map((k) => [k, []]),
  ) as unknown as DatabaseView;
  data.projects = [p];
  data.tasks = [t];
  data.jobs = [
    { ...t, kind: "jobs", taskId: t.id, type: "video", status: "failed" },
  ];
  data.assets = [
    {
      ...t,
      kind: "assets",
      taskId: t.id,
      category: "copy",
      current: true,
      copyQuality: { status: "blocked" },
    },
  ];
  let flow = taskFlow(data, t);
  assert.equal(flow.find((n) => n.id === "video")!.state, "failed");
  assert.equal(flow.find((n) => n.id === "copy")!.state, "changes");
  data.assets[0].copyQuality = null;
  assert.equal(taskFlow(data, t).find((n) => n.id === "copy")!.state, "review");
  flow = taskFlow(data, { ...t, status: "approved" });
  assert.equal(flow.at(-1)!.state, "succeeded");
});
test("video frame preparation preserves portrait canvas, fills white margins and rejects invalid buffers", async () => {
  const input = await sharp({
    create: { width: 800, height: 400, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const frame = await videoStartFrame(input);
  const meta = await sharp(frame).metadata();
  assert.equal(meta.width, 720);
  assert.equal(meta.height, 1280);
  const { data } = await sharp(frame)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(data[0], 255);
  assert.equal(data[1], 255);
  await assert.rejects(videoStartFrame(Buffer.from("invalid")));
  assert.throws(() =>
    scenarioSchema.parse({ candidates: proposal.candidates.slice(0, 2) }),
  );
});
