import ffmpegStatic from "ffmpeg-static";
import ExcelJS from "exceljs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import "./helpers";
const { save, command } = await import("../src/lib/domain");
const { list, get, update, create } = await import("../src/lib/db");
const { saveAsset, detectMime, extractSheet, bytes } =
  await import("../src/lib/assets");
const { objectExists, bucketIsPrivate } = await import("../src/lib/storage");
const { enqueue, claimJob, releaseLease } = await import("../src/lib/jobs");
const { approvedBundle, recordDelivery } =
  await import("../src/lib/deliveries");
const { slideshow, hybrid } = await import("../src/lib/video");
const { executeProviderJob } = await import("../src/lib/providers");
const { runJobs } = await import("../src/lib/worker");
const actor = "workflow@local";
const realFetch = globalThis.fetch;
// 공급사 호출만 가로채고 Supabase Storage 요청은 실제로 보낸다.
function mockFetch(handler: typeof fetch) {
  globalThis.fetch = (async (url, init) => {
    if (String(url).startsWith(String(process.env.SUPABASE_URL)))
      return realFetch(url, init);
    return handler(url, init);
  }) as typeof fetch;
}
async function setup(channel = "blog", images = 1) {
  const c = await save("customers", { name: "테스트" }, actor),
    product = await save(
      "products",
      { name: "제품", customerId: c.id, facts: "확인 정보" },
      actor,
    ),
    price = await save(
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
        slot: 0,
        productId: product.id,
        due: "2026-10-30",
        budget: 10000,
      },
      actor,
    );
  return { p, t: (await list("tasks")).find((t) => t.projectId === p.id)! };
}
async function act(
  action: string,
  id: string,
  extra: Record<string, unknown> = {},
) {
  return command(
    action,
    { id, version: (await get(id))!.version, ...extra },
    actor,
    crypto.randomUUID(),
  );
}
async function production(p: string, t: string) {
  await act("project-notes", p, {
    materialNotes: "기준 자료 확인",
    instructions: "",
    budget: 10000,
  });
  await act("project-stage", p, { status: "planning" });
  await act("task-edit", t, {
    brief: "차분한 제품 소개",
    assignee: "게시자",
    payout: 5000,
  });
  await act("project-stage", p, { status: "brief_review" });
  await act("project-stage", p, { status: "producing" });
}
const scratch = mkdtempSync(path.join(tmpdir(), "om-workflow-"));
const imageFile = path.join(scratch, "reference.png");
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
test("비공개 버킷에 저장되고 업로드 실패 시 DB에 기록하지 않음", async () => {
  assert.equal(await bucketIsPrivate(), true);
  const { p, t } = await setup();
  await production(p.id, t.id);
  const a = await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "제품.png",
      buffer: png,
    },
    actor,
  );
  assert.equal(await objectExists(String(a.storageName)), true);
  assert.ok((await bytes(a)).equals(png));
  // 업로드 실패를 흉내 낸다: 존재하지 않는 버킷으로 올리면 Storage가 거부하고 DB에는 기록하지 않는다.
  const before = (await list("assets")).length;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  process.env.SUPABASE_STORAGE_BUCKET = "missing-bucket-" + crypto.randomUUID();
  try {
    await assert.rejects(
      saveAsset(
        {
          projectId: p.id,
          taskId: t.id,
          category: "copy",
          name: "원고.md",
          buffer: Buffer.from("x"),
          text: "x",
        },
        actor,
      ),
      /업로드/,
    );
  } finally {
    process.env.SUPABASE_STORAGE_BUCKET = bucket;
  }
  assert.equal((await list("assets")).length, before);
});
test("승인본 ZIP 구성, 변경 후 승인 무효화, 전달·게시·정산 경로", async () => {
  const { p, t } = await setup();
  await production(p.id, t.id);
  await saveAsset(
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
  await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "제품.png",
      buffer: png,
    },
    actor,
  );
  await assert.rejects(approvedBundle(p.id), /승인본/);
  await act("approve-task", t.id);
  const bundle = await approvedBundle(p.id);
  assert.ok(bundle.entries.some((e) => e.path === "manifest.json"));
  assert.ok(bundle.entries.some((e) => e.buffer.equals(png)));
  assert.ok(!bundle.entries.some((e) => e.buffer.includes(Buffer.from(actor))));
  await saveAsset(
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
  assert.equal((await get(t.id))!.status, "review");
  await assert.rejects(approvedBundle(p.id), /승인본/);
  await act("approve-task", t.id);
  await act("project-stage", p.id, { status: "review" });
  await act("project-stage", p.id, { status: "ready" });
  await recordDelivery(
    { projectId: p.id, taskIds: [t.id], channel: "수동 전달" },
    actor,
  );
  assert.equal((await get(t.id))!.status, "delivered");
  await act("publication", t.id, {
    link: "https://blog.naver.com/test/123",
    verified: false,
  });
  await assert.rejects(
    act("project-stage", p.id, { status: "completed" }),
    /게시물/,
  );
  await act("publication", t.id, {
    link: "https://blog.naver.com/test/123",
    verified: true,
  });
  await act("project-stage", p.id, { status: "completed" });
  await act("settle", p.id);
  assert.equal((await get(p.id))!.settled, true);
  await assert.rejects(
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
  const { p, t } = await setup();
  await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "제품.png",
      buffer: png,
    },
    actor,
  );
  const second = await create("tasks", { projectId: p.id, channel: "blog" });
  await assert.rejects(
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
  const { p, t } = await setup();
  process.env.ANTHROPIC_API_KEY = "test-not-real";
  await assert.rejects(
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
  await production(p.id, t.id);
  const key = crypto.randomUUID();
  const job = await enqueue(
    { projectId: p.id, taskId: t.id, type: "copy", estimate: 1000, key },
    actor,
  );
  assert.equal(
    (
      await enqueue(
        { projectId: p.id, taskId: t.id, type: "copy", estimate: 1000, key },
        actor,
      )
    ).id,
    job.id,
  );
  await assert.rejects(
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
  await assert.rejects(
    enqueue(
      {
        projectId: p.id,
        taskId: t.id,
        type: "image",
        estimate: 20000,
        key: crypto.randomUUID(),
      },
      actor,
    ),
    /FAL_KEY|상한|기준 사진/,
  );
  const claimed = await claimJob("test-worker");
  assert.equal(claimed!.id, job.id);
  assert.equal(await claimJob("other-worker"), null);
  const original = globalThis.fetch;
  mockFetch(
    async () =>
      new Response(
        JSON.stringify({
          id: "mock-message",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "검증된 제품 소개 원고" }],
          usage: { input_tokens: 100, output_tokens: 100 },
        }),
        { status: 200 },
      ),
  );
  try {
    await executeProviderJob(claimed!);
  } finally {
    globalThis.fetch = original;
    await releaseLease("test-worker", job.id);
  }
  assert.ok(
    (await list("assets")).some(
      (a) => a.jobId === job.id && a.category === "copy",
    ),
  );
  assert.ok(Array.isArray((await get(job.id))!.calls));
  await update(job.id, { status: "succeeded" });
});
test("실제 ffmpeg 슬라이드·혼합형 편집 및 영상 승인", async () => {
  const { p, t } = await setup("clip");
  await production(p.id, t.id);
  await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "image",
      name: "장면.png",
      buffer: png,
    },
    actor,
  );
  const job = await enqueue(
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
    (await list("assets")).some(
      (a) => a.jobId === job.id && a.mime === "video/mp4",
    ),
  );
  const scene = (await list("assets")).find(
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
    await bytes(scene),
    2,
  );
  assert.ok(
    (await list("assets")).some(
      (a) =>
        a.jobId === job.id &&
        a.current === true &&
        a.name === "혼합형-클립.mp4",
    ),
  );
  await act("approve-task", t.id);
  assert.equal((await get(t.id))!.status, "approved");
  await update(job.id, { status: "succeeded" });
});
test("fal 이미지 결과 수집 실패 후 기존 요청 재조회로 복구 (새 생성 없음)", async () => {
  const { p, t } = await setup();
  await production(p.id, t.id);
  await saveAsset(
    { projectId: p.id, category: "source", name: "기준.png", buffer: png },
    actor,
  );
  process.env.FAL_KEY = "test-not-real";
  const job = await enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "image",
      estimate: 1000,
      key: crypto.randomUUID(),
    },
    actor,
  );
  const original = globalThis.fetch;
  let submitted = 0;
  let failDownload = true;
  mockFetch(async (url, init) => {
    const target = String(url);
    if (init?.method === "POST") {
      submitted++;
      assert.ok(target.startsWith("https://queue.fal.run/openai/"));
      const input = JSON.parse(String(init.body));
      assert.equal(input.num_images, 1);
      assert.ok(input.image_urls[0].startsWith("data:image/png;base64,"));
      return Response.json({
        request_id: "fal-test",
        status_url: "https://queue.fal.run/test/status",
        response_url: "https://queue.fal.run/test/result",
      });
    }
    if (target.endsWith("/status"))
      return Response.json({ status: "COMPLETED" });
    if (target.endsWith("/result"))
      return Response.json({
        images: [{ url: "https://v3b.fal.media/test.png" }],
      });
    if (failDownload) throw new Error("download interrupted");
    return new Response(new Uint8Array(png));
  });
  try {
    // 전체 실행기 경로: 수집 실패 → uncertain + 비용 확인 필요 기록, 요청 ID 보존.
    const first = await runJobs({ owner: "test-runner" });
    assert.equal(first.results[0]?.result, "uncertain");
    const after = (await get(job.id))!;
    assert.equal(after.status, "uncertain");
    assert.equal(after.providerRequestId, "fal-test");
    assert.match(String(after.error), /수집/);
    assert.ok((await list("costs")).some((c) => c.jobId === job.id));
    // 재개: 새 요청 없이 같은 요청 ID로 결과를 다시 수집한다.
    failDownload = false;
    await act("resume-job", job.id);
    const second = await runJobs({ owner: "test-runner" });
    assert.equal(second.results[0]?.result, "succeeded");
    assert.equal(submitted, 1);
    assert.equal(
      (await list("assets")).filter((a) => a.jobId === job.id).length,
      1,
    );
    assert.equal(
      (await list("costs")).filter((c) => c.jobId === job.id).length,
      1,
    );
    const calls = (await get(job.id))!.calls as { provider: string }[];
    assert.equal(calls[0].provider, "fal");
  } finally {
    globalThis.fetch = original;
  }
});
test("서버리스 실행 제한 시간: fal 진행 중이면 요청 ID를 보존한 채 다음 실행으로 넘김", async () => {
  const { p, t } = await setup();
  await production(p.id, t.id);
  await saveAsset(
    { projectId: p.id, category: "source", name: "기준.png", buffer: png },
    actor,
  );
  const job = await enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "image",
      estimate: 1000,
      key: crypto.randomUUID(),
    },
    actor,
  );
  const original = globalThis.fetch;
  let submitted = 0,
    polls = 0;
  mockFetch(async (url, init) => {
    if (init?.method === "POST") {
      submitted++;
      return Response.json({
        request_id: "fal-slow",
        status_url: "https://queue.fal.run/test/status",
        response_url: "https://queue.fal.run/test/result",
      });
    }
    if (String(url).endsWith("/status")) {
      polls++;
      return Response.json({
        status: polls > 1 ? "COMPLETED" : "IN_PROGRESS",
      });
    }
    if (String(url).endsWith("/result"))
      return Response.json({
        images: [{ url: "https://v3b.fal.media/test.png" }],
      });
    return new Response(new Uint8Array(png));
  });
  // 이미 접수된 요청(request ID 저장)이 진행 중일 때 남은 시간이 30초 미만이면 새 요청 없이 다음 실행으로 넘긴다.
  await update(job.id, {
    providerState: {
      provider: "fal",
      model: "openai/gpt-image-2.5/sunburst/edit",
      request_id: "fal-slow",
      status_url: "https://queue.fal.run/test/status",
      response_url: "https://queue.fal.run/test/result",
      input: {},
    },
    providerRequestId: "fal-slow",
    providerSubmittedAt: new Date().toISOString(),
  });
  try {
    const first = await runJobs({ owner: "tick-1", budgetMs: 25000 });
    assert.equal(first.results[0]?.result, "yielded");
    assert.equal(first.more, true);
    assert.equal((await get(job.id))!.status, "pending");
    assert.equal((await get(job.id))!.providerRequestId, "fal-slow");
    assert.equal(submitted, 0);
    const second = await runJobs({ owner: "tick-2" });
    assert.equal(second.results[0]?.result, "succeeded");
    assert.equal(submitted, 0);
    assert.equal(
      (await list("assets")).filter((a) => a.jobId === job.id).length,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("이전 공급사 영상 요청을 fal로 중복 제출하지 않음", async () => {
  const { p, t } = await setup("clip");
  await production(p.id, t.id);
  await saveAsset(
    { projectId: p.id, category: "source", name: "기준.png", buffer: png },
    actor,
  );
  await update(t.id, { duration: 10, mode: "generated" });
  process.env.FAL_KEY = "test-not-real";
  const job = await enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "video",
      estimate: 1000,
      key: crypto.randomUUID(),
    },
    actor,
  );
  await update(job.id, {
    providerState: { response: { request_id: "legacy-request" } },
  });
  const original = globalThis.fetch;
  mockFetch(async () => {
    throw new Error("must not call provider");
  });
  try {
    await assert.rejects(
      executeProviderJob((await get(job.id))!),
      /이전 공급사/,
    );
  } finally {
    globalThis.fetch = original;
    await update(job.id, { status: "uncertain" });
  }
});
test("fal Seedance는 10초·720p 전체 생성 요청 후 영상을 보관", async () => {
  const videoAsset = (await list("assets")).find(
    (a) => a.category === "video",
  )!;
  const videoBytes = await bytes(videoAsset);
  const { p, t } = await setup("clip");
  await production(p.id, t.id);
  await saveAsset(
    { projectId: p.id, category: "source", name: "기준.png", buffer: png },
    actor,
  );
  await update(t.id, { duration: 10, mode: "generated" });
  const job = await enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "video",
      estimate: 7000,
      key: crypto.randomUUID(),
    },
    actor,
  );
  const original = globalThis.fetch;
  mockFetch(async (url, init) => {
    if (init?.method === "POST") {
      assert.equal(
        String(url),
        "https://queue.fal.run/bytedance/seedance-2.5/image-to-video",
      );
      const input = JSON.parse(String(init.body));
      assert.equal(input.duration, "10");
      assert.equal(input.resolution, "720p");
      assert.equal(input.aspect_ratio, "auto");
      return Response.json({
        request_id: "fal-video",
        status_url: "https://queue.fal.run/test/status",
        response_url: "https://queue.fal.run/test/result",
      });
    }
    if (String(url).endsWith("/status"))
      return Response.json({ status: "COMPLETED" });
    if (String(url).endsWith("/result"))
      return Response.json({
        video: { url: "https://v3b.fal.media/test.mp4" },
      });
    return new Response(new Uint8Array(videoBytes));
  });
  try {
    await executeProviderJob(job);
    assert.ok(
      (await list("assets")).some(
        (a) => a.jobId === job.id && a.category === "video",
      ),
    );
  } finally {
    globalThis.fetch = original;
    await update(job.id, { status: "succeeded" });
  }
});
test("Claude 웹 검색 pause_turn 이어받기·출처·도구 사용량 저장과 기획", async () => {
  const { p, t } = await setup();
  await update(p.id, { status: "planning" });
  process.env.ANTHROPIC_API_KEY = "test-not-real";
  const job = await enqueue(
    {
      projectId: p.id,
      type: "research",
      estimate: 1000,
      key: crypto.randomUUID(),
    },
    actor,
  );
  const original = globalThis.fetch;
  let searches = 0,
    plain = 0;
  mockFetch(async (url, init) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init?.body));
    if (body.tools) {
      searches++;
      assert.equal(body.tools[0].name, "web_search");
      assert.equal(body.tools[0].max_uses, 5);
      if (searches === 1)
        return Response.json({
          id: "search-1",
          stop_reason: "pause_turn",
          usage: { server_tool_use: { web_search_requests: 1 } },
          content: [
            {
              type: "server_tool_use",
              id: "srvtoolu_1",
              name: "web_search",
              input: { query: "제품 시장" },
            },
          ],
        });
      assert.equal(body.messages[1].role, "assistant");
      return Response.json({
        id: "search-2",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          server_tool_use: { web_search_requests: 1 },
        },
        content: [
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: [
              {
                type: "web_search_result",
                url: "https://example.com/product",
                title: "제품 자료",
              },
            ],
          },
          {
            type: "text",
            text: "검색으로 확인한 제품 정보",
            citations: [
              {
                type: "web_search_result_location",
                url: "https://example.com/product",
                title: "제품 자료",
                cited_text: "확인 정보",
              },
            ],
          },
        ],
      });
    }
    plain++;
    return Response.json({
      id: "claude-" + plain,
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 100 },
      content: [
        {
          type: "text",
          text:
            plain === 1
              ? "검증 요점"
              : JSON.stringify({
                  tasks: [{ id: t.id, brief: "출처 기반 기획" }],
                }),
        },
      ],
    });
  });
  try {
    await executeProviderJob(job);
    assert.equal(searches, 2);
    assert.equal(plain, 2);
    assert.equal((await get(p.id))!.status, "brief_review");
    assert.equal((await get(t.id))!.brief, "출처 기반 기획");
    const checkpoints = (await get(job.id))!.checkpoints as {
      sources: { url: string; verified: boolean }[];
      citations: unknown[];
    };
    assert.equal(checkpoints.sources[0].url, "https://example.com/product");
    assert.equal(checkpoints.sources[0].verified, false);
    assert.ok(checkpoints.citations.length);
    assert.equal((await get(job.id))!.searchState, null);
    assert.ok(
      (
        (await get(job.id))!.calls as { usage: { server_tool_use?: unknown } }[]
      ).some((c) => c.usage.server_tool_use),
    );
  } finally {
    globalThis.fetch = original;
    await update(job.id, { status: "succeeded" });
  }
});
test("Claude 검색 도구 오류·출처 누락은 기획으로 넘기지 않음", async () => {
  for (const content of [
    [
      {
        type: "web_search_tool_result",
        content: {
          type: "web_search_tool_result_error",
          error_code: "too_many_requests",
        },
      },
      { type: "text", text: "검색 실패" },
    ],
    [{ type: "text", text: "출처 없는 조사" }],
  ]) {
    const { p } = await setup();
    await update(p.id, { status: "planning" });
    const job = await enqueue(
      {
        projectId: p.id,
        type: "research",
        estimate: 1000,
        key: crypto.randomUUID(),
      },
      actor,
    );
    const original = globalThis.fetch;
    let count = 0;
    mockFetch(async () => {
      count++;
      return Response.json({
        id: "search-error",
        stop_reason: "end_turn",
        content,
        usage: { input_tokens: 100 },
      });
    });
    try {
      await assert.rejects(executeProviderJob(job), /검색/);
      assert.equal(count, 1);
      assert.equal((await get(p.id))!.status, "planning");
    } finally {
      globalThis.fetch = original;
      await update(job.id, { status: "failed" });
    }
  }
});
