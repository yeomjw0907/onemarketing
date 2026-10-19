import { z } from "zod";
import { audit, list, lock, transaction, update } from "./db";
import { requireRecord } from "./domain";
import { creativeBasis, scenarioSchema } from "./creative-schema";
export async function reviewCreative(input: unknown, actor: string) {
  const b = z
    .object({
      taskId: z.string(),
      version: z.number().int().positive(),
      action: z.enum(["format", "approve", "revise", "reject"]),
      format: z.enum(["standard", "story"]).optional(),
      planId: z.string().optional(),
      candidate: z.number().int().min(0).max(2).optional(),
      reason: z.string().trim().max(3000).optional(),
    })
    .parse(input);
  return transaction(async () => {
    let t = await requireRecord(b.taskId, "tasks");
    await lock("project-operations:" + t.projectId);
    t = await requireRecord(b.taskId, "tasks");
    const p = await requireRecord(String(t.projectId), "projects");
    if (t.version !== b.version)
      throw new Error("작업이 변경되었습니다. 새로고침하세요.");
    if (
      t.channel !== "clip" ||
      p.hold ||
      p.settled ||
      !["producing", "review"].includes(String(p.status)) ||
      ["approved", "delivered", "submitted", "verified"].includes(
        String(t.status),
      )
    )
      throw new Error(
        "제작·검수 중인 클립만 변경할 수 있습니다. 승인본은 수정 요청을 먼저 등록하세요.",
      );
    if (
      (await list("jobs")).some(
        (j) =>
          j.taskId === t.id &&
          ["pending", "running", "uncertain"].includes(String(j.status)),
      )
    )
      throw new Error("실행 중인 작업을 먼저 완료·확인하세요.");
    if (b.action === "format") {
      if (!b.format) throw new Error("제작 방식을 선택하세요.");
      if ((t.creativeFormat || "standard") === b.format) return t;
      const row = await update(
        t.id,
        {
          creativeFormat: b.format,
          approvedCreativePlanId: null,
          approvedCreativeCandidate: null,
          approvedAssets: [],
          status: "review",
        },
        b.version,
      );
      await audit(actor, "creative-format", t.id, { format: b.format });
      return row;
    }
    const plan = await requireRecord(b.planId || "", "media_plans");
    if (
      plan.taskId !== t.id ||
      plan.projectId !== p.id ||
      plan.mediaType !== "scenario" ||
      plan.status !== "draft"
    )
      throw new Error("검토 대기 중인 해당 작업의 시나리오를 선택하세요.");
    if (
      t.creativeFormat !== "story" ||
      plan.creativeBasis !== creativeBasis(p, t)
    )
      throw new Error(
        "제품 정보·기획이 변경되었습니다. 새 시나리오를 요청하세요.",
      );
    if (b.action !== "approve" && !b.reason)
      throw new Error("수정·반려 사유를 입력하세요.");
    const selected =
      b.candidate === undefined
        ? undefined
        : scenarioSchema.parse(plan.proposal).candidates[b.candidate];
    if (b.action === "approve" && !selected)
      throw new Error("승인할 후보를 선택하세요.");
    if (
      selected &&
      selected.scenes.reduce((s, x) => s + x.seconds, 0) !== Number(t.duration)
    )
      throw new Error("장면 시간 합계가 계약 영상 길이와 다릅니다.");
    await update(
      plan.id,
      {
        status:
          b.action === "approve"
            ? "approved"
            : b.action === "revise"
              ? "changes"
              : "rejected",
        candidate: b.candidate ?? null,
        reason: b.reason || "",
        reviewedBy: actor,
        reviewedAt: new Date().toISOString(),
      },
      plan.version,
    );
    if (b.action === "approve") {
      for (const other of (await list("media_plans")).filter(
        (x) =>
          x.taskId === t.id &&
          x.mediaType === "scenario" &&
          x.status === "approved" &&
          x.id !== plan.id,
      ))
        await update(other.id, { status: "superseded" });
    }
    const row = await update(
      t.id,
      {
        approvedCreativePlanId:
          b.action === "approve" ? plan.id : t.approvedCreativePlanId || null,
        approvedCreativeCandidate:
          b.action === "approve"
            ? selected
            : t.approvedCreativeCandidate || null,
        approvedAssets: [],
        status: "review",
      },
      b.version,
    );
    await audit(actor, "scenario-" + b.action, t.id, {
      planId: plan.id,
      candidate: b.candidate,
      reason: b.reason || "",
    });
    return row;
  });
}
