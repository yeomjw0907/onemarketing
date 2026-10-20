"use client";
import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button, StatusBadge } from "./ui/workflow-ui";
import BrandOrb from "./brand-orb";
import styles from "./dashboard-assistant.module.css";
const names: Record<string, string> = {
  "product-review": "제품 정보 정리",
  research: "키워드 조사",
  copy: "원고 작성·교정·검증",
  image: "이미지 제작",
  video: "영상 제작",
  slideshow: "영상 조합",
  "media-plan": "생성 브리핑",
  scenario: "시나리오 제안",
  profile: "제품 정보",
  name: "제품명",
  category: "종류",
  features: "특징",
  target: "대상",
  salesScope: "판매 방식·지역",
  goal: "목표",
  forbidden: "금지 표현",
  stage: "다음 단계",
  materialNotes: "자료 메모",
  instructions: "제작 지침",
  preferredKeywords: "희망 키워드",
  productLinks: "제품 링크",
  main: "주요 키워드",
  secondary: "보조 키워드",
  reason: "사유",
  decision: "검토 결과",
  candidate: "후보 번호 · 0부터",
  format: "제작 방식",
  taskId: "작업",
  planId: "검토할 기획",
  slotId: "게시 슬롯",
  participantId: "참여자",
  blogAccountId: "블로그 계정",
  clipAccountId: "클립 계정",
  note: "수정 요청",
  major: "주요 수정",
  brief: "생성 브리핑",
};
export default function AssistantWorkflowCard({
  turn,
  busy,
  onConfirm,
  onDismiss,
}: {
  turn: Record<string, any>;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const labels = turn.proposal.labels,
    pending = turn.proposal_status === "pending",
    execution = turn.execution;
  const jobs = execution?.jobs || [],
    running = jobs.some((j: any) => ["pending", "running"].includes(j.status));
  const stages = ["자료 준비", "기획", "제작", "검수", "참여자 전달"];
  const stageIndex = (
    {
      materials: 0,
      planning: 1,
      brief_review: 1,
      producing: 2,
      review: 3,
      ready: 4,
      publishing: 4,
      completed: 4,
    } as Record<string, number>
  )[execution?.project?.status];
  return (
    <section
      className={styles.proposal + " " + styles.workflowProposal}
      aria-label="워크플로우 실행 전 확인"
    >
      <span className={styles.questionEyebrow}>
        {pending ? "실행 전 확인" : "처리 내역"}
      </span>
      <h3>{labels.title}</h3>
      <p className={styles.context}>{labels.targetName}</p>
      <dl>
        {labels.details?.map((d: any, i: number) => (
          <div key={i}>
            <dt>{names[d.label] || d.label}</dt>
            <dd>
              {d.label === "candidate"
                ? `후보 ${Number(d.value) + 1}`
                : d.label === "decision"
                  ? (
                      {
                        approve: "승인",
                        revise: "수정 요청",
                        reject: "반려",
                        edit: "수정",
                        format: "제작 방식 변경",
                      } as Record<string, string>
                    )[d.value] || d.value
                  : d.label === "format"
                    ? (
                        { standard: "기존형", story: "시나리오형" } as Record<
                          string,
                          string
                        >
                      )[d.value] || d.value
                    : d.value}
            </dd>
          </div>
        ))}
        {labels.risk === "paid" && (
          <div>
            <dt>예상 제작비 합계</dt>
            <dd>
              <strong>
                {Number(labels.estimate).toLocaleString("ko-KR")}원
              </strong>
            </dd>
          </div>
        )}
      </dl>
      {labels.budget && (
        <p className={styles.context}>
          제작비 상한 {Number(labels.budget.ceiling).toLocaleString("ko-KR")}원
          · 사용·예약{" "}
          {Number(labels.budget.spent + labels.budget.reserved).toLocaleString(
            "ko-KR",
          )}
          원 · 이번 요청 예상 {Number(labels.estimate).toLocaleString("ko-KR")}
          원
        </p>
      )}
      {labels.documents && (
        <div className={styles.workflowLinks}>
          {labels.documents.map((d: any) => (
            <a key={d.url} href={d.url} target="_blank" rel="noreferrer">
              {d.label}
              <ExternalLink size={13} />
            </a>
          ))}
        </div>
      )}
      {pending ? (
        <>
          <p className={styles.confirmHint}>{labels.warning}</p>
          <label className={styles.reviewCheck}>
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              {labels.risk === "contract"
                ? "견적서·설명서와 계약 내용을 확인했어요."
                : labels.risk === "external"
                  ? "받는 참여자와 전달 내용을 확인했어요."
                  : labels.risk === "paid"
                    ? "작업 대상·수량과 예상 비용을 확인했어요."
                    : "대상과 저장할 내용을 확인했어요."}
            </span>
          </label>
          <div className={styles.proposalActions}>
            <Button
              variant="primary"
              disabled={busy || !reviewed}
              onClick={() => void onConfirm()}
            >
              확인하고{" "}
              {labels.risk === "paid"
                ? "실행"
                : labels.risk === "external"
                  ? "진행"
                  : labels.risk === "contract"
                    ? "확정"
                    : "저장"}
            </Button>
            <Button disabled={busy} onClick={onDismiss}>
              취소
            </Button>
          </div>
        </>
      ) : turn.proposal_status === "saved" ? (
        <>
          <p className={styles.saved}>
            <Check size={15} />
            {turn.save_result?.summary || labels.title + "을 처리했어요."}
          </p>
          {execution?.project && (
            <div className={styles.execution}>
              <div className={styles.executionHeader}>
                <strong>{execution.project.name}</strong>
                <StatusBadge value={execution.project.status} />
              </div>
              <ol className={styles.flowStages}>
                {stages.map((s, i) => (
                  <li
                    key={s}
                    data-current={i === stageIndex}
                    data-done={i < stageIndex}
                  >
                    {s}
                  </li>
                ))}
              </ol>
              <p className={styles.questionHint}>
                결과물 승인 {execution.project.approved} /{" "}
                {execution.project.total}건 · 다음 단계는 별도 확인 후 진행해요.
              </p>
            </div>
          )}
          {!!jobs.length && (
            <div className={styles.execution}>
              <div className={styles.executionHeader}>
                <strong>작업 현황</strong>
                <BrandOrb active={running} size={20} state="working" />
                <span>
                  {jobs.filter((j: any) => j.status === "succeeded").length} /{" "}
                  {jobs.length} 완료
                </span>
              </div>
              <ul className={styles.jobList}>
                {jobs.map((j: any) => (
                  <li key={j.id}>
                    <span>{names[j.type] || j.type}</span>
                    <StatusBadge value={j.status} />
                    {j.error && (
                      <p className={styles.warning}>{String(j.error)}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!execution?.assets?.length && (
            <details className={styles.execution}>
              <summary>제작 결과물 확인 · {execution.assets.length}개</summary>
              <div className={styles.workflowLinks}>
                {execution.assets.map((a: any) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    {a.name}
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <p className={styles.questionHint}>
          {turn.proposal_status === "superseded"
            ? "새 요청으로 대체됐어요. 실행하지 않았어요."
            : "취소한 요청이에요. 실행하지 않았어요."}
        </p>
      )}
    </section>
  );
}
