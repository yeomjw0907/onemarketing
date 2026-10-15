import { requireActor } from "@/lib/auth";
import { get, query } from "@/lib/db";
import { projectJobLogs, redactLog } from "@/lib/job-logs";
import type { RecordData } from "@/lib/types";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireActor();
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const projectId = z
      .string()
      .uuid()
      .parse(url.searchParams.get("projectId"));
    const jobId = z
      .string()
      .uuid()
      .optional()
      .parse(url.searchParams.get("jobId") || undefined);
    if ((await get(projectId))?.kind !== "projects")
      throw new Error("프로젝트를 찾을 수 없습니다.");
    const jobs = (
      await query<{ data: RecordData }>(
        "select data from records where kind='jobs' and data->>'projectId'=$1 order by created_at desc",
        [projectId],
      )
    ).map(({ data: j }) => ({
      id: j.id,
      type: j.type,
      taskId: j.taskId,
      status: j.status,
      attempts: j.attempts,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      error: redactLog(j.error),
      createdAt: j.createdAt,
    }));
    return Response.json(
      { jobs, logs: await projectJobLogs(projectId, jobId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "실행 로그를 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}
