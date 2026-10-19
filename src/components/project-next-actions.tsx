"use client";
import { projectActions, reviewEligibleTime } from "@/lib/workflow-guidance";
import type { DatabaseView, RecordData } from "@/lib/types";
import styles from "./workflow-guidance.module.css";
export default function ProjectNextActions({
  data,
  project,
  onOpen,
}: {
  data: DatabaseView;
  project: RecordData;
  onOpen: (tab?: number, workflow?: boolean, key?: string) => void;
}) {
  const actions = projectActions(data, project);
  const waiting = data.tasks.filter(
    (t) =>
      t.projectId === project.id &&
      t.status === "submitted" &&
      reviewEligibleTime(t) > Date.now(),
  ).length;
  return (
    <section className={styles.section} aria-label="프로젝트 다음 할 일">
      <div className={styles.heading}>
        <h2>지금 할 일</h2>
        <span className="muted">프로젝트 상태에 따라 안내해요</span>
      </div>
      {(project.hold || project.settled || project.status === "cancelled") &&
      !actions.length ? (
        <p className="muted">
          {project.hold
            ? "보류 중이에요. 보류를 해제한 뒤 진행해주세요."
            : "마감된 프로젝트예요. 기존 진행 기록을 확인할 수 있어요."}
        </p>
      ) : actions.length ? (
        <ul className={styles.actions}>
          {actions.map((a) => (
            <li key={a.key}>
              <button
                className={styles.action}
                onClick={() => onOpen(a.tab, a.workflow, a.key)}
              >
                <span>
                  <strong>
                    {a.title} <span className={styles.count}>{a.count}건</span>
                  </strong>
                  <small>{a.description}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          지금 처리할 일은 없어요. 진행 중인 작업은 아래에서 확인할 수 있어요.
        </p>
      )}
      {waiting > 0 && (
        <p className="hint">
          제출 후 3일 검수 대기 중인 작업 {waiting}건은 검수 가능일에 표시돼요.
        </p>
      )}
    </section>
  );
}
