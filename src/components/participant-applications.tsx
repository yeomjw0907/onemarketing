"use client";
import { useEffect, useState } from "react";
import ApplicationFields from "./participant-application-fields";
import CopyButton from "./copy-button";
import type {
  ApplicationDraft,
  ParticipantApplication,
} from "@/lib/participant-application-schema";
const labels = { new: "신규", approved: "승인 완료", rejected: "반려" };
export default function ParticipantApplications({
  onApproved,
  refreshSignal,
}: {
  onApproved: (id: string) => Promise<void>;
  refreshSignal?: object;
}) {
  const [items, setItems] = useState<ParticipantApplication[]>([]),
    [filter, setFilter] = useState("new"),
    [current, setCurrent] = useState<ParticipantApplication | null>(null),
    [draft, setDraft] = useState<ApplicationDraft | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    const r = await fetch("/api/participant-applications", {
      cache: "no-store",
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || "신청을 불러오지 못했습니다.");
    setItems(body);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refreshSignal]);
  async function review(action: "save" | "approve" | "reject") {
    if (!current || !draft || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/participant-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: current.id,
          version: current.version,
          action,
          data: draft,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "처리하지 못했습니다.");
      await load();
      setCurrent(null);
      setDraft(null);
      setMessage(
        action === "approve"
          ? "승인하고 참여자로 등록했습니다."
          : action === "reject"
            ? "신청을 반려했습니다."
            : "신청 내용을 저장했습니다.",
      );
      if (body.participantId) await onApproved(body.participantId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section" aria-label="체험단 신규 신청">
      <div className="section-title">
        <h2>
          체험단 참여 신청{" "}
          <span className="badge">
            신규 {items.filter((i) => i.status === "new").length}
          </span>
        </h2>
        <a href="/participants/apply" target="_blank" rel="noreferrer">
          독립 신청 페이지 ↗
        </a>
      </div>
      <p className="hint">
        신청 링크를 공유하세요. 내용을 수정한 뒤 승인하면 참여자로 바로
        등록됩니다.
      </p>
      <div className="row" style={{ margin: "16px 0", flexWrap: "wrap" }}>
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            disabled={busy}
            className={filter === key ? "primary" : ""}
            onClick={() => {
              setFilter(key);
              setCurrent(null);
              setDraft(null);
            }}
          >
            {label} ({items.filter((i) => i.status === key).length})
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {loading ? (
        <p>신청을 불러오는 중…</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>신청일</th>
                <th>상태</th>
                <th>검토</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((i) => i.status === filter)
                .map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.data.name}</strong>
                    </td>
                    <td>
                      {[
                        ["휴대전화", item.data.phone],
                        ["이메일", item.data.email],
                      ]
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                          <div
                            key={label}
                            className="row"
                            style={{
                              gap: 8,
                              margin: "4px 0",
                              flexWrap: "wrap",
                            }}
                          >
                            <span>{value}</span>
                            <CopyButton value={value} label={label} />
                          </div>
                        ))}
                    </td>
                    <td>
                      {new Date(item.created_at).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })}
                    </td>
                    <td>{labels[item.status]}</td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setCurrent(item);
                          setDraft(structuredClone(item.data));
                          setError("");
                          setMessage("");
                        }}
                      >
                        {item.status !== "approved"
                          ? "검토 · 수정"
                          : "내용 보기"}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!items.some((i) => i.status === filter) && (
            <p className="empty">
              {labels[filter as keyof typeof labels]} 신청이 없습니다.
            </p>
          )}
        </div>
      )}
      {current && draft && (
        <form
          style={{
            borderTop: "1px solid var(--line)",
            marginTop: 24,
            paddingTop: 24,
          }}
          onSubmit={(e) => {
            e.preventDefault();
            review(
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) === "approve"
                ? "approve"
                : "save",
            );
          }}
        >
          <h3>{current.data.name} · 신청 검토</h3>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <span>{draft.phone}</span>
            <CopyButton value={draft.phone} label="휴대전화" />
            {draft.email && (
              <>
                <span>{draft.email}</span>
                <CopyButton value={draft.email} label="이메일" />
              </>
            )}
          </div>
          <ApplicationFields
            key={current.id}
            draft={draft}
            onChange={setDraft}
            disabled={busy || current.status === "approved"}
          />
          <p className="hint">
            개인정보 동의:{" "}
            {new Date(current.data.consentAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </p>
          <div
            className="row"
            style={{
              marginTop: 20,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCurrent(null);
                setDraft(null);
              }}
            >
              닫기
            </button>
            {current.status !== "approved" && (
              <>
                {current.status === "new" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => review("reject")}
                  >
                    반려
                  </button>
                )}
                <button type="submit" value="save" disabled={busy}>
                  수정 내용 저장
                </button>
                <button
                  type="submit"
                  value="approve"
                  className="primary"
                  disabled={busy}
                >
                  {busy ? "처리 중…" : "수정 내용으로 승인 · 참여자 등록"}
                </button>
              </>
            )}
            {current.participant_id && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApproved(current.participant_id!)}
              >
                등록된 참여자 열기
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
