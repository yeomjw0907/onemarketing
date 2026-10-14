import type { RecordData } from "./types";
export function recommend(prices: RecordData[], budget: number, discount = 0) {
  if (!Number.isInteger(budget) || budget <= 0)
    throw new Error("예산을 입력하세요.");
  const valid = prices.filter(
    (p) =>
      Number(p.sale) > 0 &&
      p.payout !== null &&
      p.aiEstimate !== null &&
      Number(p.sale) >= Number(p.payout) + Number(p.aiEstimate),
  );
  const blogs = valid.filter((p) => p.channel === "blog"),
    clips = valid.filter((p) => p.channel === "clip");
  const candidates: {
    lines: { priceId: string; quantity: number }[];
    sale: number;
    cost: number;
    blogs: number;
    clips: number;
  }[] = [];
  for (const b of [null, ...blogs.slice(0, 10)])
    for (const c of [null, ...clips.slice(0, 10)])
      for (let x = 0; x <= (b ? 20 : 0); x++)
        for (let y = 0; y <= (c ? 20 : 0); y++) {
          if (x + y === 0) continue;
          const sale =
              x * Number(b?.sale || 0) + y * Number(c?.sale || 0) - discount,
            cost =
              x * (Number(b?.payout || 0) + Number(b?.aiEstimate || 0)) +
              y * (Number(c?.payout || 0) + Number(c?.aiEstimate || 0));
          if (sale <= 0 || sale > budget || sale < cost) continue;
          candidates.push({
            lines: [
              ...(x && b ? [{ priceId: b.id, quantity: x }] : []),
              ...(y && c ? [{ priceId: c.id, quantity: y }] : []),
            ],
            sale,
            cost,
            blogs: x,
            clips: y,
          });
        }
  const score = (a: (typeof candidates)[number], mode: string) =>
    mode === "blog"
      ? a.blogs * 10000 + a.clips * 100 + a.sale / budget
      : mode === "clip"
        ? a.clips * 10000 + a.blogs * 100 + a.sale / budget
        : Math.min(a.blogs, a.clips) * 10000 +
          (a.blogs + a.clips) * 100 +
          a.sale / budget;
  const seen = new Set<string>();
  return ["balanced", "blog", "clip"].flatMap((mode) => {
    const candidate = [...candidates].sort(
      (a, b) => score(b, mode) - score(a, mode),
    )[0];
    if (!candidate) return [];
    const key = JSON.stringify(candidate.lines);
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        ...candidate,
        mode,
        name:
          mode === "blog"
            ? "블로그 중심"
            : mode === "clip"
              ? "클립 중심"
              : "균형 구성",
        margin: candidate.sale - candidate.cost,
      },
    ];
  });
}
