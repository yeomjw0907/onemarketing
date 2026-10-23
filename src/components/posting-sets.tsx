"use client";
import { accountAssignable } from "@/lib/participant-account-policy";
import { useState } from "react";
import {
  money,
  stageLabels,
  type DatabaseView,
  type RecordData,
} from "@/lib/types";

type Account = { id: string; channel: string; url: string; label: string };
export default function PostingSets({
  project,
  data,
  onReload,
}: {
  project: RecordData;
  data: DatabaseView;
  onReload: () => Promise<unknown>;
}) {
  const [participantId, setParticipantId] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const participant = data.participants.find((p) => p.id === participantId);
  const accounts = (participant?.accounts || []) as Account[];
  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const sets = data.posting_sets.filter(
    (s) =>
      s.projectId === project.id && !s.workSlotId && s.status !== "cancelled",
  );
  const available = tasks.filter(
    (t) =>
      !t.workSlotId &&
      !t.postingSetId &&
      t.payoutStatus !== "paid" &&
      !t.payoutCommitted &&
      !["cancelled", "delivered", "submitted", "verified"].includes(
        String(t.status),
      ),
  );
  async function send(
    action: string,
    row: RecordData,
    extra: Record<string, unknown>,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          key: crypto.randomUUID(),
          data: { id: row.id, version: row.version, ...extra },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "처리 실패");
      await onReload();
      setMessage("저장했습니다.");
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "처리 실패");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <div className="section-title">
        <h2>체험단 게시 세트 · 통합 보수</h2>
        <span>{sets.length}세트</span>
      </div>
      <p className="hint">
        한 체험단에게 블로그 1건과 클립 1건을 배정합니다. 두 게시물 확인 후 세트
        보수를 한 번 지급합니다.
      </p>
      {sets.map((set) => {
        const blog = tasks.find((t) => t.id === set.blogTaskId),
          clip = tasks.find((t) => t.id === set.clipTaskId);
        const ready = [blog, clip].every(
          (t) =>
            t &&
            ["approved", "delivered", "submitted", "verified"].includes(
              String(t.status),
            ),
        );
        const verified =
          blog?.status === "verified" && clip?.status === "verified";
        const paid = set.payoutStatus === "paid";
        return (
          <div className="posting-set" key={set.id}>
            <div className="section-title">
              <strong>{String(set.participantName)}</strong>
              <span>
                {money(set.amount)} · {paid ? "지급 완료" : "미지급"}
              </span>
            </div>
            {[blog, clip].map((t, i) => (
              <div className="amountline" key={i}>
                <span>
                  {i === 0 ? "블로그" : "클립"} ·{" "}
                  {String(t?.name || "작업 없음")}
                </span>
                <span>
                  {stageLabels[String(t?.status)] || "미정"}
                  {t?.link ? (
                    <>
                      {" "}
                      ·{" "}
                      <a href={String(t.link)} target="_blank" rel="noreferrer">
                        게시물 ↗
                      </a>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
            <div className="row">
              {!paid &&
                [blog, clip].every(
                  (t) =>
                    t &&
                    !["delivered", "submitted", "verified"].includes(
                      String(t.status),
                    ),
                ) && (
                  <button
                    disabled={busy || Boolean(project.settled)}
                    onClick={() => send("posting-set-dissolve", set, {})}
                  >
                    세트 해제 · 기존 배정 복원
                  </button>
                )}
              {ready && (
                <a
                  className="button-link"
                  href={`/api/deliveries?projectId=${project.id}&setId=${set.id}`}
                >
                  체험단 전달 ZIP
                </a>
              )}
              <button
                disabled={busy || !ready || Boolean(project.settled)}
                onClick={async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    const r = await fetch("/api/deliveries", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        projectId: project.id,
                        taskIds: [set.blogTaskId, set.clipTaskId],
                        channel: "체험단 게시 세트",
                        note: `${set.participantName}에게 전달`,
                      }),
                    });
                    const result = await r.json();
                    if (!r.ok) throw new Error(result.error);
                    await onReload();
                    setMessage("두 작업의 실제 전달을 기록했습니다.");
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "전달 기록 실패",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                실제 전달 완료 기록
              </button>
              <button
                className={paid ? "" : "primary"}
                disabled={
                  busy || Boolean(project.settled) || (!paid && !verified)
                }
                onClick={() => send("posting-set-pay", set, { paid: !paid })}
              >
                {paid ? "세트 지급 취소" : "세트 리워드 지급 완료"}
              </button>
            </div>
            {!ready && (
              <p className="hint">
                두 작업을 승인하면 체험단 전용 ZIP을 받을 수 있습니다.
              </p>
            )}
            {!paid && !verified && (
              <p className="hint">
                블로그·클립 링크를 모두 확인하면 지급할 수 있습니다.
              </p>
            )}
            {paid && (
              <small>
                지급일 {new Date(String(set.paidAt)).toLocaleString("ko-KR")}
              </small>
            )}
          </div>
        );
      })}
      {!project.settled &&
        !["completed", "cancelled"].includes(String(project.status)) && (
          <details>
            <summary>새 게시 세트 배정</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await send("posting-set-create", project, {
                  participantId,
                  blogTaskId: f.get("blogTaskId"),
                  clipTaskId: f.get("clipTaskId"),
                  blogAccountId: f.get("blogAccountId"),
                  clipAccountId: f.get("clipAccountId"),
                  amount: Number(f.get("amount")),
                  instructions: f.get("instructions"),
                  replacePayouts: f.get("replacePayouts") === "on",
                });
              }}
            >
              <label>
                체험단
                <select
                  required
                  value={participantId}
                  onChange={(e) => setParticipantId(e.target.value)}
                >
                  <option value="">체험단 선택</option>
                  {data.participants
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {String(p.nickname || p.name)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="split">
                {["blog", "clip"].map((channel) => (
                  <div key={channel}>
                    <label>
                      {channel === "blog" ? "블로그 작업" : "클립 작업"}
                      <select
                        name={channel === "blog" ? "blogTaskId" : "clipTaskId"}
                        required
                      >
                        <option value="">작업 선택</option>
                        {available
                          .filter(
                            (t) =>
                              t.channel === channel &&
                              (!t.participantId ||
                                t.participantId === participantId),
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {String(t.name)} · 기존 보수 {money(t.payout)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {channel === "blog" ? "블로그 계정" : "클립 계정"}
                      <select
                        key={participantId + channel}
                        name={
                          channel === "blog" ? "blogAccountId" : "clipAccountId"
                        }
                        required
                      >
                        <option value="">계정 선택</option>
                        {accounts
                          .filter((a) => accountAssignable(a, channel))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label || a.url}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              {participant &&
                (!accounts.some((a) => accountAssignable(a, "blog")) ||
                  !accounts.some((a) => accountAssignable(a, "clip"))) && (
                  <p className="hint">
                    체험단 관리에서 블로그·클립 계정을 모두 등록해 주세요.
                  </p>
                )}
              <label>
                세트 통합 보수 (원)
                <input
                  name="amount"
                  type="number"
                  min={0}
                  max={1e12}
                  step={1}
                  defaultValue={Number(participant?.bundleRate ?? 7000)}
                  key={participantId}
                  required
                />
              </label>
              <label>
                체험단 게시 지침
                <textarea
                  name="instructions"
                  rows={3}
                  maxLength={5000}
                  placeholder="게시 마감, 필수 키워드·광고 표시, 링크 제출 방법 등"
                />
              </label>
              <label className="row">
                <input
                  name="replacePayouts"
                  type="checkbox"
                  required
                  style={{ width: "auto" }}
                />
                선택한 두 작업의 기존 개별 보수를 세트 통합 보수로 대체합니다.
              </label>
              <button className="primary" disabled={busy}>
                게시 세트 만들기
              </button>
            </form>
          </details>
        )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
