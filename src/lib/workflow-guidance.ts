export function reviewEligibleTime(task: Record<string, unknown>) {
  const explicit = Date.parse(String(task.reviewEligibleAt || ""));
  return Number.isFinite(explicit)
    ? explicit
    : Date.parse(String(task.submittedAt || "")) + 3 * 86400000;
}
import type { DatabaseView, RecordData } from "./types";

export type ProjectAction = {
  key: string;
  title: string;
  description: string;
  count: number;
  tab?: number;
  workflow?: boolean;
};
export function projectActions(
  data: DatabaseView,
  project: RecordData,
  now = Date.now(),
): ProjectAction[] {
  const tasks = data.tasks.filter(
    (t) => t.projectId === project.id && t.status !== "cancelled",
  );
  const slots = data.work_slots.filter(
    (s) => s.projectId === project.id && s.status !== "cancelled",
  );
  const activeTaskIds = new Set(
    data.jobs
      .filter(
        (j) =>
          j.projectId === project.id &&
          ["pending", "running"].includes(String(j.status)),
      )
      .map((j) => j.taskId),
  );
  const actions: ProjectAction[] = [];
  const add = (
    key: string,
    title: string,
    description: string,
    count: number,
    tab?: number,
    workflow = false,
  ) => {
    if (count) actions.push({ key, title, description, count, tab, workflow });
  };
  add(
    "recovery",
    "게시 유지 이상 확인",
    "공개 상태를 확인하고 필요한 복구 요청을 진행하세요.",
    tasks.filter(
      (t) =>
        t.retentionMonitorAlert ||
        ["needs_recovery", "recovery_submitted"].includes(
          String(t.retentionStatus),
        ),
    ).length,
    undefined,
    true,
  );
  if (project.hold || project.settled || project.status === "cancelled")
    return actions;
  if (project.status === "materials")
    add(
      "materials",
      "고객 자료 확인",
      "제품 링크·소개 자료와 확인된 정보를 정리하세요.",
      1,
      1,
    );
  if (project.productUnderstandingCurrent === false)
    add(
      "product",
      "제품 정보 확정",
      "AI가 정리한 정보와 근거를 확인한 뒤 확정하세요.",
      1,
      1,
    );
  if (["planning", "brief_review"].includes(String(project.status)))
    add(
      "planning",
      "작업 기획 검토",
      "게시 작업별 기획을 확인하고 제작 단계로 진행하세요.",
      tasks.length,
      2,
    );
  if (["producing", "review"].includes(String(project.status))) {
    add(
      "review",
      "결과물 검수",
      "원고·이미지·영상의 완성본을 확인하세요.",
      tasks.filter((t) => t.status === "review").length,
      3,
    );
    add(
      "production",
      "콘텐츠 제작 진행",
      "시나리오·생성 브리핑을 검토하고 제작을 이어가세요.",
      tasks.filter(
        (t) =>
          ["planned", "producing", "changes"].includes(String(t.status)) &&
          !activeTaskIds.has(t.id),
      ).length,
      6,
    );
  }
  if (project.status !== "completed") {
    const openSlots = slots.filter(
      (s) =>
        !s.participantId &&
        ((s.taskIds as string[] | undefined) || []).some((id) =>
          tasks.some((t) => t.id === id),
        ) &&
        !data.work_offers.some(
          (o) =>
            o.slotId === s.id &&
            (o.status === "accepted" ||
              (o.status === "proposed" &&
                Date.parse(String(o.expiresAt)) > now)),
        ),
    );
    add(
      "offers",
      "참여자 제안",
      "추천 참여자와 계정을 확인하고 참여를 제안하세요.",
      openSlots.length,
      undefined,
      true,
    );
    add(
      "delivery",
      "승인 자료 전달",
      "배정된 작업의 승인본을 참여자 화면으로 전달하세요.",
      slots.filter(
        (s) =>
          s.participantId &&
          (s.taskIds as string[] | undefined)?.length &&
          (s.taskIds as string[]).every((id) =>
            tasks.some((t) => t.id === id && t.status === "approved"),
          ),
      ).length,
      undefined,
      true,
    );
  }
  add(
    "publication",
    "게시물 검수",
    "제출 후 3일이 지난 게시물을 확인하세요.",
    tasks.filter(
      (t) => t.status === "submitted" && reviewEligibleTime(t) <= now,
    ).length,
    4,
  );
  const payable = slots.filter(
    (s) =>
      s.participantId &&
      s.payoutStatus !== "paid" &&
      (s.taskIds as string[] | undefined)?.some((id) =>
        tasks.some(
          (t) =>
            t.id === id && t.status === "verified" && t.payoutStatus !== "paid",
        ),
      ),
  );
  const completeSlots = payable.filter((s) =>
    (s.taskIds as string[]).every((id) =>
      tasks.some((t) => t.id === id && t.status === "verified"),
    ),
  );
  add(
    "payment",
    "전체 지급 내역 확인",
    "검수한 작업의 원고료와 지급 내역을 확인하세요.",
    completeSlots.length,
    7,
  );
  add(
    "partial_payment",
    "부분 정산 조건 확인",
    "묶음 중 검수 통과한 건과 남은 작업을 확인하세요.",
    payable.length - completeSlots.length,
    undefined,
    true,
  );
  add(
    "legacy_payment",
    "개별 지급 내역 확인",
    "게시 확인과 지급 금액을 확인하세요.",
    tasks.filter(
      (t) =>
        !t.workSlotId &&
        !t.postingSetId &&
        t.status === "verified" &&
        t.payoutStatus !== "paid",
    ).length,
    4,
  );
  return actions;
}

