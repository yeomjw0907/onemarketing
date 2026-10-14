import ffmpegStatic from "ffmpeg-static";
import ExcelJS from "exceljs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "om-workflow-"));
const { save, command } = await import("../src/lib/domain");
const { list, get, update, create } = await import("../src/lib/db");
const { saveAsset, detectMime, extractSheet, bytes } =
  await import("../src/lib/assets");
const { enqueue, claimJob, releaseLease } = await import("../src/lib/jobs");
const { approvedBundle, recordDelivery } =
  await import("../src/lib/deliveries");
const { slideshow, hybrid } = await import("../src/lib/video");
const { executeProviderJob } = await import("../src/lib/providers");
const actor = "workflow@local";
function setup(channel = "blog", images = 1) {
  const c = save("customers", { name: "테스트" }, actor),
    product = save(
      "products",
      { name: "제품", customerId: c.id, facts: "확인 정보" },
      actor,
    ),
    price = save(
      "prices",
      {
        name: "제작",
        channel,
        sale: 30000,
        payout: 5000,
        aiEstimate: 2000,
        images,
        duration: 2,
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
        slot: 0,
        productId: product.id,
        due: "2026-10-30",
        budget: 10000,
      },
      actor,
    );
  return { p, t: list("tasks").find((t) => t.projectId === p.id)! };
}
function act(action: string, id: string, extra: Record<string, unknown> = {}) {
  return command(
    action,
    { id, version: get(id)!.version, ...extra },
    actor,
    crypto.randomUUID(),
  );
}
function production(p: string, t: string) {
  act("project-notes", p, {
    materialNotes: "기준 자료 확인",
    instructions: "",
    budget: 10000,
  });
  act("project-stage", p, { status: "planning" });
  act("task-edit", t, {
    brief: "차분한 제품 소개",
    assignee: "게시자",
    payout: 5000,
  });
  act("project-stage", p, { status: "brief_review" });
  act("project-stage", p, { status: "producing" });
}
const imageFile = path.join(process.env.DATA_DIR, "reference.png");
execFileSync(
  ffmpegStatic || "ffmpeg",
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=256x256",
    "-frames:v",
    "1",
    imageFile,
  ],
  { stdio: "ignore", windowsHide: true },
);
const png = readFileSync(imageFile);
test("승인본 ZIP 구성, 변경 후 승인 무효화, 전달·게시·정산 경로", () => {
  const { p, t } = setup();
  production(p.id, t.id);
  saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "원고.md",
      buffer: Buffer.from("제품 소개"),
      text: "제품 소개",
    },
    actor,
  );
  saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "제품.png",
      buffer: png,
    },
    actor,
  );
  assert.throws(() => approvedBundle(p.id), /승인본/);
  act("approve-task", t.id);
  const bundle = approvedBundle(p.id);
  assert.ok(bundle.entries.some((e) => e.path === "manifest.json"));
  assert.ok(!bundle.entries.some((e) => e.buffer.includes(Buffer.from(actor))));
  saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "원고.md",
      buffer: Buffer.from("수정 원고"),
      text: "수정 원고",
    },
    actor,
  );
  assert.equal(get(t.id)!.status, "review");
  assert.throws(() => approvedBundle(p.id), /승인본/);
  act("approve-task", t.id);
  act("project-stage", p.id, { status: "review" });
  act("project-stage", p.id, { status: "ready" });
  recordDelivery(
    { projectId: p.id, taskIds: [t.id], channel: "수동 전달" },
    actor,
  );
  assert.equal(get(t.id)!.status, "delivered");
  act("publication", t.id, {
    link: "https://blog.naver.com/test/123",
    verified: false,
  });
  assert.throws(
    () => act("project-stage", p.id, { status: "completed" }),
    /게시물/,
  );
  act("publication", t.id, {
    link: "https://blog.naver.com/test/123",
    verified: true,
  });
  act("project-stage", p.id, { status: "completed" });
  act("settle", p.id);
  assert.equal(get(p.id)!.settled, true);
  assert.throws(
    () =>
      act("cost", p.id, {
        category: "other",
        amount: 1,
        description: "비용",
        confirmed: true,
      }),
    /마감/,
  );
});
test("업로드 형식·엑셀 읽기, 중복 이미지 차단", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("고객 양식");
  sheet.addRow(["제품명", "검증 제품"]);
  sheet.addRow(["강조점", "편리한 사용"]);
  sheet.getCell("A3").value = { formula: "1+1", result: 2 };
  const extracted = await extractSheet(
    Buffer.from(await workbook.xlsx.writeBuffer()),
    "xlsx",
  );
  assert.ok(extracted?.includes("검증 제품"));
  assert.ok(!extracted?.includes("1+1"));
  assert.throws(() => detectMime(Buffer.from("fake"), "png"), /형식/);
  assert.equal(
    await extractSheet(Buffer.from("제품,특징\n컵,가벼움"), "csv"),
    "제품,특징\n컵,가벼움",
  );
  const { p, t } = setup();
  saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "제품.png",
      buffer: png,
    },
    actor,
  );
  const second = create("tasks", { projectId: p.id, channel: "blog" });
  assert.throws(
    () =>
      saveAsset(
        {
          projectId: p.id,
          taskId: second.id,
          category: "image",
          name: "다른.png",
          buffer: png,
        },
        actor,
      ),
    /중복/,
  );
});
test("영속 큐 예산·승인·중복 실행 방지와 원고 adapter", async () => {
  const { p, t } = setup();
  process.env.ANTHROPIC_API_KEY = "test-not-real";
  assert.throws(
    () =>
      enqueue(
        {
          projectId: p.id,
          taskId: t.id,
          type: "copy",
          estimate: 1000,
          key: crypto.randomUUID(),
        },
        actor,
      ),
    /기획 승인/,
  );
  production(p.id, t.id);
  const key = crypto.randomUUID();
  const job = enqueue(
    { projectId: p.id, taskId: t.id, type: "copy", estimate: 1000, key },
    actor,
  );
  assert.equal(
    enqueue(
      { projectId: p.id, taskId: t.id, type: "copy", estimate: 1000, key },
      actor,
    ).id,
    job.id,
  );
  assert.throws(
    () =>
      enqueue(
        {
          projectId: p.id,
          taskId: t.id,
          type: "copy",
          estimate: 1000,
          key: crypto.randomUUID(),
        },
        actor,
      ),
    /이미 실행/,
  );
  const claimed = claimJob("test-worker");
  assert.equal(claimed!.id, job.id);
  assert.equal(claimJob("other-worker"), null);
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "mock-message",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "검증된 제품 소개 원고" }],
        usage: { input_tokens: 100, output_tokens: 100 },
      }),
      { status: 200 },
    );
  try {
    await executeProviderJob(claimed!);
  } finally {
    globalThis.fetch = original;
    releaseLease("test-worker");
  }
  assert.ok(
    list("assets").some((a) => a.jobId === job.id && a.category === "copy"),
  );
  assert.ok(Array.isArray(get(job.id)!.calls));
  update(job.id, { status: "succeeded" });
});
test("실제 ffmpeg 슬라이드·혼합형 편집 및 영상 승인", async () => {
  const { p, t } = setup("clip");
  production(p.id, t.id);
  saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "장면.png",
      buffer: png,
    },
    actor,
  );
  const job = enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "slideshow",
      estimate: 1,
      key: crypto.randomUUID(),
    },
    actor,
  );
  await slideshow(job);
  assert.ok(
    list("assets").some((a) => a.jobId === job.id && a.mime === "video/mp4"),
  );
  const scene = list("assets").find(
    (a) => a.jobId === job.id && a.mime === "video/mp4",
  )!;
  const snapshot = job.snapshot as { task: Record<string, unknown> };
  await hybrid(
    {
      ...job,
      snapshot: {
        ...snapshot,
        task: { ...snapshot.task, duration: 8, mode: "hybrid" },
      },
    },
    bytes(scene),
    2,
  );
  assert.ok(
    list("assets").some(
      (a) =>
        a.jobId === job.id &&
        a.current === true &&
        a.name === "혼합형-클립.mp4",
    ),
  );
  act("approve-task", t.id);
  assert.equal(get(t.id)!.status, "approved");
});
