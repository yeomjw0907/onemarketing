"use client";
import {
  aiTypeLabels,
  groupAiCosts,
  totalAiCosts,
  usd,
  type AiCostRow,
} from "@/lib/ai-cost-ledger";
import styles from "./cost-breakdown.module.css";
export default function CostBreakdown({ rows }: { rows: AiCostRow[] }) {
  const groups = groupAiCosts(rows, "type"),
    total = totalAiCosts(rows);
  const max = Math.max(
    0,
    ...groups.flatMap((g) => [g.actualUsd, g.estimatedUsd]),
  );
  return (
    <section className={styles.root} aria-label="선택 범위 비용 시각화">
      <div className={styles.heading}>
        <h3>어떤 제작에 비용을 썼나요?</h3>
        <span>선택한 필터 기준 · USD</span>
      </div>
      <div className={styles.totals}>
        <div>
          <span>
            <i />
            실제 청구 확인
          </span>
          <strong>{total.actualCount ? usd(total.actualUsd) : "미확인"}</strong>
          <small>{total.actualCount}개 기록</small>
        </div>
        <div>
          <span>
            <i className={styles.estimatedKey} />
            사용량 기반 추정
          </span>
          <strong>
            {total.estimatedCount ? usd(total.estimatedUsd) : "미확인"}
          </strong>
          <small>실제 결제액과 다를 수 있어요</small>
        </div>
        <div>
          <span>청구 확인 필요</span>
          <strong>
            {total.pendingCount}
            <small>건</small>
          </strong>
          <small>금액 미확인은 0원과 달라요</small>
        </div>
      </div>
      {groups.length ? (
        <div className={styles.chart}>
          {groups.map((g) => (
            <div className={styles.costRow} key={g.key}>
              <div className={styles.rowHeading}>
                <strong>{aiTypeLabels[g.key] || g.key}</strong>
                <span>
                  실제 {g.actualCount ? usd(g.actualUsd) : "—"} · 추정{" "}
                  {g.estimatedCount ? usd(g.estimatedUsd) : "—"}
                </span>
              </div>
              <div
                className={styles.bars}
                role="img"
                aria-label={`${aiTypeLabels[g.key] || g.key}: 실제 청구 ${g.actualCount ? usd(g.actualUsd) : "미확인"}, 사용량 추정 ${g.estimatedCount ? usd(g.estimatedUsd) : "미확인"}`}
              >
                <div>
                  <span
                    style={{
                      width: max ? `${(g.actualUsd / max) * 100}%` : "0%",
                    }}
                  />
                </div>
                <div>
                  <span
                    className={styles.estimated}
                    style={{
                      width: max ? `${(g.estimatedUsd / max) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>선택한 범위에 비용 기록이 없어요.</p>
      )}
      <p className={styles.note}>
        직접 확정한 원화 비용과 금액 미확인 항목은 USD 막대에 합산하지 않아요.
        상세 내역에서 따로 확인할 수 있어요.
      </p>
    </section>
  );
}
