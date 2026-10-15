import { AsyncLocalStorage } from "node:async_hooks";
import { create, query } from "./db";
import type { RecordData } from "./types";
const scope = new AsyncLocalStorage<RecordData>();
export const withJobLogs = <T>(job: RecordData, fn: () => Promise<T>) =>
  scope.run(job, fn);
export function redactLog(value: unknown) {
  let text = String(value ?? "");
  for (const name of [
    "ANTHROPIC_API_KEY",
    "FAL_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "CRON_SECRET",
  ]) {
    const secret = process.env[name];
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/(?:https?:\/\/)[^\s"'<>]+/g, "[URL]")
    .replace(/\b(?:sk-ant-|fal_sk_|sk-)[\w:.-]+/gi, "[REDACTED]")
    .replace(
      /(authorization|x-api-key|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 1200);
}
export async function jobLog(
  stage: string,
  message: string,
  details: {
    provider?: string;
    model?: string;
    requestId?: string;
    status?: number;
    durationMs?: number;
    level?: "info" | "error" | "warn";
  } = {},
  job = scope.getStore(),
) {
  if (!job) return;
  try {
    await create("job_logs", {
      jobId: job.id,
      projectId: job.projectId,
      taskId: job.taskId || null,
      type: job.type,
      stage: redactLog(stage),
      message: redactLog(message),
      level: details.level || "info",
      provider: redactLog(details.provider),
      model: redactLog(details.model),
      requestId: redactLog(details.requestId),
      status: details.status,
      durationMs: details.durationMs,
    });
  } catch {
    console.warn("Job diagnostic log could not be persisted.");
  }
}
export async function projectJobLogs(projectId: string, jobId?: string) {
  const rows = await query<{ data: RecordData }>(
    "select data from records where kind='job_logs' and data->>'projectId'=$1 and ($2::text is null or data->>'jobId'=$2) order by created_at desc,id desc limit 500",
    [projectId, jobId || null],
  );
  return rows.map((r) => r.data).reverse();
}
