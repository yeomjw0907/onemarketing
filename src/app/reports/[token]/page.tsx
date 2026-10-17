import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { customerReport, reportStatus } from "@/lib/customer-reports";
import { EmptyState, StatusBadge } from "@/components/ui/workflow-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "One Marketing · 고객 캠페인 보고",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await customerReport(token);
  if (!report) notFound();
  const active = report.projects.filter((p) => p.status !== "cancelled");
  const complete =
    active.length > 0 && active.every((p) => p.status === "completed");
  const tasks = active
    .flatMap((p) => p.tasks)
    .filter((t) => t.status !== "cancelled");
  return (
    <main className="customer-report">
      <header className="report-header">
        <div>
          <span className="ui-eyebrow">원케이션 · 고객 보고</span>
          <h1>{report.customerName}</h1>
          <p>{complete ? "캠페인 완료 보고" : "캠페인 진행 보고"}</p>
        </div>
        <a
          className="ui-button primary report-download"
          href={`/api/reports/${token}/excel`}
        >
          {complete ? "완료 보고" : "진행 보고"} 엑셀 다운로드
        </a>
      </header>
      <p className="muted report-updated">
        최종 업데이트{" "}
        {new Date(report.updatedAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}{" "}
        · 한국 시간
      </p>
      <div className="stats">
        {["블로그", "클립"].map((channel) => (
          <div className="stat" key={channel}>
            <span>{channel} 게시 확인</span>
            <strong>
              {
                tasks.filter(
                  (t) => t.channel === channel && t.status === "verified",
                ).length
              }{" "}
              / {tasks.filter((t) => t.channel === channel).length}건
            </strong>
          </div>
        ))}
        <div className="stat">
          <span>프로젝트 완료</span>
          <strong>
            {active.filter((p) => p.status === "completed").length} /{" "}
            {active.length}건
          </strong>
        </div>
      </div>
      {!report.projects.length && (
        <EmptyState
          title="캠페인 준비 중이에요"
          description="프로젝트가 등록되면 진행 상황을 이곳에서 확인할 수 있어요."
        />
      )}
      {report.projects.map((p, i) => (
        <section className="ui-pane report-project" key={i}>
          <div className="section-title">
            <h2>{p.name}</h2>
            <StatusBadge value={p.status} label={reportStatus(p.status)} />
          </div>
          <p className="muted">마감일 {p.due || "협의 중"}</p>
          {p.keywords && (
            <div className="report-keywords">
              <h3>캠페인 키워드</h3>
              <p>대상 제품 · {p.keywords.productName}</p>
              <p>
                <strong>핵심</strong> {p.keywords.main.join(", ")}
              </p>
              {!!p.keywords.secondary.length && (
                <p>
                  <strong>보조</strong> {p.keywords.secondary.join(", ")}
                </p>
              )}
              <p>{p.keywords.reason}</p>
              <p className="muted">
                확정일{" "}
                {new Date(p.keywords.approvedAt).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                · 제품 관련성과 조사 근거를 바탕으로 선정했어요. 검색량·문서
                수를 측정한 결과는 포함하지 않아요.
              </p>
            </div>
          )}
          <div className="tablewrap">
            <table className="report-table">
              <caption className="sr-only">{p.name} 콘텐츠 진행 현황</caption>
              <thead>
                <tr>
                  {[
                    "참여자",
                    "채널",
                    "콘텐츠명",
                    "게시 링크",
                    "게시 확인일",
                    "상태",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.tasks.map((t, n) => (
                  <tr key={n}>
                    <td data-label="참여자">{t.participant}</td>
                    <td data-label="채널">{t.channel}</td>
                    <td data-label="콘텐츠명">{t.label}</td>
                    <td data-label="게시 링크">
                      {t.link ? (
                        <a
                          href={t.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          게시물 보기 ↗
                        </a>
                      ) : (
                        "등록 대기"
                      )}
                    </td>
                    <td data-label="게시 확인일">
                      {t.verifiedAt
                        ? new Date(t.verifiedAt).toLocaleDateString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : "—"}
                    </td>
                    <td data-label="상태">
                      <StatusBadge
                        value={t.status}
                        label={reportStatus(t.status)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!p.tasks.length && (
            <EmptyState
              title="콘텐츠를 준비하고 있어요"
              description="작업이 등록되면 채널별 진행 상황을 확인할 수 있어요."
            />
          )}
        </section>
      ))}
      <footer className="muted">
        엑셀은 다운로드 시점의 진행 상황을 담습니다. 링크 등록과 운영자의 게시
        확인 상태를 구분해 표시합니다.
      </footer>
    </main>
  );
}