export function participantTaskGuide(task: Record<string, unknown>) {
  if (task.retentionStatus === "needs_recovery")
    return {
      title: "게시물을 공개 상태로 복구해주세요",
      description: "기존 게시물을 복구한 뒤 아래에서 복구 완료를 알려주세요.",
    };
  if (task.retentionStatus === "recovery_submitted")
    return {
      title: "복구 확인 중이에요",
      description: "담당자가 공개 상태를 다시 확인하고 있어요.",
    };
  if (task.status === "delivered" && task.revisionNotes)
    return {
      title: "요청한 내용을 수정해주세요",
      description: String(task.revisionNotes),
    };
  if (task.status === "delivered")
    return {
      title: "자료 확인하고 게시해주세요",
      description:
        "아래 순서대로 자료 저장·원고 복사·게시를 진행한 뒤 링크를 제출해주세요.",
    };
  if (task.status === "submitted")
    return {
      title: "제출 완료 · 검수 대기",
      description: task.reviewEligibleAt
        ? `${new Date(String(task.reviewEligibleAt)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}부터 검수 가능해요. 링크가 맞다면 다시 제출하지 않아도 돼요.`
        : "제출한 링크는 담당자가 확인할 예정이에요.",
    };
  if (task.status === "verified")
    return {
      title:
        task.payoutStatus === "paid"
          ? "지급이 완료됐어요"
          : "검수 통과 · 지급 대기",
      description:
        task.payoutStatus === "paid"
          ? "정산·추천에서 지급 내역을 확인하고 게시 유지 기간을 지켜주세요."
          : "검수는 끝났고 원고료는 아직 지급 전이에요. 묶음 중 일부만 끝났다면 담당자에게 부분 정산을 문의해주세요.",
    };
  if (task.status === "cancelled")
    return {
      title: "종료된 작업이에요",
      description: "새로운 작업은 받은 제안에서 확인해주세요.",
    };
  return {
    title: "게시 자료를 준비하고 있어요",
    description: "자료가 준비되면 안내해드려요. 아직 게시하지 않아도 돼요.",
  };
}

export function reportSchedule(tasks: RecordData[], now = Date.now()) {
  const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  const monday = new Date(
    Date.parse(day + "T00:00:00Z") - ((weekday + 6) % 7) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const sunday = new Date(Date.parse(monday + "T00:00:00Z") + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  const active = tasks.filter((t) => t.status !== "cancelled");
  const scheduled = active.filter(
    (t) =>
      typeof t.scheduledUntil === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.scheduledUntil),
  );
  const week = scheduled.filter(
    (t) =>
      String(t.scheduledUntil) >= monday && String(t.scheduledUntil) <= sunday,
  );
  const posted = (t: RecordData) => {
    if (!["submitted", "verified"].includes(String(t.status))) return false;
    try {
      return ["https:", "http:"].includes(new URL(String(t.link)).protocol);
    } catch {
      return false;
    }
  };
  return {
    weekStart: monday,
    weekEnd: sunday,
    scheduled: scheduled.length,
    total: active.length,
    planned: week.length,
    submitted: week.filter(posted).length,
    verified: week.filter((t) => t.status === "verified" && posted(t)).length,
    overdue: scheduled.filter(
      (t) => String(t.scheduledUntil) < day && !posted(t),
    ).length,
    remaining: week.filter((t) => !posted(t)).length,
  };
}
