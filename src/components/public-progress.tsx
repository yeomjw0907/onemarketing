import {
  Check,
  ArrowRight,
  FileText,
  Send,
  CircleCheck,
  Wallet,
} from "lucide-react";
import {
  publicProgress,
  publicStageLabels,
  participantSteps,
} from "@/lib/public-progress";
import styles from "./public-experience.module.css";
export function PublicProgress({ tasks }: { tasks: { status?: unknown }[] }) {
  const p = publicProgress(tasks);
  return (
    <div className={styles.progress}>
      <div className={styles.progressCaption}>
        <span>게시 확인</span>
        <strong>
          {p.verified}
          <small> / {p.total}건</small>
          <b>{p.percent === null ? "—" : p.percent + "%"}</b>
        </strong>
      </div>
      <div
        className={styles.progressTrack}
        role="img"
        aria-label={
          p.total
            ? p.stages
                .map((n, i) => `${publicStageLabels[i]} ${n}건`)
                .join(", ")
            : "등록된 작업 없음"
        }
      >
        {p.stages.map(
          (n, i) =>
            n > 0 && (
              <span
                key={i}
                className={styles[`stage${i}`]}
                style={{ flex: n }}
              />
            ),
        )}
      </div>
      <div className={styles.progressLegend}>
        {publicStageLabels.map((label, i) => (
          <span key={label}>
            <i className={styles[`stage${i}`]} />
            {label}
            <b>{p.stages[i]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
export function ParticipantSteps({
  task,
}: {
  task: { status?: unknown; payoutStatus?: unknown };
}) {
  if (task.status === "cancelled") return null;
  const steps = participantSteps(task),
    current = steps.findIndex((s) => !s);
  const labels = ["자료 준비", "링크 제출", "게시 확인", "지급 완료"],
    icons = [FileText, Send, CircleCheck, Wallet];
  return (
    <ol className={styles.taskSteps} aria-label="내 작업 진행 단계">
      {labels.map((label, i) => {
        const Icon = icons[i];
        return (
          <li
            key={label}
            className={
              steps[i]
                ? styles.stepDone
                : current === i
                  ? styles.stepCurrent
                  : undefined
            }
            aria-current={current === i ? "step" : undefined}
          >
            {steps[i] ? <Check size={15} /> : <Icon size={15} />}
            <span>
              {label}
              <small>
                {steps[i] ? "완료" : current === i ? "다음 단계" : "대기"}
              </small>
            </span>
            {i < 3 && <ArrowRight className={styles.stepArrow} size={12} />}
          </li>
        );
      })}
    </ol>
  );
}
