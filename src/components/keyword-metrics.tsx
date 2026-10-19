import type { NaverKeywordMetrics } from "@/lib/naver-keyword-schema";
export default function KeywordMetrics({
  metrics,
}: {
  metrics: NaverKeywordMetrics;
}) {
  return (
    <div className="keyword-metrics">
      <h3>네이버 검색 데이터</h3>
      <p className="hint">
        블로그 확인 기간 {metrics.startDate} ~ {metrics.endDate} · 검색 추이{" "}
        {metrics.trendStartDate} ~ {metrics.endDate}
      </p>
      <p className="hint">
        핵심·보조 중 최대 5개를 같은 요청으로 비교해요. 지수는 이 비교 묶음의
        최댓값이 100인 상대값이며 월간 검색수나 노출 난이도가 아니에요. 다른
        조회 묶음의 지수와 직접 비교하지 마세요.
      </p>
      {metrics.rows.map((row) => {
        const last = row.trend.at(-1);
        return (
          <div className="keyword-metric-row" key={row.keyword}>
            <strong>{row.keyword}</strong>
            <dl>
              <div>
                <dt>블로그 검색 문서</dt>
                <dd>
                  {row.blogTotal === null
                    ? "미확인"
                    : row.blogTotal.toLocaleString("ko-KR") + "건"}
                </dd>
              </div>
              <div>
                <dt>기간 내 확인된 글</dt>
                <dd>
                  {row.recentObserved === null
                    ? "미확인"
                    : row.recentObserved === 0 && row.limited
                      ? "확인 범위 부족"
                      : row.recentObserved.toLocaleString("ko-KR") + "건"}
                  {row.limited &&
                  row.recentObserved !== null &&
                  row.recentObserved > 0
                    ? " 이상"
                    : ""}
                </dd>
              </div>
              <div>
                <dt>최신 제공 관심도 지수</dt>
                <dd>
                  {last
                    ? `${last.ratio.toFixed(1)} (${last.period})`
                    : "자료 없음"}
                </dd>
              </div>
            </dl>
            <p className="hint">
              최신순 검색 결과 중 {row.sampleSize}개를 확인했어요. 검색 문서
              수는 전체 발행수와 다를 수 있고, 최근 글 건수는 검색 API에서
              확인된 범위예요.
            </p>
            {row.blogError && (
              <p role="status" className="hint">
                {row.blogError}
              </p>
            )}
            {row.trendError && (
              <p role="status" className="hint">
                {row.trendError}
              </p>
            )}
            {!!row.trend.length && (
              <details>
                <summary>검색 관심도 추이 확인</summary>
                <svg
                  viewBox="0 0 360 110"
                  width="100%"
                  role="img"
                  aria-label={`${row.keyword} 검색 관심도 추이, 상대 지수 0~100`}
                >
                  <line
                    x1="0"
                    y1="100"
                    x2="360"
                    y2="100"
                    stroke="currentColor"
                    opacity="0.2"
                  />
                  <polyline
                    points={row.trend
                      .map(
                        (d) =>
                          `${((Date.parse(d.period) - Date.parse(metrics.trendStartDate)) / (Date.parse(metrics.endDate) - Date.parse(metrics.trendStartDate))) * 360},${100 - d.ratio}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#3182f6"
                    strokeWidth="2"
                  />
                </svg>
                <p className="hint">
                  네이버가 제공한 날짜만 연결한 추이예요. 데이터가 없는 날을
                  검색수 0으로 간주하지 않아요.
                </p>
              </details>
            )}
          </div>
        );
      })}
      <p className="hint">
        조회 시각{" "}
        {new Date(metrics.measuredAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}{" "}
        · 출처: NAVER API HUB 블로그·검색어 트렌드
      </p>
    </div>
  );
}
