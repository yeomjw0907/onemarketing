import type { RecordData } from "./types";
export function participantPerformance(
  tasks: RecordData[],
  participantId: string,
  now = Date.now(),
) {
  const rows = tasks.filter(
    (t) => t.participantId === participantId && t.status !== "cancelled",
  );
  const time = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v))
      ? Date.parse(v)
      : null;
  const tracked = rows.filter((t) => time(t.requestedAt) !== null);
  const durations = (end: string, start: string) =>
    tracked.flatMap((t) => {
      const a = time(t[start]),
        b = time(t[end]);
      return a !== null && b !== null && b >= a ? [b - a] : [];
    });
  const mean = (values: number[]) =>
    values.length ? values.reduce((n, v) => n + v, 0) / values.length : null;
  const response = durations("submittedAt", "requestedAt"),
    review = durations("verifiedAt", "submittedAt");
  const deadlineRows = tracked.filter(
    (t) => time(t.postingDeadlineAt) !== null && time(t.submittedAt) !== null,
  );
  const scores = rows
    .filter(
      (t) => t.status === "verified" && typeof t.qualityScore === "number",
    )
    .map((t) => Number(t.qualityScore));
  return {
    tracked: tracked.length,
    submitted: response.length,
    verified: tracked.filter((t) => t.status === "verified").length,
    averageResponseMs: mean(response),
    averageReviewMs: mean(review),
    averageCompletionMs: mean(durations("verifiedAt", "requestedAt")),
    deadlineCount: deadlineRows.length,
    onTime: deadlineRows.filter(
      (t) => time(t.submittedAt)! <= time(t.postingDeadlineAt)!,
    ).length,
    overdue: tracked.filter(
      (t) =>
        time(t.submittedAt) === null &&
        time(t.postingDeadlineAt) !== null &&
        time(t.postingDeadlineAt)! < now,
    ).length,
    revisionCount: rows.reduce(
      (n, t) => n + Number(t.postingRevisionCount || 0),
      0,
    ),
    qualityCount: scores.length,
    averageQuality: mean(scores),
  };
}
export function elapsedLabel(ms: number | null) {
  if (ms === null) return "기록 없음";
  const minutes = Math.round(ms / 60000);
  return minutes < 60
    ? `${minutes}분`
    : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}
