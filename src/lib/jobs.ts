import { briefingPrompt } from "./media-guidance";
import { mediaBriefSchema } from "./media-plans";
import { mediaBinding, validateMediaPlan } from "./media-plans";
import { z } from "zod";
import { jobLog } from "./job-logs";
import {
  create,
  get,
  list,
  update,
  transaction,
  lock,
  query,
  execute,
  audit,
  once,
} from "./db";
import { requireRecord } from "./domain";
import type { RecordData } from "./types";
export const jobSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().optional(),
  replaceAssetId: z.string().optional(),
  type: z.enum([
    "research",
    "copy",
    "image",
    "video",
    "slideshow",
    "media-plan",
  ]),
  mediaType: z.enum(["image", "video"]).optional(),
  mediaPlanId: z.string().optional(),
  generationRequest: z.string().trim().max(5000).optional(),
  estimate: z.number().int().min(1).max(1000000),
  key: z.string().uuid(),
});
export const activeStatuses = ["pending", "running", "uncertain"];
export function enqueue(input: unknown, actor: string) {
  const body = jobSchema.parse(input);
  return once(actor + ":job:" + body.key, async () => {
    await lock("project-operations:" + body.projectId);
    await lock("jobs:" + body.projectId);
    await lock("assets:" + body.projectId);
    const p = await requireRecord(body.projectId, "projects");
    if (
      p.settled ||
      p.hold ||
      ["completed", "cancelled"].includes(String(p.status))
    )
      throw new Error("마감·보류한 프로젝트입니다.");
    const assets = await list("assets");
    if (body.type === "research") {
      if (!["planning", "brief_review"].includes(String(p.status)))
        throw new Error("기획 단계에서 조사할 수 있습니다.");
      for (const key of ["ANTHROPIC_API_KEY"])
        if (!process.env[key]) throw new Error(`${key} 설정이 필요합니다.`);
    } else {
      if (!["producing", "review"].includes(String(p.status)))
        throw new Error("기획 승인 후 제작할 수 있습니다.");
      if (!body.taskId) throw new Error("게시 작업을 선택하세요.");
      const t = await requireRecord(body.taskId, "tasks");
      if (t.projectId !== p.id) throw new Error("프로젝트가 다릅니다.");
      if (
        (body.type === "video" ||
          (body.type === "media-plan" && body.mediaType === "video")) &&
        t.channel !== "clip"
      )
        throw new Error("영상 작업을 선택하세요.");
      if (!t.briefApprovedAt) throw new Error("기획 승인이 필요합니다.");
      if (
        ["approved", "delivered", "submitted", "verified"].includes(
          String(t.status),
        )
      )
        throw new Error("승인본이 있습니다. 수정 요청을 먼저 등록하세요.");
      if (
        body.type === "video" &&
        t.mode === "hybrid" &&
        assets.filter(
          (a) =>
            a.taskId === t.id && a.category === "image" && a.current === true,
        ).length < Number(t.images || 1)
      )
        throw new Error("혼합형에 사용할 이미지를 먼저 등록하세요.");
      const needed = ["copy", "media-plan"].includes(body.type)
        ? "ANTHROPIC_API_KEY"
        : body.type === "image"
          ? "FAL_KEY"
          : body.type === "video"
            ? "FAL_KEY"
            : null;
      if (needed && !process.env[needed])
        throw new Error(`${needed} 설정이 필요합니다.`);
      if (
        ["image", "video", "media-plan"].includes(body.type) &&
        !assets.some(
          (a) =>
            a.projectId === p.id &&
            a.category === "source" &&
            String(a.mime).startsWith("image/"),
        )
      )
        throw new Error("제품 기준 사진을 먼저 등록하세요.");
    }
    const jobs = await list("jobs");
    if (
      jobs.some(
        (j) =>
          j.projectId === p.id &&
          j.taskId === (body.taskId || null) &&
          (j.type === body.type ||
            (["image", "video", "media-plan"].includes(body.type) &&
              ["image", "video", "media-plan"].includes(String(j.type)))) &&
          activeStatuses.includes(String(j.status)),
      )
    )
      throw new Error("이미 실행 중이거나 확인이 필요한 같은 작업이 있습니다.");
    const reserved = jobs
      .filter(
        (j) =>
          j.projectId === p.id && activeStatuses.includes(String(j.status)),
      )
      .reduce((s, j) => s + Number(j.estimate), 0);
    const spent = (await list("costs"))
      .filter((c) => c.projectId === p.id && c.category === "ai")
      .reduce((s, c) => s + Number(c.amount), 0);
    if (spent + reserved + body.estimate > Number(p.budget))
      throw new Error("AI 제작비 상한을 초과합니다. 예산을 확인하세요.");
    if (body.replaceAssetId) {
      const a = await requireRecord(body.replaceAssetId, "assets");
      if (
        !["image", "media-plan"].includes(body.type) ||
        a.taskId !== body.taskId ||
        a.current !== true ||
        a.common === true
      )
        throw new Error("교체할 이미지를 확인하세요.");
    }
    let mediaPlan: RecordData | null = null;
    let mediaBindingSnapshot: Awaited<ReturnType<typeof mediaBinding>> | null =
      null;
    if (body.type === "media-plan") {
      if (!body.mediaType) throw new Error("브리핑할 생성 종류를 선택하세요.");
      mediaBindingSnapshot = await mediaBinding(
        p.id,
        body.taskId!,
        body.mediaType,
        body.replaceAssetId,
      );
    }
    if (["image", "video"].includes(body.type)) {
      if (!body.mediaPlanId)
        throw new Error("생성 브리핑을 검수·승인한 뒤 생성하세요.");
      mediaPlan = await requireRecord(body.mediaPlanId, "media_plans");
      if (
        mediaPlan.status !== "approved" ||
        !mediaPlan.approvedAt ||
        mediaPlan.consumedJobId
      )
        throw new Error("미승인 또는 이미 사용한 브리핑입니다.");
      if (
        mediaPlan.approvedPrompt !==
        briefingPrompt(
          mediaBriefSchema.parse(mediaPlan.brief),
          String(mediaPlan.guidance || ""),
        )
      )
        throw new Error(
          "브리핑 내용과 승인 프롬프트가 다릅니다. 다시 승인하세요.",
        );
      await validateMediaPlan(
        mediaPlan,
        p.id,
        body.taskId!,
        body.type as "image" | "video",
        body.replaceAssetId,
      );
    }
    const snapshot = {
      mediaPlan,
      mediaBinding: mediaBindingSnapshot,
      project: p,
      task: body.taskId ? await requireRecord(body.taskId) : null,
      sourceAssets: assets
        .filter((a) => a.projectId === p.id && a.category === "source")
        .map((a) => a.id),
    };
    const row = await create("jobs", {
      ...body,
      key: undefined,
      taskId: body.taskId || null,
      status: "pending",
      attempts: 0,
      actor,
      snapshot,
      reservation: body.estimate,
      providerState: {},
      error: null,
    });
    if (mediaPlan)
      await update(
        mediaPlan.id,
        { consumedJobId: row.id, status: "used" },
        mediaPlan.version,
      );
    await audit(actor, "job-enqueued", p.id, {
      jobId: row.id,
      type: body.type,
    });
    await jobLog("queued", "실행 대기열에 등록했습니다.", {}, row);
    return row;
  });
}
const leaseMs = 60000;
const leaseKey = (jobId: string) => "job:" + jobId;
// 작업이 중단된 뒤 새 요청 없이 이어서 처리할 수 있는지. 공급사 요청 ID나 저장한 체크포인트가 있으면 재개한다.
export function resumable(job: RecordData) {
  const state = job.providerState as Record<string, unknown> | undefined;
  return Boolean(
    state?.request_id ||
    job.searchState ||
    typeof job.outputText === "string" ||
    Object.keys((job.checkpoints as object) || {}).length,
  );
}
// 실행할 작업이 남아 있는지 빠르게 판단한다(실행 트리거 용도).
export async function hasRunnableJobs() {
  const jobs = await list("jobs");
  if (jobs.some((j) => j.status === "pending")) return true;
  const running = jobs.filter((j) => j.status === "running");
  if (!running.length) return false;
  const leases = await query<{ key: string; expires: string | number }>(
    "select key, expires from leases where expires > $1",
    [Date.now()],
  );
  const held = new Set(leases.map((l) => l.key));
  return running.some((j) => !held.has(leaseKey(j.id)));
}
// 작업별 lease. 서버리스 실행과 별도 worker가 함께 돌아도 같은 작업을 동시에 처리하지 않는다.
// lease가 만료된 running 작업은 재개 가능하면 이어서 처리하고, 아니면 공급사 실행·비용 확인이 필요한 uncertain으로 남긴다.
export function claimJob(owner: string, jobId?: string) {
  return transaction(async () => {
    await lock("jobs:claim");
    const now = Date.now();
    const jobs = (await list("jobs")).filter((j) => !jobId || j.id === jobId);
    const leases = new Map(
      (
        await query<{ key: string; owner: string; expires: string | number }>(
          "select key, owner, expires from leases where key like 'job:%'",
        )
      ).map((l) => [l.key, { owner: l.owner, expires: Number(l.expires) }]),
    );
    const candidates: RecordData[] = [];
    for (const running of jobs.filter((j) => j.status === "running")) {
      const lease = leases.get(leaseKey(running.id));
      if (lease && lease.expires > now && lease.owner !== owner) continue;
      if (resumable(running)) {
        candidates.push(running);
        continue;
      }
      await update(running.id, {
        status: "uncertain",
        error:
          "작업 서버가 중단되었습니다. 공급사 실행·비용을 확인한 뒤 재개하세요.",
      });
    }
    for (const pending of jobs.filter((j) => j.status === "pending")) {
      const p = await get(String(pending.projectId)),
        t = pending.taskId ? await get(String(pending.taskId)) : null;
      const snapshot = pending.snapshot as { task: RecordData | null };
      const valid =
        p &&
        !p.settled &&
        !p.hold &&
        (pending.type === "research"
          ? ["planning", "brief_review"].includes(String(p.status))
          : ["producing", "review"].includes(String(p.status)) &&
            t &&
            ![
              "approved",
              "delivered",
              "submitted",
              "verified",
              "cancelled",
            ].includes(String(t.status)) &&
            t.brief === snapshot.task?.brief &&
            t.briefApprovedAt === snapshot.task?.briefApprovedAt);
      if (!valid) {
        await update(pending.id, {
          status: "cancelled",
          error: "실행 전 작업 상태나 기획이 변경되어 취소했습니다.",
        });
        continue;
      }
      candidates.push(pending);
    }
    const job = candidates.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    if (!job) return null;
    await execute(
      "insert into leases (key, owner, expires) values ($1,$2,$3) on conflict (key) do update set owner=excluded.owner, expires=excluded.expires",
      [leaseKey(job.id), owner, now + leaseMs],
    );
    return update(job.id, {
      status: "running",
      owner,
      startedAt: new Date().toISOString(),
      attempts: Number(job.attempts) + 1,
    });
  });
}
export async function renewLease(owner: string, jobId: string) {
  await execute("update leases set expires=$1 where key=$2 and owner=$3", [
    Date.now() + leaseMs,
    leaseKey(jobId),
    owner,
  ]);
}
export async function releaseLease(owner: string, jobId: string) {
  await execute("delete from leases where key=$1 and owner=$2", [
    leaseKey(jobId),
    owner,
  ]);
}
export async function recordCall(
  jobId: string,
  provider: string,
  model: string,
  requestId: unknown,
  usage: unknown,
) {
  const j = await requireRecord(jobId, "jobs");
  const calls = [
    ...(Array.isArray(j.calls) ? j.calls : []),
    { provider, model, requestId, usage, at: new Date().toISOString() },
  ];
  await jobLog(
    "call_recorded",
    "공급사 호출 내역 저장",
    {
      provider,
      model,
      requestId: typeof requestId === "string" ? requestId : undefined,
    },
    j,
  );
  return update(jobId, { calls });
}
export function jobResult(jobId: string, patch: Record<string, unknown>) {
  return update(jobId, patch);
}
export function jobInput(job: RecordData) {
  const s = job.snapshot as {
    mediaPlan?: RecordData | null;
    mediaBinding?: Awaited<ReturnType<typeof mediaBinding>> | null;
    project: RecordData;
    task: RecordData | null;
    sourceAssets: string[];
  };
  const knowledge = s.project.knowledge as {
    customer: RecordData;
    product: RecordData;
  };
  return { ...s, knowledge };
}
