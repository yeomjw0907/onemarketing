import { z } from "zod";
import {
  naverKeywordMetricsSchema,
  type NaverKeywordMetrics,
} from "./naver-keyword-schema";
const host = "https://naverapihub.apigw.ntruss.com";
export function naverConfigured() {
  return !!(
    process.env.NAVER_API_HUB_CLIENT_ID &&
    process.env.NAVER_API_HUB_CLIENT_SECRET
  );
}
const date = (d: Date) => d.toISOString().slice(0, 10);
export function metricDates(now = new Date()) {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Boundaries use the Korean calendar; exclude today, whose trend is incomplete.
  const kst = new Date(now.getTime() + 9 * 3600000);
  day.setUTCFullYear(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  day.setUTCDate(day.getUTCDate() - 1);
  const endDate = date(day),
    start = new Date(day),
    trend = new Date(day);
  start.setUTCDate(start.getUTCDate() - 29);
  trend.setUTCDate(trend.getUTCDate() - 89);
  return { startDate: date(start), endDate, trendStartDate: date(trend) };
}
async function api(path: string, body?: unknown) {
  if (!naverConfigured())
    throw new Error("네이버 API HUB 인증 설정이 필요합니다.");
  let response: Response;
  try {
    response = await fetch(host + path, {
      method: body ? "POST" : "GET",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_API_HUB_CLIENT_ID!,
        "X-NCP-APIGW-API-KEY": process.env.NAVER_API_HUB_CLIENT_SECRET!,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error("네이버 API 응답을 확인하지 못했어요. 다시 조회해주세요.");
  }
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "네이버 인증 정보와 블로그·검색어트렌드 사용 권한을 확인해주세요."
        : response.status === 429
          ? "네이버 API 호출 한도에 도달했어요."
          : `네이버 API 조회 실패 (HTTP ${response.status})`,
    );
  try {
    return await response.json();
  } catch {
    throw new Error("네이버 API 응답 형식을 확인해주세요.");
  }
}
const blogSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({ link: z.string(), postdate: z.string().regex(/^\d{8}$/) }),
  ),
});
export async function collectNaverKeywordMetrics(
  input: string[],
  now = new Date(),
): Promise<NaverKeywordMetrics> {
  const keywords = [
    ...new Set(input.map((k) => k.trim()).filter(Boolean)),
  ].slice(0, 5);
  if (!keywords.length) throw new Error("분석할 키워드를 선택하세요.");
  if (!naverConfigured())
    throw new Error("네이버 API HUB 인증 설정이 필요합니다.");
  const dates = metricDates(now),
    cutoff = dates.startDate.replaceAll("-", ""),
    end = dates.endDate.replaceAll("-", "");
  const rows: NaverKeywordMetrics["rows"] = await Promise.all(
    keywords.map(async (keyword) => {
      const row: NaverKeywordMetrics["rows"][number] = {
        keyword,
        blogTotal: null,
        recentObserved: null,
        sampleSize: 0,
        limited: true,
        trend: [],
      };
      try {
        const seen = new Set<string>();
        let count = 0;
        for (let page = 0; page < 3; page++) {
          const q = new URLSearchParams({
            query: keyword,
            display: "100",
            start: String(1 + page * 100),
            sort: "date",
            format: "json",
          });
          const result = blogSchema.parse(await api("/search/v1/blog?" + q));
          row.blogTotal = result.total;
          for (const item of result.items) {
            if (seen.has(item.link)) continue;
            seen.add(item.link);
            if (item.postdate >= cutoff && item.postdate <= end) count++;
          }
          row.sampleSize = seen.size;
          if (
            result.items.length < 100 ||
            result.items.some((i) => i.postdate < cutoff) ||
            seen.size >= result.total
          ) {
            row.limited = false;
            break;
          }
        }
        row.recentObserved = count;
      } catch (error) {
        row.blogError =
          error instanceof z.ZodError
            ? "네이버 블로그 응답 형식을 확인해주세요."
            : error instanceof Error
              ? error.message
              : "블로그 조회 실패";
      }
      return row;
    }),
  );
  try {
    const result = z
      .object({
        results: z.array(
          z.object({
            title: z.string(),
            data: z.array(
              z.object({
                period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                ratio: z.number().min(0).max(100),
              }),
            ),
          }),
        ),
      })
      .parse(
        await api("/search-trend/v1/search", {
          startDate: dates.trendStartDate,
          endDate: dates.endDate,
          timeUnit: "date",
          keywordGroups: keywords.map((k) => ({ groupName: k, keywords: [k] })),
        }),
      );
    for (const row of rows) {
      const group = result.results.find((g) => g.title === row.keyword);
      if (!group) row.trendError = "검색 추이 응답에 키워드가 없어요.";
      else
        row.trend = group.data
          .filter(
            (d) =>
              d.period >= dates.trendStartDate && d.period <= dates.endDate,
          )
          .sort((a, b) => a.period.localeCompare(b.period));
    }
  } catch (error) {
    for (const row of rows)
      row.trendError =
        error instanceof z.ZodError
          ? "네이버 트렌드 응답 형식을 확인해주세요."
          : error instanceof Error
            ? error.message
            : "검색 추이 조회 실패";
  }
  return naverKeywordMetricsSchema.parse({
    source: "naver-api-hub",
    measuredAt: now.toISOString(),
    ...dates,
    rows,
  });
}
