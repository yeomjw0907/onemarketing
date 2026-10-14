import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { customerReport, reportStatus } from "@/lib/customer-reports";
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
          <span className="muted">ONE MARKETING · CAMPAIGN REPORT</span>
          <h1>{report.customerName}</h1>
          <p>{complete ? "캠페인 완료 보고" : "캠페인 진행 보고"}</p>
        </div>
        <a className="button-link" href={`/api/reports/${token}/excel`}>
          {complete ? "완료 보고" : "진행 보고"} 엑셀 다운로드
        </a>
      </header>
      <p className="muted">
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
        <section className="section">
          <h2>캠페인 준비 중입니다</h2>
          <p>프로젝트가 등록되면 이 화면에서 진행 상황을 확인할 수 있습니다.</p>
        </section>
      )}
      {report.projects.map((p, i) => (
        <section className="section" key={i}>
          <div className="section-title">
            <h2>{p.name}</h2>
            <span className="badge">{reportStatus(p.status)}</span>
          </div>
          <p className="muted">마감일 {p.due || "협의 중"}</p>
          <div className="tablewrap">
            <table>
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
                    <td>{t.participant}</td>
                    <td>{t.channel}</td>
                    <td>{t.label}</td>
                    <td>
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
                    <td>
                      {t.verifiedAt
                        ? new Date(t.verifiedAt).toLocaleDateString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : "—"}
                    </td>
                    <td>{reportStatus(t.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <footer className="muted">
        엑셀은 다운로드 시점의 진행 상황을 담습니다. 링크 등록과 운영자의 게시
        확인 상태를 구분해 표시합니다.
      </footer>
    </main>
  );
}
