"use client";
import Link from "next/link";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { requestJSON } from "@/lib/request-json";
import type { PlatformFunnelReport } from "@/lib/platform-funnel";
import styles from "./platform-funnel.module.css";
const date = (ms: number) =>
  new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const labels: Record<string, string> = {
  registered: "등록 계정",
  new: "신청 대기",
  approved: "등록 완료",
  rejected: "미선정·반려",
  applied: "선정 대기",
  selected: "수락 대기",
  accepted: "작업 진행",
  submitted: "검수 대기",
  revision: "수정 요청",
  verified: "지급 대기",
  paid: "지급·입금 완료",
  withdrawn: "철회",
  declined: "거절",
  expired: "기한 만료",
  cancelled: "취소",
  awaiting_payment: "입금 대기",
  ended: "작업 종료",
};
export default function PlatformFunnel() {
  const [from, setFrom] = useState(() => date(Date.now() - 89 * 86400000));
  const [to, setTo] = useState(() => date(Date.now()));
  const [windowDays, setWindow] = useState(30);
  const [data, setData] = useState<PlatformFunnelReport | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function load(start = from, end = to, days = windowDays) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    setData(null);
    try {
      const result = await requestJSON<PlatformFunnelReport>(
        `/api/admin/platform-funnel?${new URLSearchParams({ from: start, to: end, window: String(days) })}`,
      );
      if (generation.current === current) setData(result);
    } catch (e) {
      if (generation.current === current) setError((e as Error).message);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    void load();
  }
  return (
    <main className={styles.page}>
      <Link href="/admin/platform">← 주문·캠페인 운영</Link>
      <h1>가입·전환·정산 분석</h1>
      <p>
        가입부터 첫 행동, 완료·지급까지 실제 저장된 업무 기록으로 병목을
        확인합니다.
      </p>
      <form className={styles.filters} onSubmit={submit}>
        <label>
          시작일
          <input
            type="date"
            required
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            required
            value={to}
            min={from}
            max={date(Date.now())}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          관찰 기간
          <select
            value={windowDays}
            onChange={(e) => setWindow(Number(e.target.value))}
          >
            <option value={7}>7일</option>
            <option value={30}>30일</option>
            <option value={60}>60일</option>
          </select>
        </label>
        <button disabled={busy}>{busy ? "조회 중…" : "조회"}</button>
      </form>
      {error && (
        <p role="alert">
          {error} <Link href="/admin">관리자 로그인 확인</Link>
        </p>
      )}
      {busy && <p role="status">진행률을 계산하고 있어요.</p>}
      {data && (
        <>
          <p className={styles.note}>
            조회 집단: {data.range.from}~{data.range.to} (한국 시간) · 기준 시각{" "}
            {new Date(data.range.asOf).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
            . 각 시작일로부터 {data.range.windowDays}일이 지난 집단만 전환율에
            포함합니다. ‘기간 내 미도달’은 영구 이탈이 아니며, 아직 관찰 중인
            건은 제외합니다. ‘현재 누적’은 관찰 중인 건도 포함한 실제 도달
            수이며 전환율 분모와 다릅니다.
          </p>
          <div className={styles.grid}>
            {data.funnels.map((f) => (
              <section key={f.key} className={styles.card} aria-label={f.title}>
                <h2>{f.title}</h2>
                <p>{f.description}</p>
                <p>
                  <strong>
                    전체 {f.cohort} {f.unit}
                  </strong>{" "}
                  · 관찰 종료 {f.mature} · 관찰 중 {f.pending}
                </p>
                {!f.cohort && (
                  <p>이 기간의 기록이 없습니다. 기간을 넓혀 확인해주세요.</p>
                )}
                {!!f.cohort && !f.mature && (
                  <p>
                    아직 관찰 기간이 끝난 집단이 없어 전환율을 계산하지
                    않습니다.
                  </p>
                )}
                <div
                  className={styles.tableWrap}
                  tabIndex={0}
                  role="region"
                  aria-label={`${f.title} 단계 표 · 좌우로 스크롤 가능`}
                >
                  <table>
                    <caption>
                      {data.range.windowDays}일 내 단계별 도달 · {f.unit} 기준
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">단계</th>
                        <th scope="col">현재 누적</th>
                        <th scope="col">기간 내 도달</th>
                        <th scope="col">이전 단계 대비</th>
                        <th scope="col">기간 내 미도달</th>
                        <th scope="col">중앙 소요일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.steps.map((s, i) => (
                        <tr key={s.label}>
                          <th scope="row">{s.label}</th>
                          <td>{s.observed}</td>
                          <td>{s.reached}</td>
                          <td>
                            {s.conversion === null
                              ? "—"
                              : `${(s.conversion * 100).toFixed(1)}% (${s.reached}/${s.denominator})`}
                          </td>
                          <td>{i ? s.notReached : "—"}</td>
                          <td>
                            {s.medianDays === null
                              ? "—"
                              : `${s.medianDays.toFixed(1)}일`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!!f.missingTiming && (
                  <p className={styles.warning}>
                    시각이 없거나 순서가 맞지 않는 기록 {f.missingTiming}건:
                    확인 가능한 단계까지만 집계했습니다.
                  </p>
                )}
                <details>
                  <summary>전체 조회 집단의 현재 상태</summary>
                  <p>
                    관찰 중인 건도 포함합니다. 위의 기간 내 전환율과 기준이
                    다릅니다.
                  </p>
                  <ul>
                    {Object.entries(f.statuses).map(([status, n]) => (
                      <li key={status}>
                        {labels[status] || "기타 상태"}: {n}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            ))}
          </div>
          <section className={styles.note}>
            <h2>집계 범위와 해석</h2>
            <p>
              가입 화면을 열고 제출하지 않은 방문은 추적하지 않습니다. 기존 견적
              상담 {data.coverage.legacyRequests}건은 새 주문·완료 흐름에서,
              기존 모집 지원 {data.coverage.legacyApplications}건은 ‘기존 모집
              지원 → 완료·정산’에서 별도로 확인합니다. 기존 모집 지원도 참여자
              첫 지원 단계에는 포함합니다.
            </p>
            <p>
              완료 시각이 없는 과거 캠페인 {data.coverage.undatedCompleted}건은
              운영 완료 전환을 추정하지 않습니다. 과거 게시 제출 시각은 재제출로
              갱신됐을 수 있어 실제 최초 도달보다 낮게 집계될 수 있습니다.
              철회·거절·취소를 분모에서 제거하지 않습니다. 재시도와 새로고침은
              건수를 늘리지 않습니다.
            </p>
            <p>
              미도달이 가장 많은 구간을 먼저 확인하되, 공급 부족·선정 대기·검수
              대기·지급 대기처럼 운영상 대기와 사용자 행동을 구분해 개선하세요.
              표본이 적을 때는 비율보다 실제 건수를 확인하세요.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
