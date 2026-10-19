"use client";
import { useState } from "react";
import type { DatabaseView, RecordData } from "@/lib/types";
import { taskFlow, type Scenario } from "@/lib/creative-schema";
import { Button, Feedback, StatusBadge } from "./ui/workflow-ui";
import styles from "./creative-studio.module.css";
export default function CreativeStudio({
  project,
  data,
  reload,
  onTask,
  estimate,
}: {
  project: RecordData;
  data: DatabaseView;
  reload: () => Promise<void>;
  onTask: (id: string) => void;
  estimate: number;
}) {
  const tasks = data.tasks.filter(
    (t) => t.projectId === project.id && t.status !== "cancelled",
  );
  const clips = tasks.filter((t) => t.channel === "clip");
  const [id, setId] = useState(clips[0]?.id || "");
  const task = clips.find((t) => t.id === id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  const plans = data.media_plans.filter(
    (p) => p.taskId === id && p.mediaType === "scenario",
  );
  const active = data.jobs.some(
    (j) =>
      j.taskId === id &&
      ["pending", "running", "uncertain"].includes(String(j.status)),
  );
  const locked =
    !task ||
    project.hold === true ||
    project.settled === true ||
    !["producing", "review"].includes(String(project.status)) ||
    ["approved", "delivered", "submitted", "verified"].includes(
      String(task.status),
    );
  async function post(url: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  const review = (action: string, extra: object = {}) =>
    post("/api/creative-plans", {
      taskId: id,
      version: task?.version,
      action,
      ...extra,
    });
  return (
    <div className={styles.studio}>
      <section className="section" aria-label="실제 제작 흐름">
        <div className={styles.heading}>
          <h2>제작 흐름</h2>
          <span className="badge blue">
            클립{" "}
            {
              clips.filter((t) =>
                ["approved", "delivered", "submitted", "verified"].includes(
                  String(t.status),
                ),
              ).length
            }{" "}
            / {clips.length}건 승인
          </span>
        </div>
        <p className={styles.hint}>
          실제 작업·생성 요청·브리핑·승인본을 바탕으로 표시해요. 단계를 누르면
          해당 작업의 제작 브리핑으로 이동해요.
        </p>
        {tasks.map((t) => (
          <details key={t.id} open={t.id === id}>
            <summary className={styles.flowTitle}>
              {String(t.name)} ·{" "}
              {t.channel === "blog"
                ? "블로그"
                : t.creativeFormat === "story"
                  ? "시나리오형"
                  : "기존형"}
            </summary>
            <div className={styles.flow}>
              {taskFlow(data, t).map((n) => (
                <button
                  className={styles.node}
                  key={n.id}
                  onClick={() => onTask(t.id)}
                >
                  <strong>{n.title}</strong>
                  <StatusBadge value={n.state} />
                </button>
              ))}
            </div>
          </details>
        ))}
      </section>
      {!!clips.length && (
        <section className="section" aria-label="클립 기획 스튜디오">
          <h2>클립 기획</h2>
          <p className={styles.hint}>
            계약 수량은 유지하고 작업별 제작 방식을 선택해요. 시나리오 승인은
            영상 생성 승인이 아니에요.
          </p>
          <label>
            클립 작업
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setError("");
                setReason("");
              }}
            >
              {clips.map((t) => (
                <option value={t.id} key={t.id}>
                  {String(t.name)}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <Button
              disabled={busy || active || locked}
              variant={
                task?.creativeFormat !== "story" ? "primary" : "secondary"
              }
              onClick={() => review("format", { format: "standard" })}
            >
              기존형
            </Button>
            <Button
              disabled={busy || active || locked}
              variant={
                task?.creativeFormat === "story" ? "primary" : "secondary"
              }
              onClick={() => review("format", { format: "story" })}
            >
              시나리오형
            </Button>
          </div>
          {task?.creativeFormat !== "story" ? (
            <p className={styles.hint}>
              기존형은 기준 사진·한 장면 중심으로 제작해요. 아래에서 기준 사진과
              자막·CTA를 검토한 후 생성하세요.
            </p>
          ) : (
            <>
              <label>
                기획 요청·수정 방향
                <textarea
                  maxLength={3000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 가족 상황극 대신 서비스 사용 과정을 보여주세요. 반려·수정 요청 시 사유를 입력하세요."
                />
              </label>
              <Button
                variant="primary"
                busy={busy}
                disabled={active || locked}
                onClick={() =>
                  post("/api/jobs", {
                    projectId: project.id,
                    taskId: id,
                    type: "scenario",
                    estimate,
                    key: crypto.randomUUID(),
                    generationRequest: reason,
                  })
                }
              >
                시나리오 3개 제안 · 예상 {estimate.toLocaleString()}원
              </Button>
              {active && (
                <p role="status" className={styles.hint}>
                  작업 처리 중이에요. 완료되면 목록에 반영돼요.
                </p>
              )}
              {plans.map((plan) => (
                <div key={plan.id}>
                  <div className={styles.heading}>
                    <h3>시나리오 후보</h3>
                    <StatusBadge
                      value={plan.status}
                      label={
                        {
                          draft: "검토 대기",
                          changes: "수정 요청",
                          rejected: "반려",
                          approved: "승인",
                          superseded: "이전 승인안",
                        }[String(plan.status)] || String(plan.status)
                      }
                    />
                  </div>
                  {!!plan.reason && (
                    <Feedback tone="info">
                      검토 사유: {String(plan.reason)}
                    </Feedback>
                  )}
                  <div className={styles.candidates}>
                    {(
                      (plan.proposal as { candidates: Scenario[] })
                        ?.candidates || []
                    ).map((c, i) => (
                      <article className={styles.candidate} key={i}>
                        <span className="badge">후보 {i + 1}</span>
                        <h3>{c.title}</h3>
                        <p>{c.concept}</p>
                        <p className={styles.hint}>
                          타깃: {c.target}
                          <br />
                          제안 이유: {c.rationale}
                        </p>
                        <details>
                          <summary>장면·자막·필요 자료</summary>
                          <ol>
                            {c.scenes.map((s, n) => (
                              <li key={n}>
                                <strong>
                                  {s.seconds}초 ·{" "}
                                  {
                                    {
                                      source: "실제 사진",
                                      generated: "AI 연출",
                                      footage: "실제 촬영",
                                    }[s.method]
                                  }
                                </strong>
                                <p>
                                  {s.visual}
                                  <br />
                                  자막: {s.caption}
                                  <br />
                                  필요 자료: {s.requirements}
                                </p>
                              </li>
                            ))}
                          </ol>
                          <p>CTA: {c.cta}</p>
                          <ul>
                            {c.risks.map((r, n) => (
                              <li key={n}>{r}</li>
                            ))}
                          </ul>
                        </details>
                        <div className={styles.actions}>
                          <Button
                            variant="primary"
                            disabled={
                              busy ||
                              active ||
                              locked ||
                              plan.status !== "draft"
                            }
                            onClick={() =>
                              review("approve", {
                                planId: plan.id,
                                candidate: i,
                              })
                            }
                          >
                            이 후보 승인
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {plan.status === "draft" && (
                    <div className={styles.actions}>
                      <Button
                        disabled={busy || active || locked || !reason.trim()}
                        onClick={() =>
                          review("revise", { planId: plan.id, reason })
                        }
                      >
                        사유와 함께 수정 요청
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy || active || locked || !reason.trim()}
                        onClick={() =>
                          review("reject", { planId: plan.id, reason })
                        }
                      >
                        사유와 함께 반려
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          {error && <Feedback tone="error">{error}</Feedback>}
        </section>
      )}
    </div>
  );
}
