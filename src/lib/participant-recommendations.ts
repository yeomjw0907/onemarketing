import type { DatabaseView, RecordData } from "./types";
import { accountAssignable } from "./participant-account-policy";

export type RecommendationOrder =
  "balanced" | "quality" | "speed" | "tenure" | "volume";
const timestamp = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? Date.parse(v)
    : null;
const mean = (a: number[]) =>
  a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;

export function recommendParticipants(
  data: DatabaseView,
  slot?: RecordData,
  order: RecommendationOrder = "balanced",
  now = Date.now(),
) {
  const channels = slot
    ? slot.type === "bundle"
      ? ["blog", "clip"]
      : [String(slot.type)]
    : [];
  const project = data.projects.find((p) => p.id === slot?.projectId);
  return data.participants
    .filter((p) => p.status === "active")
    .flatMap((p) => {
      const accounts = (p.accounts || []) as {
        id: string;
        channel: string;
        approvalStatus?: "approved" | "pending" | "rejected";
        ownershipVerifiedAt?: string;
      }[];
      const eligible = channels.every((channel) =>
        accounts.some(
          (a) =>
            accountAssignable(a, channel) &&
            (!project?.workflowPolicy || a.ownershipVerifiedAt) &&
            !data.tasks.some(
              (t) =>
                t.projectId === slot?.projectId &&
                t.participantId === p.id &&
                t.channel === channel &&
                t.participantAccountId === a.id &&
                t.status !== "cancelled",
            ) &&
            !data.work_offers.some(
              (o) =>
                o.projectId === slot?.projectId &&
                o.participantId === p.id &&
                o.status === "proposed" &&
                (timestamp(o.expiresAt) ?? 0) > now &&
                ((o.accountKeys || []) as string[]).includes(
                  channel + ":" + a.id,
                ),
            ),
        ),
      );
      if (!eligible) return [];
      const tasks = data.tasks.filter(
        (t) => t.participantId === p.id && t.status !== "cancelled",
      );
      const completed = tasks.filter((t) => t.status === "verified");
      const ratings = completed.flatMap((t) =>
        typeof t.qualityScore === "number" &&
        t.qualityScore >= 1 &&
        t.qualityScore <= 5
          ? [t.qualityScore]
          : [],
      );
      const durations = tasks.flatMap((t) => {
        const start = timestamp(t.requestedAt),
          end = timestamp(t.submittedAt);
        return start !== null && end !== null && end >= start
          ? [(end - start) / 3600000]
          : [];
      });
      const deadlines = tasks.filter(
        (t) =>
          timestamp(t.postingDeadlineAt) !== null &&
          (timestamp(t.submittedAt) !== null ||
            timestamp(t.postingDeadlineAt)! < now),
      );
      const onTime = deadlines.filter(
        (t) =>
          timestamp(t.submittedAt) !== null &&
          timestamp(t.submittedAt)! <= timestamp(t.postingDeadlineAt)!,
      ).length;
      const overdue = tasks.filter(
        (t) =>
          timestamp(t.submittedAt) === null &&
          timestamp(t.postingDeadlineAt) !== null &&
          timestamp(t.postingDeadlineAt)! < now,
      ).length;
      const revisions = tasks.reduce(
        (n, t) =>
          n +
          Math.max(
            Number(t.postingRevisionCount || 0),
            Number(t.revisionCount || 0),
          ),
        0,
      );
      // Neutral priors keep a single perfect rating from dominating established performance.
      const quality = Math.max(
        0,
        Math.min(
          100,
          ((ratings.reduce((s, n) => s + n, 0) + 3 * 3) /
            (ratings.length + 3) /
            5) *
            60 +
            ((onTime + 2) / (deadlines.length + 4)) * 40 -
            Math.min(20, (revisions / Math.max(1, tasks.length)) * 10),
        ),
      );
      const hours = mean(durations);
      const speed = hours === null ? 50 : 100 / (1 + hours / 48);
      const first = Math.min(
        now,
        ...tasks.map(
          (t) =>
            timestamp(t.assignedAt) ??
            timestamp(t.requestedAt) ??
            timestamp(t.createdAt) ??
            now,
        ),
      );
      const days = Math.floor((now - first) / 86400000);
      const tenure = Math.min(100, (days / 365) * 100);
      const volume = Math.min(
        100,
        (Math.log1p(completed.length) / Math.log1p(50)) * 100,
      );
      const scores = { quality, speed, tenure, volume };
      const score = Math.max(
        0,
        (order === "balanced"
          ? quality * 0.4 + speed * 0.25 + tenure * 0.15 + volume * 0.2
          : scores[order]) - Math.min(30, overdue * 10),
      );
      return [
        {
          participant: p,
          score,
          scores,
          completed: completed.length,
          quality: mean(ratings),
          hours,
          days,
          overdue,
          samples: ratings.length,
          onTime,
          deadlineCount: deadlines.length,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.completed - a.completed ||
        a.participant.id.localeCompare(b.participant.id),
    );
}
