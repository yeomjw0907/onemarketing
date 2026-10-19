type Task = {
  status?: unknown;
  payoutStatus?: unknown;
  retentionStatus?: unknown;
  revisionNotes?: unknown;
};
export const publicStageLabels = [
  "준비",
  "제작·검수",
  "게시 대기",
  "링크 접수",
  "게시 확인",
];
export function publicProgress(tasks: Task[]) {
  const active = tasks.filter((t) => t.status !== "cancelled");
  const stages = publicStageLabels.map(() => 0);
  for (const t of active) {
    const stage =
      t.status === "verified"
        ? 4
        : t.status === "submitted"
          ? 3
          : ["approved", "delivered"].includes(String(t.status))
            ? 2
            : ["producing", "review", "changes"].includes(String(t.status))
              ? 1
              : 0;
    stages[stage]++;
  }
  return {
    total: active.length,
    verified: stages[4],
    stages,
    percent: active.length
      ? Math.round((stages[4] / active.length) * 100)
      : null,
  };
}
export function portalTaskMatches(t: Task, filter: string) {
  if (filter === "all") return true;
  if (filter === "recovery")
    return ["needs_recovery", "recovery_submitted"].includes(
      String(t.retentionStatus),
    );
  return t.status === filter;
}
export function participantNext(
  tasks: (Task & { id?: string })[],
  offerCount: number,
) {
  const recovery = tasks.find((t) => t.retentionStatus === "needs_recovery");
  if (recovery)
    return {
      title: "게시물 공개 상태를 복구해주세요",
      description: "복구 요청을 확인하고, 공개로 바꾼 뒤 완료를 알려주세요.",
      tab: "tasks",
      taskId: recovery.id,
    };
  const revision = tasks.find(
    (t) => t.status === "delivered" && t.revisionNotes,
  );
  if (revision)
    return {
      title: "수정할 게시물이 있어요",
      description: "요청 내용과 수정 기한을 먼저 확인해주세요.",
      tab: "tasks",
      taskId: revision.id,
    };
  const delivered = tasks.find((t) => t.status === "delivered");
  if (delivered)
    return {
      title: "자료를 확인하고 게시해주세요",
      description: "자료 저장 → 원고 복사 → 게시 → 링크 제출 순서로 진행해요.",
      tab: "tasks",
      taskId: delivered.id,
    };
  if (offerCount)
    return {
      title: `새 제안 ${offerCount}건이 도착했어요`,
      description: "원고료와 게시 기한을 확인한 뒤 참여를 결정해주세요.",
      tab: "offers",
    };
  if (tasks.some((t) => t.status === "submitted"))
    return {
      title: "제출한 게시물을 확인하고 있어요",
      description:
        "제출 후 3일이 지나면 검수해요. 작업에서 검수 가능일을 확인해주세요.",
      tab: "tasks",
    };
  return {
    title: "내 작업의 진행 상황을 확인하세요",
    description: "새 제안과 게시·정산 내역을 이곳에서 확인할 수 있어요.",
    tab: "tasks",
  };
}
export function participantSteps(t: Task) {
  return ["delivered", "submitted", "verified"].includes(String(t.status))
    ? [
        true,
        ["submitted", "verified"].includes(String(t.status)),
        t.status === "verified",
        t.payoutStatus === "paid",
      ]
    : [false, false, false, false];
}
