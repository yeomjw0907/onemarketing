"use client";
import { useState } from "react";
import { money, type DatabaseView, type RecordData } from "@/lib/types";
import {
  settlementItems,
  type SettlementItem,
} from "@/lib/participant-settlement-view";
import { participantPaymentSchema } from "@/lib/participant-payment";
export default function ParticipantSettlements({
  participant,
  data,
  reload,
}: {
  participant: RecordData;
  data: DatabaseView;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const available = settlementItems(data, participant.id);
  const picked = available.filter((i) => selected.includes(i.id));
  const total = picked.reduce((n, i) => n + i.amount, 0);
  const payment = participantPaymentSchema.safeParse(participant.payment);
  const history = data.participant_settlements.filter(
    (s) => s.participantId === participant.id,
  );
  async function record() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "participant-settle",
          key: crypto.randomUUID(),
          data: {
            id: participant.id,
            version: participant.version,
            items: picked.map((i) => ({ id: i.id, token: i.token })),
          },
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setSelected([]);
      setConfirm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "합산 정산 실패");
    } finally {
      setBusy(false);
    }
  }
  async function cancel(settlement: RecordData) {
    if (
      !window.confirm(
        "합산 지급 전체를 취소하고 미지급 상태로 되돌릴까요? 실제 송금을 되돌리지는 않습니다.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "participant-settlement-cancel",
          key: crypto.randomUUID(),
          data: { id: settlement.id, version: settlement.version },
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "합산 지급 취소 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section" aria-label="담당자 합산 정산">
      <h2>담당자 합산 정산</h2>
      <p className="hint">
        게시 확인을 마친 계정별 내역을 선택하세요. 실제 송금 후 지급 완료를
        기록합니다. 묶음 보수는 한 번만 합산하며 미확인·기지급·마감 프로젝트는
        제외합니다.
      </p>
      {!payment.success && (
        <p className="hint">
          프로필 수정에서 담당자의 정산 정보를 먼저 등록해주세요.
        </p>
      )}
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setSelected(available.slice(0, 100).map((i) => i.id))}
        >
          지급 가능 내역 선택 (최대 100건)
        </button>
        <button type="button" disabled={busy} onClick={() => setSelected([])}>
          선택 해제
        </button>
        <strong>
          {picked.length}건 · 합계 {money(total)}
        </strong>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {["선택", "작업", "게시 계정", "정산액"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {available.map((i) => (
              <tr key={i.id}>
                <td>
                  <input
                    type="checkbox"
                    style={{ width: 18 }}
                    aria-label={`${i.name} 정산 선택`}
                    disabled={
                      busy || (picked.length >= 100 && !selected.includes(i.id))
                    }
                    checked={selected.includes(i.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, i.id]
                          : selected.filter((id) => id !== i.id),
                      )
                    }
                  />
                </td>
                <td>{i.name}</td>
                <td>{i.accounts.join(" · ") || "기존 협업 이력"}</td>
                <td>{money(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!available.length && (
          <p className="empty">합산 지급할 내역이 없습니다.</p>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="primary"
        type="button"
        style={{ marginTop: 16 }}
        disabled={busy || !picked.length || !payment.success}
        onClick={() => setConfirm(true)}
      >
        선택 내역 합산 지급 완료 기록
      </button>
      {confirm && (
        <div
          role="group"
          aria-label="합산 지급 확인"
          style={{
            padding: 18,
            marginTop: 16,
            background: "#f2f7ff",
            borderRadius: 12,
          }}
        >
          <strong>
            {String(participant.name)} 담당자에게 {money(total)} 지급 완료를
            기록할까요?
          </strong>
          <p>
            {payment.success &&
              (payment.data.method === "bank"
                ? `${payment.data.bankName} · ${payment.data.accountNumber}`
                : `카카오페이 · ${String(participant.phone || "")}`)}
          </p>
          <p className="hint">
            자동 송금은 실행되지 않습니다. 실제 지급한 내역만 확인해주세요.
          </p>
          <div className="row">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !picked.length}
              onClick={record}
            >
              지급 완료 확인
            </button>
          </div>
        </div>
      )}
      <h3 style={{ marginTop: 28 }}>합산 정산 기록</h3>
      {history.map((s) => (
        <div key={s.id} className="amountline">
          <span>
            {new Date(String(s.paidAt)).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            · {(s.items as unknown[]).length}건 ·{" "}
            {s.status === "cancelled" ? "지급 취소" : "지급 완료"}
          </span>
          <strong>{money(s.total)}</strong>
          <details style={{ flexBasis: "100%" }}>
            <summary>계정별 지급 내역 · 정산 정보</summary>
            <p className="hint">
              {String(s.participantName)} · {String(s.teamName || "")}{" "}
              {(
                s.payment as {
                  method: string;
                  bankName?: string;
                  accountNumber?: string;
                }
              ).method === "bank"
                ? `${(s.payment as { bankName: string }).bankName} · ${(s.payment as { accountNumber: string }).accountNumber}`
                : `카카오페이 · ${String(s.phone || "")}`}
            </p>
            {(s.items as SettlementItem[]).map((item) => (
              <p key={item.id}>
                {item.name} · {item.accounts.join(" · ") || "기존 협업 이력"} ·{" "}
                {money(item.amount)}
              </p>
            ))}
          </details>
          {s.status !== "cancelled" && (
            <button type="button" disabled={busy} onClick={() => cancel(s)}>
              합산 지급 취소
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
