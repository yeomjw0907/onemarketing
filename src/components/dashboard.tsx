"use client";
import { useId, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Layers3,
  Plus,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import {
  dashboardVisuals,
  pipelineLabels,
  boardLabels,
  type DashboardRow,
} from "@/lib/dashboard-visualization";
import { runningOrbState } from "@/lib/orb-state";
import { stageLabels, money, type DatabaseView } from "@/lib/types";
import { Button, Tabs } from "./ui/workflow-ui";
import BrandOrb from "./brand-orb";
import AiCosts from "./ai-costs";
import styles from "./dashboard.module.css";

type Open = (
  id: string,
  tab: number,
  workflow?: boolean,
  section?: string,
) => void;
const jobLabels: Record<string, string> = {
  copy: "원고",
  scenario: "시나리오",
  research: "조사·기획",
  "product-review": "제품 정보 정리",
  "media-plan": "생성 브리핑",
  image: "이미지",
  video: "영상",
  slideshow: "슬라이드",
};
const compactDate = (s: string) => (s ? s.slice(5).replace("-", ". ") : "미정");
const time = (s: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(s));
function Pipeline({ row }: { row: DashboardRow }) {
  return (
    <div
      className="dv-pipeline"
      role="img"
      aria-label={
        row.total
          ? row.pipeline.map((n, i) => `${pipelineLabels[i]} ${n}건`).join(", ")
          : "등록된 작업 없음"
      }
    >
      {row.pipeline.map(
        (n, i) =>
          n > 0 && (
            <span
              key={i}
              className={`dv-stage-${i}`}
              style={{ flex: n }}
              title={`${pipelineLabels[i]} ${n}건`}
            />
          ),
      )}
    </div>
  );
}
function Campaign({
  row,
  onOpen,
  board = false,
}: {
  row: DashboardRow;
  onOpen: Open;
  board?: boolean;
}) {
  return (
    <article className={board ? "dv-campaign dv-board-card" : "dv-campaign"}>
      <button
        className="dv-plain dv-campaign-main"
        onClick={() => onOpen(row.project.id, 0)}
      >
        <div className="dv-campaign-top">
          <span className={`dv-campaign-icon dv-tone-${row.board}`}>
            {String(row.project.name || "캠").slice(0, 1)}
          </span>
          <span className="dv-campaign-name">
            <strong>{String(row.project.name)}</strong>
            <small>
              {row.customer} · 블로그{" "}
              {row.tasks.filter((t) => t.channel === "blog").length} · 클립{" "}
              {row.tasks.filter((t) => t.channel === "clip").length}
            </small>
          </span>
          <span
            className={
              row.overdue && !row.project.hold
                ? "dv-date dv-overdue"
                : "dv-date"
            }
          >
            {row.project.hold
              ? "보류"
              : row.project.due
                ? compactDate(String(row.project.due)) + " 마감"
                : "마감 미정"}
            <ChevronRight size={14} />
          </span>
        </div>
        <div className="dv-progress-caption">
          <span>
            게시 확인 <b>{row.verified}</b>
            <small> / {row.total}건</small>
          </span>
          <strong>{row.percent === null ? "—" : row.percent + "%"}</strong>
        </div>
        <Pipeline row={row} />
        <span className="dv-campaign-meta">
          <span>
            {stageLabels[String(row.project.status)] ||
              String(row.project.status)}
          </span>
          {row.openSlots > 0 && (
            <span>
              <Users size={12} />
              미배정 슬롯 {row.openSlots}개
            </span>
          )}
        </span>
      </button>
      <div className="dv-approved">
        <span>
          승인 원고 <b>{row.copy}</b>
        </span>
        <span>
          이미지 <b>{row.images}</b>
        </span>
        <span>
          영상 <b>{row.videos}</b>
        </span>
      </div>
      <div className="dv-channel-counts">
        게시 확인 · 블로그 {row.blog} / 클립 {row.clip}
      </div>
      <button
        className="dv-plain dv-campaign-next"
        onClick={() => onOpen(row.project.id, row.tab)}
      >
        <span>{row.next}</span>
        <ArrowRight size={14} />
      </button>
    </article>
  );
}
export default function Dashboard({
  data,
  onOpen,
  onNew,
  onReload,
}: {
  data: DatabaseView;
  onOpen: Open;
  onNew: () => void;
  onReload: () => Promise<void>;
}) {
  const [view, setView] = useState("overview"),
    [filter, setFilter] = useState("all"),
    [period, setPeriod] = useState<"week" | "month">("week"),
    [query, setQuery] = useState(""),
    [allActions, setAllActions] = useState(false),
    [allJobs, setAllJobs] = useState(false);
  const id = useId(),
    visuals = dashboardVisuals(data),
    { summary, rows, goal } = visuals;
  const chart = visuals[period],
    scale = Math.max(1, ...chart.bars.flatMap((b) => [b.actual, b.planned]));
  const filtered = rows.filter(
    (r) =>
      filter === "all" ||
      (filter === "due" && (r.overdue || r.dueToday) && !r.project.hold) ||
      (filter === "review" &&
        (r.project.status === "brief_review" ||
          r.tasks.some((t) =>
            ["review", "changes"].includes(String(t.status)),
          ))) ||
      (filter === "posting" &&
        r.tasks.some((t) =>
          ["approved", "delivered", "submitted"].includes(String(t.status)),
        )),
  );
  const chartMax = Math.ceil(scale / 5) * 5;
  function chooseFilter(next: string) {
    setFilter(next);
    setView("overview");
    requestAnimationFrame(() =>
      document
        .getElementById(id + "-campaigns")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  const running = visuals.jobs.filter((j) => j.status === "running").length;
  return (
    <div className={styles.root} data-dashboard>
      <div className="dv-heading">
        <div>
          <p className="dv-eyebrow">{summary.today} · 한국 시간</p>
          <h1>
            오늘의 워크스페이스
            <span />
          </h1>
          <p className="dv-subtitle">
            진행 중인 캠페인 {rows.length}개 · 마감·지연 {summary.due}개
          </p>
        </div>
        <Button variant="primary" onClick={onNew}>
          <Plus size={17} />
          프로젝트 시작
        </Button>
      </div>
      <div className="dv-view-tabs">
        <Tabs
          label="대시보드 보기"
          value={view}
          onChange={setView}
          items={[
            { id: "overview", label: "운영 현황" },
            { id: "board", label: "캠페인 보드" },
          ]}
        />
        <span className="dv-week">
          <CalendarDays size={14} />
          {compactDate(visuals.weekStart)} – {compactDate(visuals.weekEnd)}
        </span>
      </div>
      <div
        role="tabpanel"
        aria-label={view === "overview" ? "운영 현황" : "캠페인 보드"}
      >
        {view === "overview" ? (
          <>
            <section className="dv-metrics" aria-label="업무 요약">
              <button className="dv-plain" onClick={() => chooseFilter("due")}>
                <span>
                  오늘 마감·지연
                  <ChevronRight size={14} />
                </span>
                <strong>
                  {summary.due}
                  <small>개</small>
                </strong>
                <div className="dv-metric-hint">
                  <Clock3 size={14} />
                  보류 캠페인 제외
                </div>
              </button>
              <button
                className="dv-plain"
                onClick={() => chooseFilter("review")}
              >
                <span>
                  검수·수정 대기
                  <ChevronRight size={14} />
                </span>
                <strong>
                  {summary.reviews}
                  <small>건</small>
                </strong>
                <div className="dv-mini-dots" aria-hidden>
                  {Array.from({ length: 8 }, (_, i) => (
                    <i
                      key={i}
                      className={i < summary.reviews ? "dv-filled" : ""}
                    />
                  ))}
                </div>
                <small>기획 검수와 결과물 확인</small>
              </button>
              <button
                className="dv-plain"
                onClick={() => chooseFilter("posting")}
              >
                <span>
                  게시 확인 필요
                  <ChevronRight size={14} />
                </span>
                <strong>
                  {summary.unposted}
                  <small>건</small>
                </strong>
                <div className="dv-metric-hint">
                  <FileText size={14} />
                  승인 후 아직 확인되지 않은 게시물
                </div>
              </button>
              <div className="dv-money-metric">
                <span>미지급 보수</span>
                <strong>{money(summary.unpaid)}</strong>
                <div className="dv-metric-hint">
                  <Wallet size={14} />
                  {summary.unpaidCount}건 · 미정 {summary.unknownPayoutCount}건
                  별도
                </div>
                <small>미완료 작업의 예정 보수 포함</small>
              </div>
            </section>
            <div className="dv-grid">
              <div className="dv-primary">
                <section
                  className="dv-panel dv-campaign-panel"
                  id={id + "-campaigns"}
                >
                  <div className="dv-section-heading">
                    <div>
                      <h2>
                        캠페인 진행 현황 <span>{rows.length}</span>
                      </h2>
                      <p>콘텐츠 건수 기준 · 취소 작업 제외</p>
                    </div>
                    <button
                      className="dv-plain dv-text-button"
                      onClick={() => setView("board")}
                    >
                      보드로 보기
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="dv-filters">
                    {[
                      ["all", "전체"],
                      ["due", "마감·지연"],
                      ["review", "검수 필요"],
                      ["posting", "게시 확인"],
                    ].map(([value, label]) => (
                      <button
                        className={
                          "dv-plain dv-filter " +
                          (filter === value ? "dv-selected" : "")
                        }
                        aria-pressed={filter === value}
                        key={value}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="dv-legend">
                    {pipelineLabels.map((label, i) => (
                      <span key={label}>
                        <i className={`dv-stage-${i}`} />
                        {label}
                      </span>
                    ))}
                  </div>
                  {filtered.length ? (
                    filtered.map((row) => (
                      <Campaign
                        key={row.project.id}
                        row={row}
                        onOpen={onOpen}
                      />
                    ))
                  ) : (
                    <p className="dv-empty">
                      {rows.length
                        ? "조건에 맞는 캠페인이 없어요."
                        : "진행 중인 캠페인이 없어요. 프로젝트를 시작해보세요."}
                    </p>
                  )}
                </section>
                <section className="dv-panel dv-achievement">
                  <div className="dv-section-heading">
                    <div>
                      <h2>게시 성과</h2>
                      <p>
                        실제 게시 확인일 기준 · {compactDate(chart.start)}–
                        {compactDate(chart.end)}
                      </p>
                    </div>
                    <div className="dv-period" aria-label="성과 조회 기간">
                      {[
                        ["week", "이번 주"],
                        ["month", "이번 달"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={
                            "dv-plain " +
                            (period === value ? "dv-selected" : "")
                          }
                          aria-pressed={period === value}
                          onClick={() => setPeriod(value as "week" | "month")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="dv-achievement-body">
                    <div className="dv-chart-area">
                      <div className="dv-chart-total">
                        <strong>
                          {chart.actual}
                          <small>건</small>
                        </strong>
                        <span>게시 확인 완료</span>
                      </div>
                      <div className="dv-chart">
                        <div className="dv-grid-lines" aria-hidden>
                          <span>{chartMax}</span>
                          <span>{chartMax / 2}</span>
                          <span>0</span>
                        </div>
                        <div className="dv-bars">
                          {chart.bars.map((b) => (
                            <div className="dv-bar-group" key={b.start}>
                              <div className="dv-bar-tracks">
                                <span
                                  className="dv-bar"
                                  style={{
                                    height: `${(b.actual / chartMax) * 100}%`,
                                  }}
                                  title={`${b.label} 게시 확인 ${b.actual}건`}
                                />
                                <span
                                  className="dv-bar dv-forecast"
                                  style={{
                                    height: `${(b.planned / chartMax) * 100}%`,
                                  }}
                                  title={`${b.label} 마감 예정·미완료 ${b.planned}건`}
                                />
                              </div>
                              <small>{b.label}</small>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="dv-chart-key">
                        <span>
                          <i />
                          게시 확인
                        </span>
                        <span>
                          <i className="dv-forecast" />
                          마감 예정·미완료
                        </span>
                      </div>
                      <details className="dv-chart-data">
                        <summary>일자별 수량 보기</summary>
                        <table>
                          <thead>
                            <tr>
                              <th>기간</th>
                              <th>게시 확인</th>
                              <th>마감 예정·미완료</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chart.bars.map((b) => (
                              <tr key={b.start}>
                                <th scope="row">
                                  {b.start}–{b.end}
                                </th>
                                <td>{b.actual}건</td>
                                <td>{b.planned}건</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </div>
                    <div className="dv-goal">
                      <div className="dv-ring">
                        <svg
                          viewBox="0 0 120 120"
                          role="img"
                          aria-label={
                            goal.total
                              ? `이번 주 마감 ${goal.total}건 중 ${goal.done}건 게시 확인`
                              : "이번 주 마감 일정 없음"
                          }
                        >
                          <circle cx="60" cy="60" r="49" />
                          <circle
                            className="dv-ring-value"
                            cx="60"
                            cy="60"
                            r="49"
                            strokeDasharray={`${goal.total ? (goal.done / goal.total) * 307.9 : 0} 307.9`}
                          />
                        </svg>
                        <div>
                          <strong>
                            {goal.total
                              ? Math.round((goal.done / goal.total) * 100)
                              : "—"}
                            {goal.total > 0 && <small>%</small>}
                          </strong>
                          <span>주간 마감 작업</span>
                        </div>
                      </div>
                      <strong>
                        {goal.total
                          ? `${goal.total}건 중 ${goal.done}건 확인`
                          : "마감 일정이 없어요"}
                      </strong>
                      <p>
                        {goal.total
                          ? `${goal.total - goal.done}건 게시 확인 필요`
                          : "저장된 작업 일정으로 집계해요"}
                      </p>
                    </div>
                  </div>
                  <p className="dv-chart-note">
                    보류 캠페인은 마감 예정에서 제외해요. 일정 미등록{" "}
                    {visuals.undated}건은 예정 집계에서, 게시 확인일 미기록{" "}
                    {visuals.undatedVerified}건은 실적 집계에서 제외해요.
                  </p>
                </section>
              </div>
              <div className="dv-secondary">
                <section className="dv-panel dv-today">
                  <div className="dv-section-heading">
                    <h2>
                      먼저 처리할 일 <span>{visuals.actions.length}</span>
                    </h2>
                    <span className="dv-muted">유지 이상·마감순</span>
                  </div>
                  {visuals.actions
                    .slice(0, allActions ? undefined : 5)
                    .map(({ project, action, overdue, dueToday }) => (
                      <button
                        className="dv-plain dv-todo"
                        key={project.id}
                        onClick={() =>
                          onOpen(
                            project.id,
                            action.tab ?? 0,
                            action.workflow,
                            ["recovery", "partial_payment"].includes(action.key)
                              ? "review"
                              : "assignment",
                          )
                        }
                      >
                        <span className="dv-todo-meta">
                          <span>{action.title}</span>
                          <small
                            className={
                              action.key === "recovery" || overdue
                                ? "dv-urgent"
                                : ""
                            }
                          >
                            {action.key === "recovery"
                              ? "유지 이상"
                              : project.hold
                                ? "보류"
                                : overdue
                                  ? "마감 지연"
                                  : dueToday
                                    ? "오늘 마감"
                                    : compactDate(String(project.due || ""))}
                          </small>
                        </span>
                        <strong>
                          {String(project.name)}
                          <ChevronRight size={15} />
                        </strong>
                        <p>{action.description}</p>
                        <span className="dv-todo-count">
                          {action.count}건 확인하기
                          <ArrowRight size={13} />
                        </span>
                      </button>
                    ))}
                  {!visuals.actions.length && (
                    <p className="dv-empty">지금 처리할 일이 없어요.</p>
                  )}
                  {visuals.actions.length > 5 && (
                    <button
                      className="dv-plain dv-more"
                      onClick={() => setAllActions(!allActions)}
                    >
                      {allActions
                        ? "접기"
                        : `전체 ${visuals.actions.length}개 보기`}
                    </button>
                  )}
                </section>
                <section className="dv-ai">
                  <div className="dv-section-heading">
                    <h2>AI 작업</h2>
                    <span className="dv-live">실행 중 {running}개</span>
                  </div>
                  {visuals.jobs.slice(0, allJobs ? undefined : 4).map((j) => {
                    const phase = [...data.job_logs]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .find(
                        (l) =>
                          l.jobId === j.id &&
                          [
                            "copy_draft",
                            "copy_edit",
                            "copy_verify",
                            "copy_repair",
                            "copy_reverify",
                          ].includes(String(l.stage)),
                      )?.stage;
                    const state = runningOrbState(
                      { status: j.status, type: j.type },
                      phase,
                    );
                    return (
                      <button
                        className="dv-plain dv-ai-job"
                        key={j.id}
                        onClick={() => onOpen(String(j.projectId), 5)}
                      >
                        {state ? (
                          <BrandOrb
                            active
                            state={state}
                            size={
                              j.id ===
                              visuals.jobs.find(
                                (job) => job.status === "running",
                              )?.id
                                ? 64
                                : 20
                            }
                          />
                        ) : (
                          <Clock3 size={18} />
                        )}
                        <span>
                          <strong>
                            {String(
                              data.projects.find((p) => p.id === j.projectId)
                                ?.name || "프로젝트",
                            )}
                          </strong>
                          <small>
                            {jobLabels[String(j.type)] || "AI 작업"} ·{" "}
                            {stageLabels[String(j.status)] || String(j.status)}
                          </small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
                  {!visuals.jobs.length && (
                    <p className="dv-empty">실행·대기 중인 AI 작업이 없어요.</p>
                  )}
                  {visuals.jobs.length > 4 && (
                    <button
                      className="dv-plain dv-more"
                      onClick={() => setAllJobs(!allJobs)}
                    >
                      {allJobs ? "접기" : `전체 ${visuals.jobs.length}개 보기`}
                    </button>
                  )}
                  <p className="dv-ai-note">
                    완료한 작업은 프로젝트에서 검수할 수 있어요.
                  </p>
                </section>
                <section className="dv-recent">
                  <h2>최근 완료</h2>
                  {visuals.recent.map((item) => (
                    <button
                      className="dv-plain dv-activity"
                      key={item.id}
                      onClick={() => onOpen(item.projectId, item.tab)}
                    >
                      <span className="dv-check">
                        <Check size={12} />
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{time(item.date)}</small>
                      </span>
                    </button>
                  ))}
                  {!visuals.recent.length && (
                    <p className="dv-empty">
                      날짜가 기록된 완료 내역이 없어요.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </>
        ) : (
          <section className="dv-board">
            <div className="dv-board-toolbar">
              <label className="dv-search">
                <Search size={17} />
                <input
                  aria-label="캠페인·고객 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="캠페인·고객 검색"
                />
              </label>
              <span>캠페인 대표 단계 · 모집은 제작과 병행할 수 있어요</span>
            </div>
            <div className="dv-legend">
              {pipelineLabels.map((label, i) => (
                <span key={label}>
                  <i className={`dv-stage-${i}`} />
                  {label}
                </span>
              ))}
            </div>
            <div className="dv-board-columns">
              {boardLabels.map((label, i) => (
                <section className="dv-board-column" key={label}>
                  <h2>
                    <Layers3 size={16} />
                    {label}
                    <span>
                      {
                        rows.filter(
                          (r) =>
                            r.board === i &&
                            (!query ||
                              `${r.project.name} ${r.customer}`
                                .toLocaleLowerCase()
                                .includes(query.toLocaleLowerCase())),
                        ).length
                      }
                    </span>
                  </h2>
                  {rows
                    .filter(
                      (r) =>
                        r.board === i &&
                        (!query ||
                          `${r.project.name} ${r.customer}`
                            .toLocaleLowerCase()
                            .includes(query.toLocaleLowerCase())),
                    )
                    .map((row) => (
                      <Campaign
                        key={row.project.id}
                        row={row}
                        board
                        onOpen={onOpen}
                      />
                    ))}
                  {!rows.some(
                    (r) =>
                      r.board === i &&
                      (!query ||
                        `${r.project.name} ${r.customer}`
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase())),
                  ) && <p className="dv-empty">해당 캠페인이 없어요.</p>}
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="dv-costs">
        <AiCosts data={data} onReload={onReload} />
      </div>
    </div>
  );
}
