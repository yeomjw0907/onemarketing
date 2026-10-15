"use client";
import { dashboard } from "@/lib/dashboard";
import { money, stageLabels, type DatabaseView } from "@/lib/types";
import AiCosts from "./ai-costs";

export default function Dashboard({
  data,
  onOpen,
  onNew,
  onReload,
}: {
  data: DatabaseView;
  onOpen: (id: string, tab: number) => void;
  onNew: () => void;
  onReload: () => Promise<void>;
}) {
  const summary = dashboard(data);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>오늘의 마케팅 업무</h1>
          <p>
            {summary.today} · 진행 중 {summary.rows.length}개 프로젝트
          </p>
        </div>
        <button className="primary" onClick={onNew}>
          프로젝트 시작
        </button>
      </div>
      <div className="stats">
        {[
          ["오늘 마감·지연", `${summary.due}건`, "보류 프로젝트 제외"],
          ["검수·수정 대기", `${summary.reviews}건`, "기획 검수와 결과물 확인"],
          [
            "게시 확인 필요",
            `${summary.unposted}건`,
            "승인 이후 미확인 게시물",
          ],
          [
            "미지급 보수",
            money(summary.unpaid),
            `${summary.unpaidCount}건 · 미정 ${summary.unknownPayoutCount}건 별도`,
          ],
        ].map(([label, value, sub]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <section className="section">
        <div className="section-title">
          <h2>먼저 처리할 일</h2>
          <span className="muted">마감일 순</span>
        </div>
        <div className="actionlist">
          {summary.rows.slice(0, 8).map((r) => (
            <button
              key={r.project.id}
              onClick={() => onOpen(r.project.id, r.tab)}
            >
              <span>
                <strong>{String(r.project.name)}</strong>
                <small>{r.next}</small>
              </span>
              <span className={r.overdue ? "badge orange" : "badge"}>
                {r.project.hold
                  ? "보류"
                  : r.overdue
                    ? "마감 지연"
                    : r.dueToday
                      ? "오늘 마감"
                      : String(r.project.due || "마감 미정")}
              </span>
            </button>
          ))}
        </div>
        {!summary.rows.length && (
          <p className="muted">진행 중인 프로젝트가 없습니다.</p>
        )}
      </section>
      <section className="section">
        <h2>프로젝트 진행 현황</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {[
                  "프로젝트",
                  "단계",
                  "승인 원고 / 이미지 / 영상",
                  "게시 블로그 / 클립",
                  "다음 할 일",
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.project.id}>
                  <td>
                    <button onClick={() => onOpen(r.project.id, 0)}>
                      {String(r.project.name)}
                    </button>
                  </td>
                  <td>
                    {stageLabels[String(r.project.status)] ||
                      String(r.project.status)}
                  </td>
                  <td>
                    {r.copy} / {r.images} / {r.videos}
                  </td>
                  <td>
                    {r.blog} / {r.clip}
                  </td>
                  <td>
                    <button onClick={() => onOpen(r.project.id, r.tab)}>
                      {r.next}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <AiCosts data={data} onReload={onReload} />
    </>
  );
}
