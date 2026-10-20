import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { get, list, query, execute, transaction, lock, view } from "./db";
import {
  recommendParticipants,
  type RecommendationOrder,
} from "./participant-recommendations";
import { command, requireRecord, requireActiveCatalog } from "./domain";
import { prepareQuote, confirmQuote } from "./quote-workflow";
import { enqueue, jobSchema, activeStatuses } from "./jobs";
import { reviewCreative } from "./creative-plans";
import { editMediaPlan, mediaBriefSchema } from "./media-plans";
import { productProfileSchema } from "./product-understanding-schema";
import { proposeWork, releaseMaterials, requestRevision } from "./work-offers";
import { ownedAssistantFiles } from "./assistant-files";
import { getObject, removeObjects } from "./storage";
import { saveAsset, imageFingerprint } from "./assets";
import { saveCustomerFile } from "./customer-files";
import type { RecordData } from "./types";

const id = z.string().uuid(),
  text = z.string().trim().max(10000);
const jobInput = jobSchema
  .omit({ projectId: true, estimate: true, key: true })
  .strict();
export const assistantWorkflowSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("link_files"),
      targetKind: z.enum(["customer", "project"]),
      targetId: id,
      attachmentIds: z.array(id).min(1).max(6),
    })
    .strict(),
  z.object({ operation: z.literal("confirm_campaign"), draftId: id }).strict(),
  z
    .object({
      operation: z.literal("project_notes"),
      projectId: id,
      materialNotes: text.optional(),
      instructions: text.optional(),
      preferredKeywords: z.string().max(1000).optional(),
      productLinks: z.array(z.string().url()).max(5).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("project_stage"),
      projectId: id,
      stage: z.enum([
        "planning",
        "brief_review",
        "producing",
        "review",
        "ready",
        "publishing",
        "completed",
      ]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("confirm_product"),
      projectId: id,
      profile: productProfileSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("confirm_keywords"),
      projectId: id,
      main: z.array(z.string().max(100)).min(1).max(5),
      secondary: z.array(z.string().max(100)).max(10),
      reason: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("task_briefs"),
      projectId: id,
      items: z
        .array(
          z
            .object({ taskId: id, brief: z.string().trim().min(1).max(10000) })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      operation: z.literal("run_jobs"),
      projectId: id,
      jobs: z.array(jobInput).min(1).max(100),
    })
    .strict(),
  z
    .object({
      operation: z.literal("scenario_review"),
      taskId: id,
      planId: id.optional(),
      decision: z.enum(["format", "approve", "revise", "reject"]),
      format: z.enum(["standard", "story"]).optional(),
      candidate: z.number().int().min(0).max(2).optional(),
      reason: z.string().max(3000).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("media_review"),
      planId: id,
      decision: z.enum(["approve", "edit"]),
      brief: mediaBriefSchema.optional(),
    })
    .strict(),
  z.object({ operation: z.literal("approve_content"), taskId: id }).strict(),
  z
    .object({
      operation: z.literal("propose_participant"),
      slotId: id,
      participantId: id,
      blogAccountId: id.optional(),
      clipAccountId: id.optional(),
    })
    .strict(),
  z.object({ operation: z.literal("release_materials"), slotId: id }).strict(),
  z
    .object({
      operation: z.literal("request_revision"),
      taskId: id,
      note: z.string().trim().min(1).max(3000),
      major: z.boolean(),
    })
    .strict(),
]);
type Args = z.infer<typeof assistantWorkflowSchema>;
export const workflowNames: Record<Args["operation"], string> = {
  link_files: "첨부자료 등록",
  confirm_campaign: "견적·계약 확정",
  project_notes: "프로젝트 자료·지침 정리",
  project_stage: "프로젝트 단계 변경",
  confirm_product: "제품 정보 확정",
  confirm_keywords: "키워드 분석 확정",
  task_briefs: "작업별 기획안 저장",
  run_jobs: "제작 작업 실행",
  scenario_review: "시나리오 검토",
  media_review: "생성 브리핑 검토",
  approve_content: "결과물 승인",
  propose_participant: "참여자에게 제안",
  release_materials: "참여자 자료 전달",
  request_revision: "참여자 수정 요청",
};
function estimate(type: string, correction = false) {
  const env: Record<string, string> = {
    research: "ESTIMATE_RESEARCH_KRW",
    "product-review": "ESTIMATE_PRODUCT_REVIEW_KRW",
    copy: "ESTIMATE_COPY_KRW",
    image: "ESTIMATE_IMAGE_KRW",
    video: "ESTIMATE_VIDEO_KRW",
    "media-plan": "ESTIMATE_MEDIA_PLAN_KRW",
    scenario: "ESTIMATE_SCENARIO_KRW",
  };
  const defaults: Record<string, number> = {
    research: 3000,
    "product-review": 1000,
    copy: 500,
    image: 2000,
    video: 15000,
    "media-plan": 1000,
    scenario: 1000,
    slideshow: 1,
  };
  const n = Number(process.env[env[type]] || defaults[type]);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error("작업별 제작비 설정을 확인해주세요.");
  return n * (type === "copy" ? (correction ? 4 : 5) : 1);
}
function jobKey(value: string) {
  const h = createHash("sha256").update(value).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function target(a: Args) {
  if (a.operation === "confirm_campaign")
    return requireRecord(a.draftId, "quote_drafts");
  if (a.operation === "link_files")
    return a.targetKind === "customer"
      ? requireActiveCatalog(a.targetId, "customers")
      : requireRecord(a.targetId, "projects");
  if ("projectId" in a) return requireRecord(a.projectId, "projects");
  const r = await requireRecord(
    "taskId" in a ? a.taskId : "planId" in a ? a.planId : a.slotId,
    "taskId" in a ? "tasks" : "planId" in a ? "media_plans" : "work_slots",
  );
  return requireRecord(String(r.projectId), "projects");
}
async function perform(a: Args, owner: string, key: string) {
  const p = await target(a);
  if (a.operation === "confirm_campaign")
    return confirmQuote(p.id, p.version, owner);
  if (a.operation === "run_jobs") {
    const jobs = [];
    for (const [index, j] of a.jobs.entries())
      jobs.push(
        await enqueue(
          {
            ...j,
            projectId: p.id,
            estimate: estimate(j.type, !!j.copySourceAssetId),
            key: jobKey(key + ":" + index),
          },
          owner,
        ),
      );
    return {
      projectId: p.id,
      jobIds: jobs.map((j) => j.id),
      summary: `${jobs.length}건을 작업 큐에 등록했어요. 실행 결과는 아래에서 확인할 수 있어요.`,
    };
  }
  if (a.operation === "project_notes") {
    let row = p;
    if (a.productLinks)
      row = await command(
        "product-links",
        { id: p.id, version: row.version, links: a.productLinks },
        owner,
        key + ":links",
      );
    await command(
      "project-notes",
      {
        ...row,
        id: p.id,
        version: row.version,
        materialNotes: a.materialNotes ?? row.materialNotes ?? "",
        instructions: a.instructions ?? row.instructions ?? "",
        preferredKeywords: a.preferredKeywords ?? row.preferredKeywords ?? "",
      },
      owner,
      key,
    );
  } else if (a.operation === "project_stage")
    await command(
      "project-stage",
      { id: p.id, version: p.version, status: a.stage },
      owner,
      key,
    );
  else if (a.operation === "confirm_product")
    await command(
      "product-understanding-confirm",
      { id: p.id, version: p.version, profile: a.profile },
      owner,
      key,
    );
  else if (a.operation === "confirm_keywords")
    await command(
      "keyword-analysis-confirm",
      {
        id: p.id,
        version: p.version,
        main: a.main,
        secondary: a.secondary,
        reason: a.reason,
      },
      owner,
      key,
    );
  else if (a.operation === "task_briefs") {
    if (new Set(a.items.map((i) => i.taskId)).size !== a.items.length)
      throw new Error("같은 작업의 기획안이 중복됐어요.");
    for (const i of a.items) {
      const t = await requireRecord(i.taskId, "tasks");
      if (t.projectId !== p.id) throw new Error("프로젝트가 다른 작업이에요.");
      await command(
        "task-edit",
        { ...t, id: t.id, version: t.version, brief: i.brief },
        owner,
        key + ":" + t.id,
      );
    }
  } else if (a.operation === "scenario_review") {
    const t = await requireRecord(a.taskId, "tasks");
    await reviewCreative(
      {
        taskId: t.id,
        version: t.version,
        action: a.decision,
        format: a.format,
        planId: a.planId,
        candidate: a.candidate,
        reason: a.reason,
      },
      owner,
    );
  } else if (a.operation === "media_review") {
    const plan = await requireRecord(a.planId, "media_plans");
    await editMediaPlan(
      {
        id: plan.id,
        version: plan.version,
        action: a.decision,
        brief: a.brief,
      },
      owner,
    );
  } else if (a.operation === "approve_content") {
    const t = await requireRecord(a.taskId, "tasks");
    await command("approve-task", { id: t.id, version: t.version }, owner, key);
  } else if (a.operation === "propose_participant")
    await proposeWork(
      {
        slotId: a.slotId,
        participantId: a.participantId,
        blogAccountId: a.blogAccountId,
        clipAccountId: a.clipAccountId,
      },
      owner,
    );
  else if (a.operation === "release_materials")
    await releaseMaterials(a.slotId, owner);
  else if (a.operation === "request_revision")
    await requestRevision(a.taskId, a.note, a.major, owner);
  return {
    projectId: p.id,
    summary: workflowNames[a.operation] + "을 처리했어요.",
  };
}
// Only DB-only existing handlers run here. Rollback prevents writes, jobs and outbox messages.
class PreviewComplete extends Error {}
async function validateWithoutSaving(a: Args, owner: string) {
  let notifications: RecordData[] = [];
  try {
    await transaction(async () => {
      const before = new Set(
        (await list("notification_outbox")).map((n) => n.id),
      );
      await perform(a, owner, "assistant-preview:" + randomUUID());
      const offer =
        a.operation === "propose_participant"
          ? (await list("work_offers")).find(
              (o) =>
                o.slotId === a.slotId &&
                o.participantId === a.participantId &&
                o.status === "proposed",
            )
          : null;
      notifications = (await list("notification_outbox")).filter(
        (n) =>
          !before.has(n.id) &&
          (a.operation === "propose_participant"
            ? n.type === "recruitment" && n.eventId === offer?.id
            : a.operation === "release_materials"
              ? n.type === "materials" && n.eventId === a.slotId
              : a.operation === "request_revision"
                ? n.type === "revision" &&
                  String(n.eventId).startsWith(a.taskId + ":")
                : false),
      );
      throw new PreviewComplete();
    });
  } catch (e) {
    if (!(e instanceof PreviewComplete)) throw e;
  }
  return notifications;
}
export async function prepareWorkflowProposal(
  input: unknown,
  owner: string,
  threadId: string,
) {
  const a = assistantWorkflowSchema.parse(input);
  let p = await target(a);
  await lock(
    (p.kind === "quote_drafts"
      ? "quote-confirm:"
      : p.kind === "projects"
        ? "project-operations:"
        : "assistant-customer:") + p.id,
  );
  p = await target(a);
  if (
    ["propose_participant", "release_materials", "request_revision"].includes(
      a.operation,
    )
  )
    await lock("save:participants");
  if (
    p.kind === "projects" &&
    (p.hold ||
      p.settled ||
      ["completed", "cancelled"].includes(String(p.status)))
  )
    throw new Error("진행 중인 프로젝트를 선택해주세요.");
  const related = [
    await list("tasks"),
    await list("assets"),
    await list("media_plans"),
    await list("jobs"),
    await list("costs"),
    await list("work_slots"),
  ];
  const rows = related
    .flat()
    .filter((r) => r.projectId === p.id)
    .sort((x, y) => x.id.localeCompare(y.id));
  const lookup = (value: string) => rows.find((r) => r.id === value);
  const details: { label: string; value: string }[] = [];
  const documents: { label: string; url: string }[] = [];
  let cost = 0;
  if (a.operation === "link_files") {
    const files = await ownedAssistantFiles(owner, threadId, a.attachmentIds);
    details.push(
      ...files.map((f) => ({ label: "등록할 자료", value: f.name })),
    );
  } else {
    const notifications = await validateWithoutSaving(a, owner);
    details.push(
      ...notifications.map((n) => ({
        label: "알림 내용 미리보기",
        value: String(n.content || "").replace(
          /^수락 기한\s+.+$/m,
          "수락 기한: 캠페인의 제안 유효 시간 적용",
        ),
      })),
    );
    if (a.operation === "run_jobs")
      for (const j of a.jobs) {
        const n = estimate(j.type, !!j.copySourceAssetId);
        cost += n;
        details.push({
          label: j.type,
          value: `${j.taskId ? String(lookup(j.taskId)?.name || j.taskId) : "프로젝트 전체"} · ${n.toLocaleString("ko-KR")}원`,
        });
      }
    else if (a.operation === "task_briefs")
      details.push(
        ...a.items.map((i) => ({
          label: String(lookup(i.taskId)?.name || "작업 기획"),
          value: i.brief,
        })),
      );
    else if (a.operation === "confirm_product")
      details.push(
        ...Object.entries(a.profile).map(([label, value]) => ({
          label,
          value,
        })),
      );
    else if (a.operation === "confirm_campaign") {
      const q = await prepareQuote(p);
      details.push(
        { label: "게시 수량", value: `블로그 ${q.blog}개 · 클립 ${q.clip}개` },
        { label: "게시 기간", value: `${q.start} ~ ${q.end}` },
        {
          label: "고객 견적 합계",
          value: `${q.total.toLocaleString("ko-KR")}원`,
        },
      );
    } else {
      for (const [label, value] of Object.entries(a))
        if (
          !["operation", "projectId"].includes(label) &&
          value !== undefined
        ) {
          const record =
            typeof value === "string" && /Id$/.test(label)
              ? lookup(value) || (await get(value))
              : null;
          details.push({
            label,
            value: record
              ? String(record.name || record.title || record.kind)
              : typeof value === "object"
                ? JSON.stringify(value, null, 2)
                : String(value),
          });
        }
    }
  }
  if (a.operation === "media_review") {
    const plan = await requireRecord(a.planId, "media_plans");
    details.push({
      label: "검토할 생성 브리핑",
      value: JSON.stringify(a.brief || plan.brief, null, 2),
    });
  }
  if (a.operation === "scenario_review" && a.planId) {
    const plan = await requireRecord(a.planId, "media_plans");
    const proposal = plan.proposal as { candidates?: unknown[] };
    details.push({
      label: "검토할 시나리오",
      value:
        JSON.stringify(
          a.candidate === undefined
            ? proposal
            : proposal.candidates?.[a.candidate],
          null,
          2,
        ) || "",
    });
  }
  if (
    a.operation === "approve_content" ||
    a.operation === "release_materials"
  ) {
    const taskIds =
      a.operation === "approve_content"
        ? [a.taskId]
        : ((await requireRecord(a.slotId, "work_slots")).taskIds as string[]);
    for (const asset of rows.filter(
      (r) =>
        r.kind === "assets" &&
        taskIds.includes(String(r.taskId)) &&
        r.current === true &&
        r.category !== "source",
    )) {
      documents.push({
        label: String(asset.name),
        url: "/api/assets/" + asset.id,
      });
      if (asset.category === "copy")
        details.push({ label: "검토할 원고", value: String(asset.text || "") });
    }
  }
  let participant: RecordData | null = null;
  if (a.operation === "propose_participant") {
    participant = await requireRecord(a.participantId, "participants");
    details.push({ label: "받는 참여자", value: String(participant.name) });
    for (const label of ["blogAccountId", "clipAccountId"] as const) {
      const detail = details.find((d) => d.label === label);
      const account = (
        (participant.accounts || []) as Record<string, unknown>[]
      ).find((x) => x.id === a[label]);
      if (detail && account)
        detail.value = String(account.url || account.channel);
    }
  }
  if (
    a.operation === "release_materials" ||
    a.operation === "request_revision"
  ) {
    const slot = await requireRecord(
      a.operation === "release_materials" ? a.slotId : a.taskId,
      a.operation === "release_materials" ? "work_slots" : "tasks",
    );
    participant = await requireRecord(
      String(slot.participantId),
      "participants",
    );
    details.push({ label: "받는 참여자", value: String(participant.name) });
  }
  const files =
    a.operation === "link_files"
      ? await ownedAssistantFiles(owner, threadId, a.attachmentIds)
      : [];
  const risk =
    a.operation === "confirm_campaign"
      ? "contract"
      : [
            "propose_participant",
            "release_materials",
            "request_revision",
          ].includes(a.operation)
        ? "external"
        : a.operation === "run_jobs"
          ? "paid"
          : "write";
  const stateHash = createHash("sha256")
    .update(
      JSON.stringify({
        p,
        rows,
        product: p.productId ? await get(String(p.productId)) : null,
        customer: p.customerId ? await get(String(p.customerId)) : null,
        participant,
        files: files.map((f) => ({ id: f.id, size: f.size, name: f.name })),
      }),
    )
    .digest("hex");
  const warning =
    risk === "paid"
      ? "기존 제작 서비스의 비용이 발생합니다. 표시 금액은 예상 예약액이며 실제 비용은 다를 수 있어요."
      : risk === "external"
        ? "확인 후 참여자에게 알림이 발송되거나 자료가 공개되며 발송비가 발생할 수 있어요."
        : risk === "contract"
          ? "견적·계약을 확정하고 프로젝트와 게시 작업을 생성해요. 견적서와 프로젝트 설명서를 먼저 검토해주세요."
          : "확인한 내용만 저장하며 다음 단계는 별도로 확인받아요.";
  return {
    tool: "run_workflow" as const,
    args: a,
    labels: {
      title: workflowNames[a.operation],
      targetName: String(p.name),
      projectId: p.kind === "projects" ? p.id : null,
      details,
      estimate: cost,
      ...(a.operation === "run_jobs"
        ? {
            budget: {
              ceiling: Number(p.budget),
              spent: rows
                .filter((r) => r.kind === "costs" && r.category === "ai")
                .reduce((n, r) => n + Number(r.amount), 0),
              reserved: rows
                .filter(
                  (r) =>
                    r.kind === "jobs" &&
                    activeStatuses.includes(String(r.status)),
                )
                .reduce((n, r) => n + Number(r.estimate), 0),
            },
          }
        : {}),
      risk,
      warning,
      stateHash,
      ...(a.operation === "confirm_campaign"
        ? {
            documents: [
              {
                label: "견적서 검토",
                url: `/api/workflow/documents/${p.id}?type=quote`,
              },
              {
                label: "프로젝트 설명서 검토",
                url: `/api/workflow/documents/${p.id}?type=proposal`,
              },
            ],
          }
        : documents.length
          ? { documents }
          : {}),
    },
  };
}
export async function executeWorkflow(
  input: unknown,
  owner: string,
  threadId: string,
  key: string,
) {
  const a = assistantWorkflowSchema.parse(input);
  if (a.operation !== "link_files") return perform(a, owner, key);
  const targetRow = await target(a),
    created: string[] = [],
    assetIds: string[] = [];
  try {
    await lock("assistant-files:" + threadId);
    const files = await ownedAssistantFiles(owner, threadId, a.attachmentIds);
    for (const file of files) {
      if (file.links[targetRow.id]) {
        assetIds.push(file.links[targetRow.id]);
        continue;
      }
      const buffer = await getObject(file.storage_name);
      const asset =
        a.targetKind === "customer"
          ? await saveCustomerFile(
              {
                customerId: targetRow.id,
                name: file.name,
                category: /\.(xlsx|csv)$/i.test(file.name)
                  ? "intake"
                  : "reference",
                buffer,
              },
              owner,
            )
          : await saveAsset(
              {
                projectId: targetRow.id,
                category: "source",
                name: file.name,
                buffer,
                extracted: file.extracted,
                fingerprint: file.mime.startsWith("image/")
                  ? await imageFingerprint(buffer)
                  : undefined,
              },
              owner,
            );
      created.push(String(asset.storageName));
      assetIds.push(asset.id);
      await execute(
        "update assistant_attachments set links=links||$2::jsonb where id=$1",
        [file.id, JSON.stringify({ [targetRow.id]: asset.id })],
      );
    }
    return {
      ...(a.targetKind === "project" ? { projectId: targetRow.id } : {}),
      assetIds,
      summary: `${assetIds.length}개 자료를 ${targetRow.name}에 등록했어요.`,
    };
  } catch (e) {
    await removeObjects(created).catch(() => {});
    throw e;
  }
}
export async function assistantWorkflowContext() {
  const data = await view();
  const projects = data.projects
    .filter((p) => p.status !== "cancelled" && !p.settled)
    .slice(0, 12);
  const ids = new Set(projects.map((p) => p.id));
  const pick = (r: RecordData, fields: string[]) =>
    Object.fromEntries(
      ["id", "version", ...fields].map((k) => [k, r[k] ?? null]),
    );
  const byProject = (rows: RecordData[]) =>
    rows.filter((r) => ids.has(String(r.projectId)));
  return {
    projects: projects.map((p) =>
      pick(p, [
        "name",
        "status",
        "productId",
        "customerId",
        "budget",
        "hold",
        "instructions",
        "materialNotes",
        "preferredKeywords",
        "productLinks",
        "productUnderstanding",
        "recommendedKeywords",
        "confirmedKeywordAnalysis",
      ]),
    ),
    quoteDrafts: data.quote_drafts
      .slice(0, 20)
      .map((r) =>
        pick(r, [
          "name",
          "status",
          "customerId",
          "productId",
          "blog",
          "clip",
          "start",
          "end",
          "total",
        ]),
      ),
    tasks: byProject(data.tasks)
      .slice(0, 150)
      .map((t) =>
        pick(t, [
          "name",
          "projectId",
          "channel",
          "status",
          "brief",
          "briefApprovedAt",
          "creativeFormat",
          "approvedCreativePlanId",
          "images",
          "duration",
          "mode",
          "workSlotId",
        ]),
      ),
    plans: byProject(data.media_plans)
      .filter((p) => ["draft", "approved"].includes(String(p.status)))
      .slice(0, 20)
      .map((p) =>
        pick(p, [
          "projectId",
          "taskId",
          "mediaType",
          "status",
          "proposal",
          "brief",
          "consumedJobId",
        ]),
      ),
    assets: byProject(data.assets)
      .filter((a) => a.current === true)
      .slice(0, 100)
      .map((a) => ({
        ...pick(a, [
          "projectId",
          "taskId",
          "name",
          "category",
          "mime",
          "copyQuality",
        ]),
        text: String(a.text || "").slice(0, 3500),
        url: "/api/assets/" + a.id,
      })),
    jobs: byProject(data.jobs)
      .slice(0, 40)
      .map((j) =>
        pick(j, ["projectId", "taskId", "type", "status", "estimate", "error"]),
      ),
    slots: byProject(data.work_slots)
      .slice(0, 100)
      .map((s) =>
        pick(s, ["projectId", "type", "status", "taskIds", "participantId"]),
      ),
    recommendations: byProject(data.work_slots)
      .filter((s) => !s.participantId && s.status !== "cancelled")
      .slice(0, 10)
      .map((slot) => ({
        slotId: slot.id,
        orders: Object.fromEntries(
          (
            [
              "balanced",
              "quality",
              "speed",
              "tenure",
              "volume",
            ] as RecommendationOrder[]
          ).map((order) => [
            order,
            recommendParticipants(data, slot, order)
              .slice(0, 3)
              .map((r) => ({
                ...r,
                participant: { id: r.participant.id, name: r.participant.name },
              })),
          ]),
        ),
      })),
    participants: data.participants
      .filter((p) => p.status === "active")
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        name: p.name,
        accounts: ((p.accounts || []) as Record<string, unknown>[]).map(
          (a) => ({
            id: a.id,
            channel: a.channel,
            url: a.url,
            approvalStatus: a.approvalStatus,
            ownershipVerifiedAt: a.ownershipVerifiedAt,
          }),
        ),
      })),
    jobEstimates: Object.fromEntries(
      [
        "research",
        "product-review",
        "copy",
        "image",
        "video",
        "media-plan",
        "scenario",
        "slideshow",
      ].map((type) => [type, estimate(type)]),
    ),
    schema: z.toJSONSchema(assistantWorkflowSchema),
  };
}
export async function assistantExecutionStatus(
  result: Record<string, unknown>,
  snapshot?: {
    projects: RecordData[];
    tasks: RecordData[];
    assets: RecordData[];
    jobs: RecordData[];
  },
) {
  const project = result.projectId
    ? snapshot
      ? snapshot.projects.find((p) => p.id === result.projectId)
      : await get(String(result.projectId))
    : null;
  const jobs = snapshot
    ? ((result.jobIds || []) as string[]).map((id) =>
        snapshot.jobs.find((j) => j.id === id),
      )
    : await Promise.all(
        ((result.jobIds || []) as string[]).map((id) => get(id)),
      );
  const tasks = project
    ? (snapshot?.tasks || (await list("tasks"))).filter(
        (t) => t.projectId === project.id && t.status !== "cancelled",
      )
    : [];
  const assets = project
    ? (snapshot?.assets || (await list("assets"))).filter(
        (a) =>
          a.projectId === project.id &&
          a.current === true &&
          a.category !== "source",
      )
    : [];
  return {
    project: project
      ? {
          id: project.id,
          name: project.name,
          status: project.status,
          total: tasks.length,
          approved: tasks.filter((t) =>
            ["approved", "delivered", "submitted", "verified"].includes(
              String(t.status),
            ),
          ).length,
        }
      : null,
    jobs: jobs.filter(Boolean).map((j) => ({
      id: j!.id,
      type: j!.type,
      status: j!.status,
      error: j!.error || null,
    })),
    assets: assets.slice(0, 40).map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      url: "/api/assets/" + a.id,
    })),
  };
}
