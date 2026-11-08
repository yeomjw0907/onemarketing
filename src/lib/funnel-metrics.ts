export type FunnelJourney = {
  id: string;
  times: (string | null)[];
  status: string;
};
export type FunnelDefinition = {
  key: string;
  title: string;
  unit: string;
  description: string;
  steps: string[];
  journeys: FunnelJourney[];
};
const day = 86400000;
export function funnelRange(
  from: string,
  to: string,
  windowDays: number,
  now = new Date(),
) {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(to) || ![7, 30, 60].includes(windowDays))
    throw new Error("기간과 관찰 일수를 확인해주세요.");
  const start = Date.parse(from + "T00:00:00+09:00");
  const end = Date.parse(to + "T00:00:00+09:00") + day;
  const today = new Date(now.getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  if (start >= end || end - start > 366 * day || to > today)
    throw new Error("조회 기간은 오늘까지 최대 366일로 선택해주세요.");
  return { from, to, start, end, windowDays, asOf: now.toISOString() };
}
export type FunnelRange = ReturnType<typeof funnelRange>;
const time = (value: string | null | undefined) =>
  value ? Date.parse(value) : NaN;
export function summarizeFunnel(
  definition: FunnelDefinition,
  range: FunnelRange,
) {
  const asOf = Date.parse(range.asOf);
  // A business entity can reach a stage only once, even after retries or joins.
  const unique = new Map(definition.journeys.map((j) => [j.id, j]));
  const cohort = [...unique.values()].filter((j) => {
    const start = time(j.times[0]);
    return start >= range.start && start < range.end && start <= asOf;
  });
  const mature = cohort.filter(
    (j) => time(j.times[0]) + range.windowDays * day <= asOf,
  );
  const counts = definition.steps.map(() => 0);
  const observed = definition.steps.map(() => 0);
  const durations = definition.steps.map(() => [] as number[]);
  let missingTiming = 0;
  const statuses: Record<string, number> = {};
  for (const journey of cohort) {
    statuses[journey.status] = (statuses[journey.status] || 0) + 1;
    let previous = time(journey.times[0]);
    for (let i = 0; i < observed.length; i++) {
      const at = time(journey.times[i]);
      if (!Number.isFinite(at) || at < previous || at > asOf) break;
      observed[i]++;
      previous = at;
    }
  }
  for (const journey of mature) {
    const deadline = time(journey.times[0]) + range.windowDays * day;
    let previous = time(journey.times[0]);
    for (let i = 0; i < counts.length; i++) {
      const at = time(journey.times[i]);
      if (!Number.isFinite(at)) {
        if (journey.times.slice(i + 1).some((v) => Number.isFinite(time(v))))
          missingTiming++;
        break;
      }
      if (at < previous) {
        missingTiming++;
        break;
      }
      if (at > deadline || at > asOf) break;
      counts[i]++;
      if (i) durations[i].push((at - previous) / day);
      previous = at;
    }
  }
  const steps = definition.steps.map((label, i) => {
    const denominator = i ? counts[i - 1] : mature.length;
    const sorted = durations[i].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      label,
      observed: observed[i],
      reached: counts[i],
      denominator,
      notReached: denominator - counts[i],
      conversion: denominator ? counts[i] / denominator : null,
      medianDays: sorted.length
        ? (sorted[mid] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2
        : null,
    };
  });
  return {
    key: definition.key,
    title: definition.title,
    unit: definition.unit,
    description: definition.description,
    cohort: cohort.length,
    mature: mature.length,
    pending: cohort.length - mature.length,
    missingTiming,
    statuses,
    steps,
  };
}
export type FunnelSummary = ReturnType<typeof summarizeFunnel>;
