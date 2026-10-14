import { materialChecklist } from "./material-checklist";
import type { DatabaseView } from "./types";

export function dashboard(data: DatabaseView, now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(now);
  const projects = data.projects.filter(
    (p) => !["completed", "cancelled"].includes(String(p.status)),
  );
  const tasks = data.tasks.filter(
    (t) =>
      projects.some((p) => p.id === t.projectId) && t.status !== "cancelled",
  );
  const payable = data.tasks.filter(
    (t) =>
      (t.status !== "cancelled" || t.payoutCommitted === true) &&
      t.payoutStatus !== "paid" &&
      typeof t.payout === "number" &&
      t.payout > 0,
  );
  const rows = projects
    .map((project) => {
      const ts = tasks.filter((t) => t.projectId === project.id);
      const missing = materialChecklist(project, data.assets).filter(
        (i) => i.required && i.status !== "confirmed",
      ).length;
      const failures = data.jobs.filter(
        (j) =>
          j.projectId === project.id &&
          !j.resolvedAt &&
          (j.status === "uncertain" ||
            (j.status === "failed" &&
              !data.jobs.some(
                (newer) =>
                  newer.projectId === j.projectId &&
                  newer.taskId === j.taskId &&
                  newer.type === j.type &&
                  newer.status === "succeeded" &&
                  newer.createdAt > j.createdAt,
              ))),
      );
      let next = "기획 작성·승인",
        tab = 2;
      if (project.hold) {
        next = "보류 사유 확인";
        tab = 0;
      } else if (failures.length) {
        next = `AI 작업 ${failures.length}건 상태 확인`;
        tab = 5;
      } else if (project.status === "materials") {
        next = missing ? `자료 ${missing}개 확인` : "기획 단계 시작";
        tab = missing ? 1 : 0;
      } else if (project.status === "brief_review") {
        next = "기획 검수·승인";
        tab = 2;
      } else if (["producing", "review"].includes(String(project.status))) {
        next = ts.some((t) => t.status === "changes")
          ? "수정 요청 처리"
          : "결과물 제작·검수";
        tab = 3;
      } else if (["ready", "publishing"].includes(String(project.status))) {
        next = ts.some((t) => !t.participantId)
          ? "참여자 게시 세트 배정"
          : ts.some((t) => t.status === "approved")
            ? "참여자 패키지 전달"
            : ts.some((t) => t.status !== "verified")
              ? "게시 링크 등록·확인"
              : "세트 보수 지급·운영 완료";
        tab = 4;
      }
      const progress = (channel: string) => {
        const channelTasks = ts.filter((t) => t.channel === channel);
        return `${channelTasks.filter((t) => t.status === "verified").length}/${channelTasks.length}`;
      };
      const assets = data.assets.filter(
        (a) =>
          a.projectId === project.id &&
          ts.some((t) =>
            ((t.approvedAssets || []) as string[]).includes(a.id),
          ) &&
          a.current === true,
      );
      const approved = (category: string) =>
        assets.filter(
          (a) =>
            a.category === category &&
            ts.some(
              (t) =>
                t.id === a.taskId &&
                t.channel === (category === "video" ? "clip" : "blog"),
            ),
        ).length;
      return {
        project,
        next,
        tab,
        blog: progress("blog"),
        clip: progress("clip"),
        copy: `${approved("copy")}/${ts.filter((t) => t.channel === "blog").length}`,
        images: `${approved("image")}/${ts.filter((t) => t.channel === "blog").reduce((n, t) => n + Number(t.images || 0), 0)}`,
        videos: `${approved("video")}/${ts.filter((t) => t.channel === "clip").length}`,
        overdue: Boolean(project.due && String(project.due) < today),
        dueToday: project.due === today,
      };
    })
    .sort(
      (a, b) =>
        Number(a.project.hold === true) - Number(b.project.hold === true) ||
        String(a.project.due || "9999").localeCompare(
          String(b.project.due || "9999"),
        ),
    );
  return {
    rows,
    today,
    due: rows.filter((r) => (r.overdue || r.dueToday) && !r.project.hold)
      .length,
    reviews:
      projects.filter((p) => p.status === "brief_review").length +
      tasks.filter((t) => t.status === "review" || t.status === "changes")
        .length,
    unposted: tasks.filter((t) =>
      ["approved", "delivered", "submitted"].includes(String(t.status)),
    ).length,
    unpaid: payable.reduce((n, t) => n + Number(t.payout), 0),
    unpaidCount: payable.length,
    unknownPayoutCount: data.tasks.filter(
      (t) =>
        (t.status !== "cancelled" || t.payoutCommitted === true) &&
        t.payoutStatus !== "paid" &&
        (t.payout === null || t.payout === undefined),
    ).length,
  };
}
