import { aiCostSummary } from "@/lib/ai-cost-summary";
import { money, type RecordData } from "@/lib/types";

export default function AiCosts({ costs }: { costs: RecordData[] }) {
  const summary = aiCostSummary(costs);
  return (
    <section aria-label="AI 사용 비용">
      <h2>AI 사용 비용</h2>
      <div className="stats">
        {[
          [
            "이번 달 AI 비용",
            money(summary.monthlyTotal),
            `${summary.month} · 잠정 ${money(summary.monthlyProvisional)} 포함`,
          ],
          [
            "프로젝트당 평균",
            summary.average === null ? "집계 전" : money(summary.average),
            `전체 기간 · 비용 기록 프로젝트 ${summary.projectCount}건 기준`,
          ],
          [
            "누적 AI 비용",
            money(summary.total),
            "전체 기간 · 재생성 비용 포함",
          ],
          [
            "확인할 잠정 비용",
            money(summary.provisionalTotal),
            `${summary.provisionalCount}건 · 공급사 청구 확인 후 확정`,
          ],
        ].map(([label, value, sub]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <p className="hint">
        시스템에 기록된 AI 제작비 기준입니다. 월 집계는 한국 시간의 비용 등록일
        기준이며, 미기록 청구액과 실행 전 예상비용은 포함하지 않습니다. 평균에는
        진행 중인 프로젝트와 잠정 비용도 포함됩니다.
      </p>
    </section>
  );
}
