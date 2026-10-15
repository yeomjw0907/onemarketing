"use client";
import { accountAssignable } from "@/lib/participant-account-policy";
import { useState } from "react";
import {
  money,
  stageLabels,
  type DatabaseView,
  type RecordData,
} from "@/lib/types";
type Props = {
  project: RecordData;
  data: DatabaseView;
  reload: () => Promise<void>;
  onPublication: (task: RecordData) => void;
};
type Account = {
  id: string;
  channel: string;
  url: string;
  label: string;
  approvalStatus?: "pending" | "approved" | "rejected";
};
function Slot({
  slot,
  project,
  data,
  reload,
  onPublication,
}: Props & { slot: RecordData }) {
  const tasks = data.tasks.filter((t) =>
    (slot.taskIds as string[]).includes(t.id),
  );
  const [selected, setSelected] = useState(String(slot.participantId || "")),
    [accountIds, setAccountIds] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [feedback, setFeedback] = useState<Record<string, string>>({}),
    [deadline, setDeadline] = useState("");
  const participant = data.participants.find((p) => p.id === selected),
    accounts = (participant?.accounts || []) as Account[];
  const ready =
      tasks.length > 0 &&
      tasks.every((t) =>
        ["approved", "delivered", "submitted", "verified"].includes(
          String(t.status),
        ),
      ),
    verified = tasks.every((t) => t.status === "verified"),
    paid = tasks.every((t) => t.payoutStatus === "paid");
  const frozen = Boolean(
    project.settled ||
    project.hold ||
    ["completed", "cancelled"].includes(String(project.status)),
  );
  const assigned = Boolean(slot.participantId),
    locked = tasks.some(
      (t) =>
        t.payoutStatus === "paid" ||
        t.payoutCommitted ||
        ["delivered", "submitted", "verified", "cancelled"].includes(
          String(t.status),
        ),
    );
  const estimated = participant
    ? Number(
        participant[
          slot.type === "bundle"
            ? "bundleRate"
            : slot.type === "blog"
              ? "blogRate"
              : "clipRate"
        ] ?? (slot.type === "bundle" ? 7000 : 3000),
      )
    : Number(slot.amount);
  const name = String(slot.participantName || "미배정");
  const chat = `${name}님, ${project.name} 게시 요청드립니다.\n구성: ${slot.name}\n보수: ${slot.amount}원${slot.type === "bundle" ? " (블로그·클립 모두 확인 후 지급)" : ""}\n마감: ${deadline ? new Date(deadline + "+09:00").toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : project.due || "별도 안내"}\n첨부한 원고·이미지·영상을 사용해 주세요. 원고의 이미지 번호와 광고·협찬 표시를 유지하고 게시 후 링크를 전달해 주세요.`;
  async function post(url: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "처리 실패");
      await reload();
      setMessage("저장했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  const action = (
    type: string,
    row: RecordData,
    values: Record<string, unknown>,
  ) =>
    post("/api/data", {
      action: type,
      key: crypto.randomUUID(),
      data: { id: row.id, version: row.version, ...values },
    });
  return (
    <article className="section">
      <div className="section-title">
        <h3>{String(slot.name)}</h3>
        <strong>
          {name} · {money(slot.amount)} · {paid ? "지급 완료" : "미지급"}
        </strong>
      </div>
      <div className="row">
        <label>
          체험단 선택
          <select
            disabled={busy || frozen || locked}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setAccountIds({});
            }}
          >
            <option value="">미배정</option>
            {data.participants
              .filter(
                (p) => p.status === "active" || p.id === slot.participantId,
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.nickname || p.name)} ·{" "}
                  {String(p.phone || p.contact || "")}
                </option>
              ))}
          </select>
        </label>
        {selected &&
          tasks.map((t) => (
            <label key={t.id}>
              {t.channel === "blog" ? "블로그" : "클립"} 계정
              <select
                disabled={busy || frozen || locked}
                value={
                  accountIds[String(t.channel)] ||
                  accounts.find((a) => a.id === t.participantAccountId)?.id ||
                  accounts.find(
                    (a) =>
                      accountAssignable(a, t.channel) ||
                      a.id === t.participantAccountId,
                  )?.id ||
                  ""
                }
                onChange={(e) =>
                  setAccountIds({
                    ...accountIds,
                    [String(t.channel)]: e.target.value,
                  })
                }
              >
                <option value="">계정 등록 필요</option>
                {accounts
                  .filter(
                    (a) =>
                      accountAssignable(a, t.channel) ||
                      a.id === t.participantAccountId,
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label || a.url}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        <button
          disabled={busy || frozen || locked}
          onClick={() =>
            action("work-slot-assign", slot, {
              participantId: selected,
              blogAccountId:
                accountIds.blog ||
                accounts.find(
                  (a) =>
                    a.id ===
                    tasks.find((t) => t.channel === "blog")
                      ?.participantAccountId,
                )?.id ||
                accounts.find((a) => accountAssignable(a, "blog"))?.id,
              clipAccountId:
                accountIds.clip ||
                accounts.find(
                  (a) =>
                    a.id ===
                    tasks.find((t) => t.channel === "clip")
                      ?.participantAccountId,
                )?.id ||
                accounts.find((a) => accountAssignable(a, "clip"))?.id,
            })
          }
        >
          배정 저장 · {money(estimated)}
        </button>
      </div>
      {locked && (
        <p className="hint">전달·지급한 슬롯은 담당자를 변경할 수 없습니다.</p>
      )}
      {tasks.map((t) => (
        <div className="section" key={t.id}>
          <div className="section-title">
            <strong>{String(t.name)}</strong>
            <span>{stageLabels[String(t.status)] || String(t.status)}</span>
          </div>
          <p className="hint">
            요청:{" "}
            {t.requestedAt
              ? new Date(String(t.requestedAt)).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })
              : "미기록"}{" "}
            · 링크 접수:{" "}
            {t.submittedAt
              ? new Date(String(t.submittedAt)).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })
              : "미기록"}{" "}
            · 확인:{" "}
            {t.verifiedAt
              ? new Date(String(t.verifiedAt)).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })
              : "미기록"}
          </p>
          {t.link ? (
            <a href={String(t.link)} target="_blank" rel="noreferrer">
              게시물 열기 ↗
            </a>
          ) : null}
          <div className="row">
            {["delivered", "submitted", "verified"].includes(
              String(t.status),
            ) && (
              <button
                disabled={busy || frozen}
                onClick={() => onPublication(t)}
              >
                게시 링크·확인·평가
              </button>
            )}
            {data.assets
              .filter(
                (a) =>
                  a.taskId === t.id &&
                  Array.isArray(t.approvedAssets) &&
                  t.approvedAssets.includes(a.id) &&
                  a.current === true,
              )
              .map((a) => (
                <a
                  className="button-link"
                  download={String(a.name)}
                  key={a.id}
                  href={`/api/assets/${a.id}${a.category === "copy" ? "?publishable=1" : ""}`}
                >
                  {a.category === "copy"
                    ? "원고 TXT"
                    : a.category === "video"
                      ? "영상 파일"
                      : String(a.name)}{" "}
                  다운로드
                </a>
              ))}
          </div>
          {assigned &&
            ["delivered", "submitted", "verified"].includes(String(t.status)) &&
            !paid && (
              <div className="row">
                <input
                  aria-label={String(t.name) + " 게시 수정 의견"}
                  value={feedback[t.id] || ""}
                  onChange={(e) =>
                    setFeedback({ ...feedback, [t.id]: e.target.value })
                  }
                  placeholder="게시 누락·표시 오류 등 수정 의견"
                />
                <button
                  disabled={busy || frozen || !feedback[t.id]?.trim()}
                  onClick={() =>
                    action("posting-feedback", t, { note: feedback[t.id] })
                  }
                >
                  게시 수정 요청 기록
                </button>
              </div>
            )}
        </div>
      ))}
      <div className="row">
        {ready && assigned && (
          <a
            className="button-link"
            href={`/api/deliveries?projectId=${project.id}&slotId=${slot.id}`}
          >
            체험단 전달 ZIP 다운로드
          </a>
        )}
        <button
          disabled={!assigned || busy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(chat);
              setMessage(
                "카톡 전달 문구를 복사했습니다. ZIP 또는 개별 파일을 직접 첨부해 보내세요.",
              );
            } catch {
              setMessage("복사에 실패했습니다.");
            }
          }}
        >
          카톡 요청 문구 복사
        </button>
        <label>
          게시 마감 (선택)
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <button
          disabled={busy || frozen || !ready || !assigned}
          onClick={() =>
            post("/api/deliveries", {
              projectId: project.id,
              taskIds: slot.taskIds,
              channel: "카카오톡·직접전달",
              note: `${name}에게 ${slot.name} 전달·게시 요청`,
              postingDeadlineAt: deadline
                ? new Date(deadline + "+09:00").toISOString()
                : undefined,
            })
          }
        >
          실제 전달 완료 · 요청 시간 기록
        </button>
        <button
          disabled={busy || frozen || (!verified && !paid) || !assigned}
          onClick={() => action("work-slot-pay", slot, { paid: !paid })}
        >
          {paid ? "지급 취소" : `${money(slot.amount)} 지급 완료 기록`}
        </button>
      </div>
      <p className="hint">
        파일 다운로드나 문구 복사만으로 전달했다고 기록하지 않습니다. 카톡으로
        실제 보낸 뒤 전달 완료를 눌러주세요. 자동 메시지 발송은 하지 않습니다.
      </p>
      {message && <p role="status">{message}</p>}
    </article>
  );
}
export default function WorkSlots(props: Props) {
  const slots = props.data.work_slots.filter(
    (s) => s.projectId === props.project.id,
  );
  return (
    <section>
      <h2>슬롯·체험단 배정 · 파일 전달</h2>
      <p className="notice">
        슬롯 {slots.length}개 · 미배정{" "}
        {slots.filter((s) => !s.participantId).length}개 · 약정 보수 합계{" "}
        {money(slots.reduce((n, s) => n + Number(s.amount || 0), 0))}
      </p>
      <p className="hint">
        제작 전 또는 제작 후에 담당자를 선택해 배정하세요. 승인한 결과물만
        파일로 전달할 수 있습니다.
      </p>
      {slots.length ? (
        slots.map((s) => (
          <Slot key={`${s.id}:${s.version}`} slot={s} {...props} />
        ))
      ) : (
        <p>
          새 슬롯 장바구니로 생성한 프로젝트의 슬롯이 표시됩니다. 기존
          프로젝트는 기존 작업·게시 세트에서 관리하세요.
        </p>
      )}
    </section>
  );
}
