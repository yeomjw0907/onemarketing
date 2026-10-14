"use client";
import { useState } from "react";
import type { RecordData } from "@/lib/types";
export default function CustomerReportLinks({
  customerId,
  links,
  onReload,
}: {
  customerId: string;
  links: RecordData[];
  onReload: () => Promise<unknown>;
}) {
  const [url, setUrl] = useState("");
  const [issuedId, setIssuedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(revokeId?: string, days = 90) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/report-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, days, revokeId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.url) {
        setUrl(d.url);
        setIssuedId(d.linkId);
        setMessage("보고 URL을 복사해 고객에게 전달해 주세요.");
      } else {
        if (issuedId === revokeId) {
          setUrl("");
          setIssuedId("");
        }
        setMessage("보고 링크를 폐기했습니다.");
      }
      await onReload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <div className="section-title">
        <h2>고객 보고 URL</h2>
      </div>
      <p className="hint">
        고객이 로그인 없이 진행 현황과 게시 링크를 확인하고 엑셀을
        다운로드합니다. 링크를 아는 사람은 볼 수 있으므로 해당 고객에게만
        전달하세요.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          send(undefined, Number(f.get("days")));
        }}
      >
        <label>
          유효 기간
          <select name="days" defaultValue="90">
            <option value="30">30일</option>
            <option value="90">90일</option>
            <option value="180">180일</option>
            <option value="365">1년</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>
          보고 URL 발급
        </button>
      </form>
      {url && (
        <div>
          <label>
            발급한 보고 URL
            <input value={url} readOnly onFocus={(e) => e.target.select()} />
          </label>
          <div className="row">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setMessage("보고 URL을 복사했습니다.");
                } catch {
                  setMessage("주소를 선택해 직접 복사해 주세요.");
                }
              }}
            >
              URL 복사
            </button>
            <a href={url} target="_blank" rel="noreferrer">
              고객 화면 열기 ↗
            </a>
          </div>
        </div>
      )}
      <p className="hint">
        주소 원문은 발급 직후에만 표시됩니다. 보관한 주소를 잃어버리면 기존
        링크를 폐기하고 새로 발급하세요.
      </p>
      {links
        .filter((l) => l.customerId === customerId)
        .map((l) => (
          <div className="amountline" key={l.id}>
            <span>
              {new Date(l.createdAt).toLocaleDateString("ko-KR")} 발급 ·{" "}
              {l.revokedAt
                ? "폐기됨"
                : Date.parse(String(l.expiresAt)) <= Date.now()
                  ? "만료됨"
                  : `만료 ${new Date(String(l.expiresAt)).toLocaleDateString("ko-KR")}`}
            </span>
            {!l.revokedAt && (
              <button disabled={busy} onClick={() => send(l.id)}>
                링크 폐기
              </button>
            )}
          </div>
        ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
