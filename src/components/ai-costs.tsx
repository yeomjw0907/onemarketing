"use client";
import CostBreakdown from "./cost-breakdown";
import costStyles from "./cost-breakdown.module.css";
import { SignalRail } from "./workspace-visuals";
import { useEffect, useState } from "react";
import {
  aiCostLedger,
  aiTypeLabels,
  groupAiCosts,
  koreanDay,
  totalAiCosts,
  usd,
} from "@/lib/ai-cost-ledger";
import { money, type DatabaseView } from "@/lib/types";
import { toKrw, type ExchangeRate } from "@/lib/currency";
import { anthropicPricingSource } from "@/lib/anthropic-cost";
export default function AiCosts({
  data,
  projectId,
  onReload,
}: {
  data: DatabaseView;
  projectId?: string;
  onReload: () => Promise<void>;
}) {
  const [fx, setFx] = useState<ExchangeRate | null>(null),
    [fxBusy, setFxBusy] = useState(false),
    [fxError, setFxError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setFxBusy(true);
    fetch("/api/exchange-rate", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "환율 조회 실패");
        if (!controller.signal.aborted) {
          setFx(data);
          setFxError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setFxError(e instanceof Error ? e.message : "환율 조회 실패");
      })
      .finally(() => {
        if (!controller.signal.aborted) setFxBusy(false);
      });
    return () => controller.abort();
  }, []);
  async function refreshFx() {
    setFxBusy(true);
    setFxError("");
    try {
      const response = await fetch("/api/exchange-rate", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "환율 조회 실패");
      setFx(data);
    } catch (e) {
      setFxError(e instanceof Error ? e.message : "환율 조회 실패");
    } finally {
      setFxBusy(false);
    }
  }
  function krw(value: number | null) {
    const amount = toKrw(value, fx?.rate || null);
    return amount === null
      ? value === null
        ? "—"
        : fxBusy
          ? "환율 조회 중"
          : "환산 불가"
      : "약 " + money(amount);
  }
  function amount(value: number | null, exact = false) {
    return (
      <>
        {usd(value, exact)}
        {value !== null && (
          <small className="muted" style={{ display: "block" }}>
            {krw(value)}
          </small>
        )}
      </>
    );
  }
  function cardAmount(value: number | null) {
    return (
      <>
        {fx && value !== null ? krw(value) : usd(value)}
        {value !== null && (
          <small
            className="muted"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 400,
              lineHeight: 1.6,
            }}
          >
            {fx ? usd(value) : krw(value)}
          </small>
        )}
      </>
    );
  }
  function amountText(value: number | null, exact = false) {
    return usd(value, exact) + (value === null ? "" : ` (${krw(value)})`);
  }
  const today = koreanDay(new Date()),
    month = today.slice(0, 7);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [project, setProject] = useState(projectId || ""),
    [provider, setProvider] = useState(""),
    [group, setGroup] = useState<"individual" | "projectId" | "day" | "month">(
      "projectId",
    ),
    [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const all = aiCostLedger(data).filter(
    (r) => !projectId || r.projectId === projectId,
  );
  const scope = all.filter(
    (r) =>
      (!project || r.projectId === project) &&
      (!provider || r.provider === provider),
  );
  const rows = all.filter(
    (r) =>
      (!project || r.projectId === project) &&
      (!provider || r.provider === provider) &&
      (!from || r.day >= from) &&
      (!to || r.day <= to),
  );
  const total = totalAiCosts(rows),
    lifetime = totalAiCosts(scope),
    monthly = totalAiCosts(scope.filter((r) => r.month === month)),
    daily = totalAiCosts(scope.filter((r) => r.day === today));
  const groups = group === "individual" ? [] : groupAiCosts(rows, group);
  const totalPages = Math.max(
    1,
    Math.ceil((group === "individual" ? rows.length : groups.length) / 30),
  );
  const currentPage = Math.min(page, totalPages - 1);
  async function sync() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/ai-costs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projectId || project || undefined }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await onReload();
      setMessage(
        `fal ${result.matched}/${result.checked}개 요청 청구 확인 · 미반영 ${result.pending}개${result.older ? ` · 90일 이전 ${result.older}개는 저장된 내역 유지` : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "청구 조회 실패");
    } finally {
      setBusy(false);
    }
  }
  const projectName = (id: string) =>
    String(data.projects.find((p) => p.id === id)?.name || "프로젝트 미지정");
  function figures(t: ReturnType<typeof totalAiCosts>) {
    return (
      <>
        <td>{amount(t.actualCount ? t.actualUsd : null)}</td>
        <td>{amount(t.estimatedCount ? t.estimatedUsd : null)}</td>
        <td>
          {krw(
            t.actualCount + t.estimatedCount
              ? Math.round((t.actualUsd + t.estimatedUsd) * 1e9) / 1e9
              : null,
          )}
        </td>
        <td>{t.confirmedKrwCount ? money(t.confirmedKrw) : "—"}</td>
        <td>
          {t.pendingCount
            ? `${t.pendingCount}건 · ${t.pendingKrw ? money(t.pendingKrw) : "금액 미확인"}`
            : "—"}
        </td>
      </>
    );
  }
  return (
    <section
      className={`section ${costStyles.section}`}
      aria-label="AI 사용 비용"
    >
      <div className="section-title">
        <h2>AI 사용 비용 · 실제 청구와 사용량</h2>
        <button disabled={busy} onClick={sync}>
          {busy ? "fal 청구 확인 중…" : "fal 실제 청구 확인 · 최근 90일"}
        </button>
      </div>
      <div className={`row ${costStyles.fx}`}>
        <p className="hint">
          {fx ? (
            <>
              적용 환율: 1 USD ={" "}
              {fx.rate.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}원
              · 기준일 {fx.date} ·{" "}
              <a href={fx.sourceUrl} target="_blank" rel="noreferrer">
                {fx.source}
              </a>
              {fx.stale ? " · 재조회 실패: 마지막 확인 환율 사용" : ""}
            </>
          ) : fxBusy ? (
            "기준 환율을 조회하고 있습니다."
          ) : (
            "환율 미확인 · USD로 표시합니다."
          )}
        </p>
        <button disabled={fxBusy} onClick={refreshFx}>
          {fxBusy ? "환율 조회 중…" : "환율 재조회"}
        </button>
      </div>
      {fxError && (
        <p role="alert">
          {fxError}
          {fx ? " 마지막 확인 환율로 환산합니다." : ""}
        </p>
      )}
      <SignalRail
        items={[
          {
            label: "오늘 실제 청구",
            value: cardAmount(daily.actualCount ? daily.actualUsd : null),
            note: today,
          },
          {
            label: "이번 달 실제 청구",
            value: cardAmount(monthly.actualCount ? monthly.actualUsd : null),
            note: month,
          },
          {
            label: "누적 실제 청구",
            value: cardAmount(lifetime.actualCount ? lifetime.actualUsd : null),
            note: "저장된 공급사 청구액",
          },
          {
            label: "선택 범위 사용량 추정",
            value: cardAmount(total.estimatedCount ? total.estimatedUsd : null),
            note: "실제 청구와 별도",
          },
        ]}
      />
      <div className={`row ${costStyles.filters}`}>
        <label>
          시작일
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {!projectId && (
          <label>
            프로젝트
            <select
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setPage(0);
              }}
            >
              <option value="">전체 프로젝트</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          공급사
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(0);
            }}
          >
            <option value="">전체 공급사</option>
            <option value="fal">fal</option>
            <option value="Claude">Claude</option>
            <option value="수동 확정">원화 수동 확정</option>
            <option value="미확인">미확인</option>
          </select>
        </label>
        <button
          onClick={() => {
            setFrom(today);
            setTo(today);
            setPage(0);
          }}
        >
          오늘
        </button>
        <button
          onClick={() => {
            setFrom(month + "-01");
            setTo(today);
            setPage(0);
          }}
        >
          이번 달
        </button>
        <button
          onClick={() => {
            setFrom("");
            setTo("");
            setPage(0);
          }}
        >
          전체 기간
        </button>
      </div>
      {from && to && from > to && (
        <p role="alert">시작일을 종료일 이전으로 선택하세요.</p>
      )}
      <CostBreakdown rows={rows} />
      <details className={costStyles.ledger}>
        <summary>청구·사용량 상세 내역 · {rows.length}개 기록</summary>
        <p className="hint">
          선택 범위 합계: 실제 청구{" "}
          {amountText(total.actualCount ? total.actualUsd : null, true)} ·
          사용량 추정{" "}
          {amountText(total.estimatedCount ? total.estimatedUsd : null, true)} ·
          원화 확정 {money(total.confirmedKrw)} · 청구 확인 필요{" "}
          {total.pendingCount}건
          {total.pendingCount ? ` (원화 잠정 ${money(total.pendingKrw)})` : ""}
        </p>
        <p>
          <strong>
            선택 범위 예상 총사용 비용:{" "}
            {amountText(
              Math.round((total.actualUsd + total.estimatedUsd) * 1e9) / 1e9,
              true,
            )}
          </strong>
          <span className="hint">
            {" "}
            · 실제 USD + 추정 USD · 확정 청구 합계가 아니며 직접 기록한
            원화·미확인 비용은 제외
          </span>
        </p>
        <div className="tablewrap">
          <table>
            <caption>종류별 합계 · 선택한 필터 적용</caption>
            <thead>
              <tr>
                {[
                  "종류",
                  "실제 청구 · USD / 원화환산",
                  "사용량 추정 · USD / 원화환산",
                  "예상 합계 · 환산원화",
                  "확정 원화",
                  "미확인 · 원화 잠정",
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupAiCosts(rows, "type").map((t) => (
                <tr key={t.key}>
                  <td>{aiTypeLabels[t.key] || t.key}</td>
                  {figures(t)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>합계</th>
                {figures(total)}
              </tr>
            </tfoot>
          </table>
        </div>
        <label>
          상세 집계
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value as typeof group);
              setPage(0);
            }}
          >
            <option value="individual">개별 API 요청·비용</option>
            <option value="projectId">프로젝트별</option>
            <option value="day">일별</option>
            <option value="month">월별</option>
          </select>
        </label>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {[
                  group === "individual" ? "요청·작업" : "집계 기준",
                  "실제 청구 · USD / 원화환산",
                  "사용량 추정 · USD / 원화환산",
                  "예상 합계 · 환산원화",
                  "확정 원화",
                  "미확인 · 원화 잠정",
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group === "individual"
                ? rows
                    .slice(currentPage * 30, (currentPage + 1) * 30)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>
                            {aiTypeLabels[r.type] || r.type} · {r.provider}
                          </strong>
                          <small style={{ display: "block" }}>
                            {r.day} · {projectName(r.projectId)} ·{" "}
                            {String(
                              data.tasks.find((t) => t.id === r.taskId)?.name ||
                                "프로젝트 전체",
                            )}
                          </small>
                          <details>
                            <summary>요청·사용량 근거</summary>
                            <p>{r.model || "모델 미기록"}</p>
                            <p>요청 ID: {r.requestId || "미기록"}</p>
                            {r.checkedAt && (
                              <p>
                                청구 확인:{" "}
                                {new Date(r.checkedAt).toLocaleString("ko-KR", {
                                  timeZone: "Asia/Seoul",
                                })}
                              </p>
                            )}
                            {r.usage && (
                              <p>
                                입력 {r.usage.inputTokens} · 출력{" "}
                                {r.usage.outputTokens} · 캐시 읽기{" "}
                                {r.usage.cacheReadTokens} · 캐시 쓰기{" "}
                                {r.usage.cacheWriteTokens} · 검색{" "}
                                {r.usage.searches}회 · 단가 기준{" "}
                                {r.usage.pricingDate}
                              </p>
                            )}
                          </details>
                        </td>
                        <td>{amount(r.actualUsd, true)}</td>
                        <td>{amount(r.estimatedUsd, true)}</td>
                        <td>
                          {krw(
                            r.actualUsd !== null || r.estimatedUsd !== null
                              ? (r.actualUsd || 0) + (r.estimatedUsd || 0)
                              : null,
                          )}
                        </td>
                        <td>
                          {r.confirmedKrw === null
                            ? "—"
                            : money(r.confirmedKrw)}
                        </td>
                        <td>
                          {r.pendingKrw === null
                            ? r.actualUsd === null &&
                              r.estimatedUsd === null &&
                              r.confirmedKrw === null
                              ? "금액 미확인"
                              : "—"
                            : money(r.pendingKrw)}
                        </td>
                      </tr>
                    ))
                : groups
                    .slice(currentPage * 30, (currentPage + 1) * 30)
                    .map((t) => (
                      <tr key={t.key}>
                        <td>
                          {group === "projectId" ? projectName(t.key) : t.key}
                          <small style={{ display: "block" }}>
                            {t.count}개 비용·요청 기록
                          </small>
                        </td>
                        {figures(t)}
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="hint">선택한 범위에 기록된 AI 비용이 없습니다.</p>
        )}
        {totalPages > 1 && (
          <div className="row">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              이전
            </button>
            <span>
              {currentPage + 1} / {totalPages}
            </span>
            <button
              disabled={currentPage + 1 >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              다음
            </button>
          </div>
        )}
      </details>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <details className={costStyles.notes}>
        <summary>계산 기준과 제외 항목</summary>
        <p className="hint">
          환산원화는 표시된 최신 확인 환율을 모든 기간에 동일 적용한 참고
          금액입니다. 실제 카드 결제액이나 회계상 확정 원가가 아니며 기존 원화
          예산·정산을 변경하지 않습니다. 합계는 USD 합산 후 원 단위로
          반올림합니다. 실제 청구가 확인되면 같은 요청의 원화 잠정 금액은 이
          집계에서 제외합니다. 날짜는 한국 시간의 공급사 청구 발생일 또는 API
          응답·비용 등록일이며, 청구 조회일은 아닙니다. 실패·재생성 비용도
          기록이 있으면 포함합니다. 이 플랫폼의 요청만 집계하므로 fal에서 별도로
          실행한 작업은 포함되지 않습니다.
        </p>
        <p className="hint">
          Claude는 API 사용량과{" "}
          <a href={anthropicPricingSource} target="_blank" rel="noreferrer">
            공식 단가
          </a>{" "}
          기준 추정치입니다. 프로모션 크레딧·계약 할인·세금·카드 환율이 반영된
          실제 결제액은 아닙니다. 확인할 수 없는 모델·사용량은 미확인으로
          표시합니다.
        </p>
      </details>
    </section>
  );
}
