import { after } from "next/server";
import { hasRunnableJobs } from "./jobs";
import { runJobs } from "./worker";
// 서버리스 실행 트리거. 응답을 보낸 뒤(after) 남은 함수 시간 안에서 작업을 처리하고,
// 더 남아 있으면 자기 자신(/api/jobs/run)을 다시 호출해 브라우저가 닫혀도 이어서 실행한다.
export const tickBudgetMs = Number(process.env.JOB_TICK_BUDGET_MS || 240000);
export function serverlessJobs() {
  return process.env.JOB_RUNNER !== "worker";
}
export async function runTick(budgetMs = tickBudgetMs) {
  const result = await runJobs({ budgetMs });
  if (result.more) await chain();
  return result;
}
export async function chain() {
  const base = process.env.APP_URL,
    secret = process.env.CRON_SECRET;
  if (!base || !secret) return false;
  try {
    const r = await fetch(new URL("/api/jobs/run", base), {
      method: "POST",
      headers: {
        authorization: "Bearer " + secret,
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? {
              "x-vercel-protection-bypass":
                process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            }
          : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
// 요청 처리 후 실행할 작업이 있으면 백그라운드 실행을 예약한다.
export function scheduleTick(force = false) {
  if (!serverlessJobs()) return;
  after(async () => {
    try {
      if (force || (await hasRunnableJobs())) await runTick();
    } catch (e) {
      console.error("job tick failed", e instanceof Error ? e.message : e);
    }
  });
}
