import { z } from "zod";
export const workflowPolicySchema = z.object({
  offerHours: z.number().int().min(1).max(336).default(48),
  submissionDays: z.number().int().min(1).max(90).default(7),
  revisionDays: z.number().int().min(1).max(30).default(2),
  preparationDays: z.number().int().min(1).max(60).default(7),
  reviewDays: z.literal(3).default(3),
  retentionDays: z.literal(90).default(90),
});
export const defaultWorkflowPolicy = workflowPolicySchema.parse({});
export const referralRates = { blog: 500, clip: 500, bundle: 1200 };
export function addDays(date: string, days: number) {
  return new Date(new Date(date).getTime() + days * 86400000).toISOString();
}
export function weeklyTimeline(
  start: string,
  end: string,
  blog: number,
  clip: number,
) {
  const first = new Date(start + "T00:00:00+09:00").getTime(),
    last = new Date(end + "T00:00:00+09:00").getTime();
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    last < first ||
    last - first > 366 * 86400000
  )
    throw new Error("진행 기간은 1년 이내로 입력하세요.");
  const count = Math.ceil(((last - first) / 86400000 + 1) / 7);
  const date = (ms: number) =>
    new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
  return Array.from({ length: count }, (_, i) => ({
    start: date(first + i * 7 * 86400000),
    end: date(Math.min(last, first + (i * 7 + 6) * 86400000)),
    blog: Math.floor(blog / count) + (i < blog % count ? 1 : 0),
    clip: Math.floor(clip / count) + (i < clip % count ? 1 : 0),
  }));
}
