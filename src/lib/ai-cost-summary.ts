import type { RecordData } from "./types";

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
});
function monthOf(date: Date) {
  const parts = monthFormatter.formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

export function aiCostSummary(costs: RecordData[], now = new Date()) {
  const month = monthOf(now);
  const ai = costs.filter((c) => c.category === "ai");
  const monthly = ai.filter((c) => {
    const date = new Date(c.createdAt);
    return Number.isFinite(date.getTime()) && monthOf(date) === month;
  });
  const sum = (rows: RecordData[]) =>
    rows.reduce((total, c) => total + Number(c.amount || 0), 0);
  const projectCosts = ai.filter(
    (c) => typeof c.projectId === "string" && c.projectId,
  );
  const projectCount = new Set(projectCosts.map((c) => c.projectId)).size;
  return {
    month,
    monthlyTotal: sum(monthly),
    monthlyProvisional: sum(monthly.filter((c) => c.confirmed !== true)),
    total: sum(ai),
    projectCount,
    average: projectCount ? Math.round(sum(projectCosts) / projectCount) : null,
    provisionalCount: ai.filter((c) => c.confirmed !== true).length,
    provisionalTotal: sum(ai.filter((c) => c.confirmed !== true)),
  };
}
