import { anthropicCost } from "./anthropic-cost";
import type { DatabaseView } from "./types";
export const aiTypeLabels: Record<string, string> = {
  image: "이미지",
  video: "영상",
  copy: "원고",
  research: "조사·기획",
  "media-plan": "생성 브리핑",
  slideshow: "슬라이드",
  other: "기타 AI",
};
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function koreanDay(value: string | Date) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? dayFormatter.format(date)
    : "날짜 미정";
}
export type AiCostRow = {
  id: string;
  costId: string;
  projectId: string;
  jobId: string;
  taskId: string;
  type: string;
  provider: string;
  model: string;
  requestId: string;
  day: string;
  month: string;
  actualUsd: number | null;
  estimatedUsd: number | null;
  confirmedKrw: number | null;
  pendingKrw: number | null;
  checkedAt?: string;
  usage?: ReturnType<typeof anthropicCost>;
};
export function aiCostLedger(
  data: Pick<DatabaseView, "costs" | "jobs">,
): AiCostRow[] {
  const jobs = new Map(data.jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  const rows: AiCostRow[] = [];
  const numeric = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  for (const c of data.costs.filter((c) => c.category === "ai")) {
    const j = jobs.get(String(c.jobId));
    const base = {
      id: c.id,
      costId: c.id,
      projectId: String(c.projectId || ""),
      jobId: String(c.jobId || ""),
      taskId: String(j?.taskId || ""),
      type: String(j?.type || "other"),
      provider: "",
      model: "",
      requestId: "",
      actualUsd: null,
      estimatedUsd: null,
      confirmedKrw: null,
      pendingKrw: null,
    };
    const billing = c.providerBilling as Record<string, unknown> | undefined;
    if (billing?.currency === "USD" && numeric(billing.amount)) {
      const requestId = String(
        billing.requestId || j?.providerRequestId || c.id,
      );
      if (seen.has("fal:" + requestId)) continue;
      seen.add("fal:" + requestId);
      const day = koreanDay(String(billing.billedAt || c.createdAt));
      rows.push({
        ...base,
        requestId,
        provider: "fal",
        model: String(
          billing.model ||
            (j?.calls as any[])?.find((x) => x.provider === "fal")?.model ||
            "",
        ),
        day,
        month: day.slice(0, 7),
        actualUsd: Number(billing.amount),
        confirmedKrw:
          c.confirmed === true &&
          (!c.currency || c.currency === "KRW") &&
          numeric(c.amount)
            ? Number(c.amount)
            : null,
        checkedAt: String(billing.checkedAt || ""),
      });
      continue;
    }
    if (c.confirmed === true && c.currency === "USD" && numeric(c.amount)) {
      const day = koreanDay(c.createdAt);
      rows.push({
        ...base,
        provider: "수동 확정",
        day,
        month: day.slice(0, 7),
        actualUsd: Number(c.amount),
      });
      continue;
    }
    // A manually confirmed KRW cost is authoritative in KRW; do not add its token estimate again.
    if (
      c.confirmed === true &&
      (!c.currency || c.currency === "KRW") &&
      numeric(c.amount)
    ) {
      const day = koreanDay(c.createdAt);
      rows.push({
        ...base,
        provider: "수동 확정",
        day,
        month: day.slice(0, 7),
        confirmedKrw: Number(c.amount),
      });
      continue;
    }
    const calls = Array.isArray(j?.calls)
      ? (j.calls as Record<string, any>[])
      : [];
    let priced = 0;
    let unknown = false;
    for (const call of calls) {
      if (call.provider !== "anthropic") {
        unknown = true;
        continue;
      }
      const key = "anthropic:" + String(call.requestId || c.id + ":" + priced);
      if (seen.has(key)) continue;
      seen.add(key);
      const usage =
        call.costEstimate?.basis === "usage-estimate" &&
        call.costEstimate.currency === "USD" &&
        numeric(call.costEstimate.amount)
          ? call.costEstimate
          : anthropicCost(String(call.model), call.usage);
      if (!usage) {
        unknown = true;
        continue;
      }
      priced++;
      const day = koreanDay(String(call.at || c.createdAt));
      rows.push({
        ...base,
        id: c.id + ":" + String(call.requestId || priced),
        provider: "Claude",
        model: String(call.model),
        requestId: String(call.requestId || ""),
        day,
        month: day.slice(0, 7),
        estimatedUsd: usage.amount,
        usage,
      });
    }
    if (!priced && calls.length && !unknown) continue; // duplicate cost record for already-counted calls
    if (!priced || unknown) {
      const day = koreanDay(c.createdAt);
      rows.push({
        ...base,
        id: c.id + ":pending",
        provider: calls.some((x) => x.provider === "fal") ? "fal" : "미확인",
        day,
        month: day.slice(0, 7),
        pendingKrw:
          !priced && (!c.currency || c.currency === "KRW") && numeric(c.amount)
            ? Number(c.amount)
            : null,
      });
    }
  }
  return rows.sort(
    (a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id),
  );
}
export function totalAiCosts(rows: AiCostRow[]) {
  const usd = (key: "actualUsd" | "estimatedUsd") =>
    rows.reduce((n, r) => n + Math.round((r[key] || 0) * 1e9), 0) / 1e9;
  return {
    actualUsd: usd("actualUsd"),
    actualCount: rows.filter((r) => r.actualUsd !== null).length,
    estimatedCount: rows.filter((r) => r.estimatedUsd !== null).length,
    confirmedKrwCount: rows.filter((r) => r.confirmedKrw !== null).length,
    estimatedUsd: usd("estimatedUsd"),
    confirmedKrw: rows.reduce((n, r) => n + (r.confirmedKrw || 0), 0),
    pendingKrw: rows.reduce((n, r) => n + (r.pendingKrw || 0), 0),
    pendingCount: rows.filter(
      (r) =>
        r.actualUsd === null &&
        r.estimatedUsd === null &&
        r.confirmedKrw === null,
    ).length,
    count: rows.length,
  };
}
export function groupAiCosts(
  rows: AiCostRow[],
  by: "type" | "projectId" | "day" | "month",
) {
  const groups = new Map<string, AiCostRow[]>();
  for (const row of rows) {
    const key = row[by];
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups]
    .map(([key, rows]) => ({ key, ...totalAiCosts(rows) }))
    .sort((a, b) => b.key.localeCompare(a.key));
}
export function usd(value: number | null, exact = false) {
  return value === null
    ? "—"
    : "$" +
        value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: exact ? 9 : 6,
        });
}
