"use client";
import type { RecordData } from "@/lib/types";
import type { CopyQualityReport } from "@/lib/copy-quality";
import { Button, Feedback, StatusBadge } from "./ui/workflow-ui";
import styles from "./copy-quality-review.module.css";

export default function CopyQualityReview({
  asset,
  previous,
  onReview,
  busy,
}: {
  asset: RecordData;
  previous?: RecordData;
  onReview?: () => void;
  busy: boolean;
}) {
  const report = asset.copyQuality as CopyQualityReport | undefined;
  return (
    <section className={styles.review} aria-label="원고 교정·검증">
      <div className={styles.header}>
        <strong>원고 교정·검증</strong>
        {report && (
          <StatusBadge
            value={report.status === "passed" ? "succeeded" : "changes"}
            label={report.status === "passed" ? "자동 검사 통과" : "승인 보류"}
          />
        )}
      </div>
      {!report ? (
        <p className={styles.hint}>
          수동 입력 또는 기존 원고예요. 교정·별도 검증을 실행해 초안과 비교할 수
          있어요.
        </p>
      ) : (
        <>
          <p className={styles.hint}>
            초안 → 교정 → 별도 검증{report.repaired ? " → 1회 수정·재검증" : ""}{" "}
            ·{" "}
            {report.status === "passed"
              ? "운영자 최종 승인 필요"
              : "보류 항목 해결 후 재검증 필요"}
          </p>
          {report.issues.map((issue, i) => (
            <Feedback
              key={i}
              tone={issue.severity === "blocker" ? "error" : "info"}
            >
              <strong>
                {issue.severity === "blocker" ? "승인 보류" : "확인 권장"} ·{" "}
                {issue.reason}
              </strong>
              {issue.quote && <p>대상 문장: {issue.quote}</p>}
              {issue.evidence && <p>근거: {issue.evidence}</p>}
              {issue.suggestedFix && <p>수정 안내: {issue.suggestedFix}</p>}
            </Feedback>
          ))}
          <details>
            <summary>초안·교정본 비교</summary>
            <div className={styles.comparison}>
              <div>
                <h4>초안</h4>
                <pre>{report.draftText}</pre>
              </div>
              <div>
                <h4>교정·검증본</h4>
                <pre>{report.reviewedText}</pre>
              </div>
            </div>
          </details>
          {report.repaired && (
            <details>
              <summary>재수정 전 교정본과 검증 지적</summary>
              <pre>{report.editedText}</pre>
              {report.firstIssues.map((issue, i) => (
                <p key={i}>{issue.reason}</p>
              ))}
            </details>
          )}
          <details>
            <summary>주요 수정 사항 {report.changes.length}건</summary>
            {report.changes.map((change, i) => (
              <div className={styles.change} key={i}>
                <p>수정 전: {change.before}</p>
                <p>수정 후: {change.after}</p>
                <small>{change.reason}</small>
              </div>
            ))}
          </details>
        </>
      )}
      {!!(report?.previousText || previous?.text) && (
        <details>
          <summary>이전 등록 원고와 비교</summary>
          <div className={styles.comparison}>
            <div>
              <h4>이전 원고</h4>
              <pre>{String(report?.previousText || previous?.text)}</pre>
            </div>
            <div>
              <h4>현재 원고</h4>
              <pre>{String(asset.text || "")}</pre>
            </div>
          </div>
        </details>
      )}
      {onReview && (
        <>
          <Button disabled={busy} onClick={onReview}>
            이 원고 교정·검증
          </Button>
          <p className={styles.hint}>
            교정과 별도 검증에 AI 제작비가 사용돼요. 필요하면 1회
            수정·재검증해요.
          </p>
        </>
      )}
    </section>
  );
}
