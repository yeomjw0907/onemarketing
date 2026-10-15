import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { create, get, list, transaction } from "./db";
import { claimJob, jobResult, releaseLease, renewLease } from "./jobs";
import type { RecordData } from "./types";
import { jobLog, withJobLogs, redactLog } from "./job-logs";
// 작업 실행기. 별도 worker 프로세스와 Vercel 서버리스 함수(after + cron + 연쇄 호출)가 같은 코드를 사용한다.
// 서버리스에서는 함수 제한 시간 안에 끝내지 못하는 작업을 Yield로 돌려보내고, 저장한 요청 ID·체크포인트로 다음 실행에서 이어간다.
export class Yield extends Error {
  constructor(message = "실행 시간이 부족해 다음 실행에서 이어갑니다.") {
    super(message);
  }
}
// 같은 프로세스에서 여러 실행이 겹칠 수 있으므로(Fluid compute) 제한 시간은 실행 컨텍스트별로 보관한다.
const deadlines = new AsyncLocalStorage<number>();
export function remainingMs() {
  return (deadlines.getStore() ?? Infinity) - Date.now();
}
// 공급사 호출 전에 남은 시간을 확인한다. 부족하면 새 비용을 만들지 않고 작업을 다음 실행으로 넘긴다.
export function ensureTime(ms: number) {
  if (remainingMs() < ms) throw new Yield();
}
export async function processJob(job: RecordData, owner: string) {
  return withJobLogs(job, () => processLoggedJob(job, owner));
}
async function processLoggedJob(job: RecordData, owner: string) {
  const { executeProviderJob, ProviderError } = await import("./providers");
  const { slideshow } = await import("./video");
  const heartbeat = setInterval(() => {
    renewLease(owner, job.id).catch(() => {});
  }, 15000);
  try {
    await jobLog("start", `작업 실행 시작 · ${Number(job.attempts)}회차`);
    if (job.type === "slideshow") await slideshow(job);
    else await executeProviderJob(job);
    await transaction(async () => {
      if (
        job.type !== "slideshow" &&
        !(await list("costs")).some((c) => c.jobId === job.id)
      )
        await create("costs", {
          projectId: job.projectId,
          jobId: job.id,
          category: "ai",
          amount: job.estimate,
          description: `${job.type} 제작비 · 청구 확인 필요`,
          confirmed: false,
          usage: (await get(job.id))?.calls,
          currency: "KRW",
          estimate: true,
        });
      await jobResult(job.id, {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        error: null,
      });
    });
    await jobLog(
      "completed",
      job.type === "media-plan"
        ? "브리핑 작성 완료 · 생성 승인 대기 · fal 호출 없음"
        : "결과 저장 완료 · 검수 대기",
    );
    return "succeeded";
  } catch (e) {
    if (e instanceof Yield) {
      await jobLog(
        "checkpoint",
        "실행 시간을 분할합니다. 저장한 요청에서 다음 실행으로 이어갑니다.",
      );
      await jobResult(job.id, { status: "pending", error: null });
      return "yielded";
    }
    const uncertain = e instanceof ProviderError && e.uncertain;
    await jobLog("error", e instanceof Error ? e.message : "작업 실패", {
      level: uncertain ? "warn" : "error",
    });
    await transaction(async () => {
      const latest = (await get(job.id))!;
      if (
        (uncertain || (Array.isArray(latest.calls) && latest.calls.length)) &&
        !(await list("costs")).some((c) => c.jobId === job.id)
      )
        await create("costs", {
          projectId: job.projectId,
          jobId: job.id,
          category: "ai",
          amount: job.estimate,
          description: `${job.type} 중단 · 청구 확인 필요`,
          confirmed: false,
          estimate: true,
        });
      await jobResult(job.id, {
        status: uncertain ? "uncertain" : "failed",
        error: e instanceof Error ? redactLog(e.message) : "작업 실패",
      });
    });
    return uncertain ? "uncertain" : "failed";
  } finally {
    clearInterval(heartbeat);
    await releaseLease(owner, job.id).catch(() => {});
  }
}
// 제한 시간(ms) 안에서 가능한 만큼 작업을 처리한다. 남은 작업이 있으면 more=true.
export async function runJobs(options: { budgetMs?: number; owner?: string }) {
  const owner = options.owner || "serverless-" + randomUUID();
  const deadline = options.budgetMs ? Date.now() + options.budgetMs : Infinity;
  const results: { id: string; type: string; result: string }[] = [];
  return deadlines.run(deadline, async () => {
    while (remainingMs() > 20000) {
      const job = await claimJob(owner);
      if (!job) return { owner, results, more: false };
      const result = await processJob(job, owner);
      results.push({ id: job.id, type: String(job.type), result });
      if (result === "yielded") return { owner, results, more: true };
    }
    return { owner, results, more: true };
  });
}
