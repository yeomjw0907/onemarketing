"use client";
import { useState } from "react";
import {
  accountStatusLabels,
  type ManagedAccount,
} from "@/lib/participant-account-policy";
import type { RecordData } from "@/lib/types";
export default function ParticipantAccountReview({
  participant,
  reload,
}: {
  participant: RecordData;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function review(accountId: string, status: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "participant-account-review",
          key: crypto.randomUUID(),
          data: {
            id: participant.id,
            version: participant.version,
            accountId,
            status,
          },
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 검토 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <h2>담당 계정 · 계정별 승인</h2>
      <p className="hint">
        승인된 계정만 새로 배정할 수 있습니다. 기존 계정은 승인 상태를 유지하며,
        보류·반려로 바꿔도 진행 중인 작업 내역은 보존합니다.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(participant.accounts as ManagedAccount[]).map((a) => (
        <div
          key={a.id}
          style={{ borderTop: "1px solid var(--line)", padding: "16px 0" }}
        >
          <div
            className="row"
            style={{ flexWrap: "wrap", justifyContent: "space-between" }}
          >
            <strong>{a.label || a.channel}</strong>
            <span className="badge">
              {accountStatusLabels[a.approvalStatus || "approved"]}
            </span>
          </div>
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              overflowWrap: "anywhere",
              margin: "10px 0",
            }}
          >
            {a.url} ↗
          </a>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {Object.entries(accountStatusLabels).map(([status, label]) => (
              <button
                type="button"
                key={status}
                disabled={busy || (a.approvalStatus || "approved") === status}
                onClick={() => review(a.id, status)}
              >
                {label === "검토 대기" ? "보류" : label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
