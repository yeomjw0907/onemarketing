import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
const { create, view, list } = await import("../src/lib/db");
const { jobLog, withJobLogs, projectJobLogs, redactLog } =
  await import("../src/lib/job-logs");
const { processJob } = await import("../src/lib/worker");
test("공급사 오류 본문은 저장하지 않고 잔액·인증·권한 사유만 안전하게 분류", async () => {
  const { providerFailureReason } = await import("../src/lib/providers");
  assert.match(
    providerFailureReason("fal", 403, {
      detail: "User is locked. Reason: Exhausted balance.",
    }),
    /잔액/,
  );
  assert.match(
    providerFailureReason("anthropic", 401, {
      error: { type: "authentication_error" },
    }),
    /인증/,
  );
  assert.match(
    providerFailureReason("fal", 403, { detail: "permission denied" }),
    /권한/,
  );
  assert.ok(
    !providerFailureReason("fal", 422, {
      detail: "PRIVATE_PROMPT_AND_INPUT",
    }).includes("PRIVATE_PROMPT"),
  );
});
test("지정한 예시 작업만 claim하고 다른 프로젝트의 큐는 변경하지 않음", async () => {
  const { claimJob } = await import("../src/lib/jobs");
  const p = await create("projects", { status: "producing" });
  const t = await create("tasks", {
    projectId: p.id,
    status: "planned",
    brief: "기획",
    briefApprovedAt: "확인",
  });
  const other = await create("jobs", {
    projectId: "missing",
    type: "copy",
    status: "pending",
  });
  const target = await create("jobs", {
    projectId: p.id,
    taskId: t.id,
    type: "copy",
    status: "pending",
    attempts: 0,
    snapshot: { task: t },
  });
  assert.equal((await claimJob("targeted-test", target.id))?.id, target.id);
  const { get } = await import("../src/lib/db");
  assert.equal((await get(other.id))?.status, "pending");
});
test("진단 로그는 동시 작업·프로젝트를 분리하고 비밀·URL을 제거하며 일반 data 응답에서 제외", async () => {
  const p = await create("projects", { name: "로그 검증" }),
    other = await create("projects", { name: "다른 프로젝트" });
  const a = await create("jobs", { projectId: p.id, type: "copy" }),
    b = await create("jobs", { projectId: other.id, type: "image" });
  await Promise.all([
    withJobLogs(a, async () => {
      await jobLog("start", "첫 작업");
      await jobLog(
        "error",
        "api_key=hidden https://example.com/file?token=secret sk-ant-hidden",
        { level: "error" },
      );
    }),
    withJobLogs(b, async () => jobLog("start", "둘째 작업")),
  ]);
  const logs = await projectJobLogs(p.id, a.id);
  assert.equal(logs.length, 2);
  assert.ok(logs.every((l) => l.jobId === a.id));
  assert.ok(!JSON.stringify(logs).includes("example.com"));
  assert.ok(!JSON.stringify(logs).includes("sk-ant-hidden"));
  assert.equal((await view()).job_logs.length, 0);
  assert.equal(
    redactLog(`key ${process.env.ANTHROPIC_API_KEY}`).includes(
      String(process.env.ANTHROPIC_API_KEY),
    ),
    false,
  );
});
test("공급사 실패에도 요청·HTTP 상태·오류 로그가 남고 새 생성 자동 재시도 없이 uncertain으로 보존", async () => {
  const p = await create("projects", {
    name: "실패 검증",
    status: "producing",
    knowledge: { customer: {}, product: {} },
  });
  const t = await create("tasks", {
    projectId: p.id,
    name: "원고",
    channel: "blog",
    brief: "검증",
  });
  const job = await create("jobs", {
    projectId: p.id,
    taskId: t.id,
    type: "copy",
    attempts: 1,
    estimate: 100,
    status: "running",
    actor: "test",
    snapshot: { project: p, task: t, sourceAssets: [] },
  });
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("{}", { status: 503 });
  }) as typeof fetch;
  try {
    assert.equal(await processJob(job, "test-log-owner"), "uncertain");
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 1);
  const logs = await projectJobLogs(p.id, job.id);
  assert.ok(logs.some((l) => l.stage === "api_request"));
  assert.ok(logs.some((l) => l.stage === "api_response" && l.status === 503));
  assert.ok(logs.some((l) => l.stage === "error"));
  assert.equal(
    (await list("costs")).filter((c) => c.jobId === job.id).length,
    1,
  );
});
