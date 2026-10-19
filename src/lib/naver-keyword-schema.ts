import { z } from "zod";
export const naverKeywordMetricsSchema = z.object({
  source: z.literal("naver-api-hub"),
  measuredAt: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  trendStartDate: z.string(),
  rows: z
    .array(
      z.object({
        keyword: z.string(),
        blogTotal: z.number().int().nonnegative().nullable(),
        recentObserved: z.number().int().nonnegative().nullable(),
        sampleSize: z.number().int().nonnegative(),
        limited: z.boolean(),
        blogError: z.string().optional(),
        trend: z.array(
          z.object({ period: z.string(), ratio: z.number().min(0).max(100) }),
        ),
        trendError: z.string().optional(),
      }),
    )
    .max(5),
});
export type NaverKeywordMetrics = z.infer<typeof naverKeywordMetricsSchema>;
