import { z } from "zod";

export const keywordPlanSchema = z.object({
  main: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
  secondary: z.array(z.string().trim().min(1).max(100)).max(10),
  reason: z.string().min(1).max(1000),
  candidates: z
    .array(
      z.object({
        keyword: z.string().trim().min(1).max(100),
        intent: z.string().min(1).max(100),
        reason: z.string().min(1).max(1000),
        evidenceUrls: z
          .array(
            z
              .string()
              .url()
              .refine((u) => /^https?:\/\//.test(u)),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(20),
  excluded: z
    .array(
      z.object({
        keyword: z.string().max(100),
        reason: z.string().min(1).max(1000),
      }),
    )
    .max(20)
    .default([]),
  volumeVerified: z.literal(false).default(false),
});
export function validateKeywordEvidence(
  input: unknown,
  sources: { url: string }[],
) {
  const plan = keywordPlanSchema.parse(input);
  const canonical = (url: string) => {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  };
  const known = new Set(sources.map((s) => canonical(s.url)));
  if (
    plan.candidates.some((c) =>
      c.evidenceUrls.some((url) => !known.has(canonical(url))),
    )
  )
    throw new Error("키워드 근거에 수집하지 않은 출처가 포함되어 있습니다.");
  const key = (v: string) => v.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const candidates = new Set(plan.candidates.map((c) => key(c.keyword)));
  if (
    candidates.size !== plan.candidates.length ||
    [...plan.main, ...plan.secondary].some((v) => !candidates.has(key(v)))
  )
    throw new Error("선정한 키워드별 검색 의도와 근거를 모두 작성하세요.");
  return plan;
}

export const keywordResearchInstructions =
  "키워드는 고객의 희망 키워드를 출발점으로 실제 제품명·카테고리·지역(확인된 경우)·사용 상황·구매/비교/질문 의도를 나눠 조사하세요. 가능한 경우 8~12개 후보를 비교하고, 각 후보에 검색 의도, 제품과의 관련성, 실제 확인한 근거 URL과 선정/제외 이유를 남기세요. 브랜드의 공식 자료와 실제 검색 결과 문맥을 우선하고 블로그용 본문 키워드와 클립 설명/해시태그 용도를 구분하세요. 관련 없는 인기 키워드·브랜드 오인·근거 없는 효능은 제외하세요. 검색량·경쟁도·순위·자동완성은 별도 데이터로 확인하지 않았다면 수치나 검증 사실을 만들지 말고 미확인으로 표시하세요. 웹 문맥상 추천과 실제 검색량 검증을 구분하세요.";
