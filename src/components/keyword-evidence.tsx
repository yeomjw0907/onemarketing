import type { z } from "zod";
import type { keywordPlanSchema } from "@/lib/keyword-research";

export default function KeywordEvidence({
  plan,
}: {
  plan: Partial<z.infer<typeof keywordPlanSchema>>;
}) {
  if (!plan.candidates?.length) return null;
  return (
    <div>
      <p className="hint">
        제품 관련성과 검색 문맥을 바탕으로 추천했어요. 아래 네이버 데이터에서
        검색 관심도와 블로그 글 공급 현황을 함께 확인해주세요. 실제 검색 횟수나
        공식 노출 난이도를 의미하지 않아요.
      </p>
      {plan.candidates.map((c) => (
        <details key={c.keyword}>
          <summary>
            {c.keyword} · {c.intent}
          </summary>
          <p>{c.reason}</p>
          <div className="posting-actions">
            {c.evidenceUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                근거 {i + 1} · {new URL(url).hostname}
              </a>
            ))}
          </div>
        </details>
      ))}
      {!!plan.excluded?.length && (
        <details>
          <summary>제외한 키워드와 이유</summary>
          <ul>
            {plan.excluded.map((c) => (
              <li key={c.keyword}>
                {c.keyword} · {c.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
