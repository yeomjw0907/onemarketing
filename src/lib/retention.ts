import { get, update, transaction, lock, audit } from "./db";
import { queueNotification } from "./sens";
import { workflowPolicySchema } from "./workflow-policy";

export async function checkRetention(
  id: string,
  ok: boolean,
  note: string,
  actor: string,
  version: number,
) {
  return transaction(async () => {
    const initial = await get(id);
    if (initial?.kind !== "tasks")
      throw new Error("유지 관리 작업을 선택하세요.");
    await lock("project-operations:" + initial.projectId);
    const t = await get(id);
    if (!t || !t.retentionUntil || t.status !== "verified" || !t.link)
      throw new Error("검수 완료된 게시물을 선택하세요.");
    if (t.version !== version)
      throw new Error("작업이 변경되었습니다. 새로고침 후 다시 확인하세요.");
    const now = new Date().toISOString();
    const pending = ["needs_recovery", "recovery_submitted"].includes(
      String(t.retentionStatus),
    );
    if (!ok && !note.trim())
      throw new Error("삭제·비공개 여부와 복구할 내용을 입력하세요.");
    if (
      !ok &&
      !pending &&
      new Date(String(t.retentionUntil)).getTime() <= Date.now()
    )
      throw new Error(
        "90일 유지 기간이 종료되어 새 복구 요청을 보낼 수 없습니다.",
      );
    const project = await get(String(t.projectId));
    const policy = workflowPolicySchema.parse(project?.workflowPolicy || {});
    const cycle = !ok && !pending ? now : t.retentionRequestedAt;
    const result = await update(id, {
      retentionStatus: ok ? "public" : "needs_recovery",
      retentionCheckedAt: now,
      retentionNote: ok ? String(t.retentionNote || "") : note.trim(),
      ...(!ok && !pending
        ? {
            retentionRequestedAt: now,
            retentionRecoveryDue: new Date(
              Date.now() + policy.revisionDays * 86400000,
            ).toISOString(),
            retentionReportedAt: null,
          }
        : {}),
      ...(ok
        ? {
            retentionResolvedAt: now,
            retentionMonitorAlert: false,
            retentionProbeState: null,
            retentionProbeCount: 0,
            retentionNextProbeAt: new Date(
              Date.now() + 24 * 3600000,
            ).toISOString(),
          }
        : {}),
    });
    if (!ok && t.participantId)
      await queueNotification(
        String(t.participantId),
        "retention",
        id + ":" + cycle,
        { name: String(t.name) },
      );
    await audit(actor, "retention-check", id, {
      ok,
      note: note.trim(),
      link: t.link,
      cycle,
    });
    return result;
  });
}

export async function reportRecovery(id: string, participantId: string) {
  return transaction(async () => {
    const initial = await get(id);
    if (initial?.kind !== "tasks") throw new Error("작업을 확인하세요.");
    await lock("project-operations:" + initial.projectId);
    const t = await get(id);
    if (!t || t.participantId !== participantId)
      throw new Error("본인 작업만 확인할 수 있습니다.");
    if (t.retentionStatus === "recovery_submitted") return t;
    if (t.retentionStatus !== "needs_recovery")
      throw new Error("복구 요청 중인 게시물이 아닙니다.");
    const result = await update(id, {
      retentionStatus: "recovery_submitted",
      retentionReportedAt: new Date().toISOString(),
    });
    await audit("participant:" + participantId, "retention-reported", id, {
      link: t.link,
    });
    return result;
  });
}
