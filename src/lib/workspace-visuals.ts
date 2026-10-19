import type { DatabaseView, RecordData } from "./types";
import type { dashboardVisuals } from "./dashboard-visualization";
import { reviewEligibleTime } from "./workflow-guidance";
export function workspaceSnapshot(data: DatabaseView, now = Date.now()) {
  const projects = data.projects.filter((p) => p.status !== "cancelled");
  const tasks = data.tasks.filter(
    (t) =>
      t.status !== "cancelled" && projects.some((p) => p.id === t.projectId),
  );
  const customers = data.customers.filter((c) => !c.deletedAt),
    products = data.products.filter(
      (p) => !p.deletedAt && customers.some((c) => c.id === p.customerId),
    );
  const people = data.participants.filter((p) => !p.deletedAt);
  return {
    projects,
    tasks,
    customers,
    products,
    people,
    assignableSlots: data.work_slots.filter(
      (s) =>
        s.status !== "cancelled" &&
        !s.participantId &&
        projects.some(
          (p) =>
            p.id === s.projectId &&
            !p.hold &&
            !p.settled &&
            p.status !== "completed",
        ) &&
        Array.isArray(s.taskIds) &&
        s.taskIds.some((id) => tasks.some((t) => t.id === id)),
    ),
    activeProjects: projects.filter((p) => p.status !== "completed" && !p.hold)
      .length,
    review: tasks.filter((t) => t.status === "review").length,
    changes: tasks.filter((t) => t.status === "changes").length,
    submitted: tasks.filter((t) => t.status === "submitted").length,
    reviewReady: tasks.filter(
      (t) => t.status === "submitted" && reviewEligibleTime(t) <= now,
    ).length,
    verified: tasks.filter((t) => t.status === "verified").length,
    recovery: tasks.filter(
      (t) =>
        t.retentionMonitorAlert ||
        ["needs_recovery", "recovery_submitted"].includes(
          String(t.retentionStatus),
        ),
    ).length,
    activePeople: people.filter((p) => p.status === "active").length,
    sources: data.assets.filter(
      (a) =>
        customers.some((c) => c.id === a.customerId) &&
        !a.projectId &&
        a.current !== false,
    ),
  };
}
export function dashboardHeadline(v: ReturnType<typeof dashboardVisuals>) {
  const recovery = v.actions.find((a) => a.action.key === "recovery");
  if (recovery)
    return {
      title: "공개 상태를 확인할 게시물이 있어요",
      label: "유지 이상 확인",
      projectId: recovery.project.id,
      tab: 0,
      workflow: true,
      section: "review",
    };
  const overdue = v.rows.filter((r) => r.overdue && !r.project.hold);
  if (overdue.length)
    return {
      title: `마감이 지난 캠페인 ${overdue.length}개를 확인해주세요`,
      label: "지연 캠페인 확인",
      projectId: overdue[0].project.id,
      tab: overdue[0].tab,
    };
  const due = v.rows.filter((r) => r.dueToday && !r.project.hold);
  if (due.length)
    return {
      title: `오늘 마감하는 캠페인이 ${due.length}개 있어요`,
      label: "마감 캠페인 확인",
      projectId: due[0].project.id,
      tab: due[0].tab,
    };
  if (v.summary.reviews)
    return {
      title: `검수·수정할 콘텐츠가 ${v.summary.reviews}건 있어요`,
      label: "검수할 캠페인 보기",
    };
  if (v.jobs.some((j) => j.status === "running"))
    return { title: "AI 작업이 진행 중이에요", label: "진행 상황 보기" };
  return {
    title: v.rows.length
      ? `진행 중인 캠페인 ${v.rows.length}개를 확인해보세요`
      : "첫 캠페인을 시작해보세요",
    label: "캠페인 보기",
  };
}
export function recordProgress(tasks: RecordData[]) {
  const active = tasks.filter((t) => t.status !== "cancelled");
  return {
    total: active.length,
    done: active.filter((t) => t.status === "verified").length,
  };
}
