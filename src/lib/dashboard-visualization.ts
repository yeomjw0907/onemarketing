import { dashboard } from "./dashboard";
import { projectActions, type ProjectAction } from "./workflow-guidance";
import type { DatabaseView, RecordData } from "./types";

const DAY = 86400000;
export const pipelineLabels = [
  "제작 준비",
  "제작 중",
  "검수·수정",
  "게시 대기",
  "게시 확인",
];
export const boardLabels = ["자료·기획", "제작·검수", "게시·정산", "보류"];
const koreanDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });
export function dashboardDay(value: unknown): string | null {
  if (!value || !(typeof value === "string" || value instanceof Date))
    return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return date.toISOString().slice(0, 10) === value ? value : null;
  return koreanDate.format(date);
}
const shift = (day: string, n: number) =>
  new Date(Date.parse(day + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export function taskPipeline(task: RecordData) {
  switch (task.status) {
    case "verified":
      return 4;
    case "approved":
    case "delivered":
    case "submitted":
      return 3;
    case "review":
    case "changes":
      return 2;
    case "producing":
      return 1;
    default:
      return 0;
  }
}
export function dashboardVisuals(data: DatabaseView, now = new Date()) {
  const summary = dashboard(data, now);
  const today = summary.today;
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const weekStart = shift(today, -((weekday + 6) % 7)),
    weekEnd = shift(weekStart, 6);
  const projectMap = new Map(data.projects.map((p) => [p.id, p]));
  const scope = data.tasks.filter(
    (t) =>
      t.status !== "cancelled" &&
      projectMap.has(String(t.projectId)) &&
      projectMap.get(String(t.projectId))!.status !== "cancelled",
  );
  const plannedScope = scope.filter(
    (t) => !projectMap.get(String(t.projectId))!.hold,
  );
  const rows = summary.rows.map((row) => {
    const tasks = scope.filter((t) => t.projectId === row.project.id);
    const pipeline = pipelineLabels.map(
      (_, index) => tasks.filter((t) => taskPipeline(t) === index).length,
    );
    const verified = pipeline[4],
      total = tasks.length;
    const actions = projectActions(data, row.project, now.getTime());
    const customer = data.customers.find(
      (c) => c.id === row.project.customerId,
    );
    const board = row.project.hold
      ? 3
      : ["ready", "publishing"].includes(String(row.project.status))
        ? 2
        : ["producing", "review"].includes(String(row.project.status))
          ? 1
          : 0;
    const openSlots = data.work_slots.filter(
      (s) =>
        s.projectId === row.project.id &&
        s.status !== "cancelled" &&
        !s.participantId &&
        Array.isArray(s.taskIds) &&
        s.taskIds.some((id) => tasks.some((t) => t.id === id)),
    ).length;
    return {
      ...row,
      tasks,
      pipeline,
      verified,
      total,
      percent: total ? Math.round((verified / total) * 100) : null,
      actions,
      customer: String(customer?.brand || customer?.name || "고객 미지정"),
      board,
      openSlots,
    };
  });
  const goalTasks = plannedScope.filter((t) => {
    const day = dashboardDay(t.scheduledUntil);
    return day && day >= weekStart && day <= weekEnd;
  });
  const goal = {
    total: goalTasks.length,
    done: goalTasks.filter((t) => t.status === "verified").length,
  };
  const verified = scope.filter((t) => t.status === "verified");
  const verifiedDay = (t: RecordData) => {
    const day = dashboardDay(t.verifiedAt);
    if (!day || day > today) return null;
    // Do not count future timestamps as work already finished.
    return /^\d{4}-\d{2}-\d{2}$/.test(String(t.verifiedAt)) ||
      Date.parse(String(t.verifiedAt)) <= now.getTime()
      ? day
      : null;
  };
  function chart(period: "week" | "month") {
    const start = period === "week" ? weekStart : today.slice(0, 7) + "-01";
    const end =
      period === "week"
        ? weekEnd
        : new Date(
            Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
          )
            .toISOString()
            .slice(0, 10);
    const dates: string[] = [];
    for (let day = start; day <= end; day = shift(day, 1)) dates.push(day);
    const chunks =
      period === "week"
        ? dates.map((d) => [d])
        : Array.from({ length: Math.ceil(dates.length / 7) }, (_, i) =>
            dates.slice(i * 7, (i + 1) * 7),
          );
    const bars = chunks.map((days, i) => {
      const actual = verified.filter((t) => {
        const d = verifiedDay(t);
        return d && days.includes(d);
      }).length;
      const planned = plannedScope.filter(
        (t) =>
          t.status !== "verified" &&
          days.includes(dashboardDay(t.scheduledUntil) || ""),
      ).length;
      return {
        label:
          period === "week"
            ? ["월", "화", "수", "목", "금", "토", "일"][i]
            : `${i * 7 + 1}–${i * 7 + days.length}일`,
        start: days[0],
        end: days.at(-1)!,
        actual,
        planned,
      };
    });
    return {
      start,
      end,
      bars,
      actual: bars.reduce((n, b) => n + b.actual, 0),
      planned: bars.reduce((n, b) => n + b.planned, 0),
    };
  }
  const actions: {
    project: RecordData;
    action: ProjectAction;
    overdue: boolean;
    dueToday: boolean;
  }[] = [];
  for (const project of data.projects.filter((p) => p.status !== "cancelled")) {
    const row = rows.find((r) => r.project.id === project.id);
    const candidates = projectActions(data, project, now.getTime());
    const recovery = candidates.find((a) => a.key === "recovery");
    const action =
      recovery ||
      (row?.tab === 5
        ? {
            key: "job-error",
            title: row.next,
            description: "실행 기록에서 오류와 재시도 내역을 확인하세요.",
            count: 1,
            tab: 5,
          }
        : candidates[0]);
    if (action)
      actions.push({
        project,
        action,
        overdue: Boolean(project.due && String(project.due) < today),
        dueToday: project.due === today,
      });
  }
  actions.sort(
    (a, b) =>
      Number(b.action.key === "recovery") -
        Number(a.action.key === "recovery") ||
      Number(Boolean(a.project.hold)) - Number(Boolean(b.project.hold)) ||
      String(a.project.due || "9999").localeCompare(
        String(b.project.due || "9999"),
      ) ||
      a.project.id.localeCompare(b.project.id),
  );
  const activeProjectIds = new Set(
    data.projects.filter((p) => p.status !== "cancelled").map((p) => p.id),
  );
  const jobs = data.jobs
    .filter(
      (j) =>
        activeProjectIds.has(String(j.projectId)) &&
        ["running", "pending", "uncertain"].includes(String(j.status)),
    )
    .sort(
      (a, b) =>
        Number(b.status === "running") - Number(a.status === "running") ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const recent = [
    ...verified
      .filter((t) => verifiedDay(t))
      .map((t) => ({
        id: t.id,
        projectId: String(t.projectId),
        title: String(t.name || "게시물") + " 게시 확인",
        date: String(t.verifiedAt),
        tab: 4,
      })),
    ...data.jobs
      .filter(
        (j) =>
          j.status === "succeeded" &&
          projectMap.has(String(j.projectId)) &&
          projectMap.get(String(j.projectId))!.status !== "cancelled" &&
          dashboardDay(j.completedAt) &&
          Date.parse(String(j.completedAt)) <= now.getTime(),
      )
      .map((j) => ({
        id: j.id,
        projectId: String(j.projectId),
        title:
          "AI 작업 완료 · " +
          String(
            data.tasks.find((t) => t.id === j.taskId)?.name ||
              projectMap.get(String(j.projectId))?.name ||
              "프로젝트",
          ),
        date: String(j.completedAt),
        tab: 5,
      })),
  ]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 4);
  return {
    summary,
    rows,
    today,
    weekStart,
    weekEnd,
    goal,
    actions,
    jobs,
    recent,
    week: chart("week"),
    month: chart("month"),
    undated: plannedScope.filter((t) => !dashboardDay(t.scheduledUntil)).length,
    undatedVerified: verified.filter((t) => !dashboardDay(t.verifiedAt)).length,
  };
}
export type DashboardRow = ReturnType<typeof dashboardVisuals>["rows"][number];
