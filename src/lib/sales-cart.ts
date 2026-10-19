import { z } from "zod";
import type { RecordData } from "./types";
export const rewardDefaults = { blog: 3000, clip: 3000, bundle: 7000 };
export const packageLabels = {
  blog: "체험단 only · 블로그 1",
  clip: "클립 only · 클립 1",
  bundle: "체험단 1 + 클립 1",
};
export const salesCartSchema = z
  .array(
    z.object({
      type: z.enum(["blog", "clip", "bundle"]),
      quantity: z.number().int().min(1).max(100),
      blogPriceId: z.string().optional(),
      clipPriceId: z.string().optional(),
    }),
  )
  .max(3)
  .superRefine((rows, ctx) => {
    if (
      new Set(rows.map((r) => r.type)).size !== rows.length ||
      rows.reduce((n, r) => n + r.quantity, 0) > 100
    )
      ctx.addIssue({
        code: "custom",
        message: "종류별 수량으로 합쳐 입력하고 100슬롯 이내로 구성하세요.",
      });
  });
export type SalesCart = z.infer<typeof salesCartSchema>;
export function cartQuote(
  prices: RecordData[],
  cart: SalesCart,
  discount: number,
  defaults = { blog: 6500, clip: 15000 },
) {
  const snapshots: RecordData[] = [];
  const packages: Record<string, any>[] = [];
  for (const row of cart) {
    const getPrice = (id: string | undefined, channel: string) => {
      const p = prices.find((p) => p.id === id && p.channel === channel);
      if (!p) throw new Error("채널에 맞는 판매 단가를 선택하세요.");
      const issue = campaignPriceIssue(p, channel);
      if (issue) throw new Error(issue);
      return {
        ...p,
        priceId: p.id,
        quantity: row.quantity,
        aiEstimate: p.aiEstimate ?? defaults[channel as "blog" | "clip"],
        aiEstimateFallback: p.aiEstimate === null || p.aiEstimate === undefined,
      };
    };
    const blog = row.type !== "clip" ? getPrice(row.blogPriceId, "blog") : null;
    const clip = row.type !== "blog" ? getPrice(row.clipPriceId, "clip") : null;
    if (blog) snapshots.push({ ...blog, payout: rewardDefaults[row.type] });
    if (clip)
      snapshots.push({
        ...clip,
        payout: row.type === "bundle" ? 0 : rewardDefaults.clip,
      });
    packages.push({
      ...row,
      blog,
      clip,
      reward: rewardDefaults[row.type],
      label: packageLabels[row.type],
    });
  }
  const total = snapshots.reduce(
    (n, p) => n + Number(p.sale) * Number(p.quantity),
    0,
  );
  if (!Number.isFinite(discount) || discount < 0 || discount > total)
    throw new Error("할인액을 확인하세요.");
  const cost = snapshots.reduce(
    (n, p) =>
      n + (Number(p.payout) + Number(p.aiEstimate)) * Number(p.quantity),
    0,
  );
  return {
    snapshots,
    packageSnapshots: packages,
    total,
    discount,
    sale: total - discount,
    cost,
    margin: total - discount - cost,
  };
}

export function campaignPriceIssue(
  price: RecordData,
  channel: string,
): string | null {
  if (price.channel !== channel) return "채널에 맞는 판매 단가를 선택하세요.";
  if (channel === "blog" && Number(price.images) !== 3)
    return "체험단 상품은 이미지 3장 단가를 선택하세요.";
  if (
    channel === "clip" &&
    (price.duration !== 10 || price.mode !== "generated")
  )
    return "클립 상품은 10초 AI 생성형 단가를 선택하세요.";
  return null;
}
