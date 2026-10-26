"use client";
import { useState } from "react";
import { operationQueue, type QueueItem } from "@/lib/campaign-queue";
export default function OperationQueue({
  data,
  admin,
  onOpen,
}: {
  data: Record<string, any>;
  admin: boolean;
  onOpen: (item: QueueItem) => void;
}) {
  const [kind, setKind] = useState("all"),
    rows = operationQueue(data, admin),
    visible = rows.filter((r) => kind === "all" || r.kind === kind);
  return (
    <section className="operation-queue" aria-label="처리할 일">
      <div className="queue-heading">
        <h2>{admin ? "처리 대기" : "지금 확인할 일"}</h2>
        <span>{rows.reduce((n, r) => n + r.count, 0)}건</span>
      </div>
      <div className="queue-filters">
        {[
          ["all", "전체"],
          ["payment", admin ? "입금 확인" : "입금 대기"],
          ["selection", "지원자 선정"],
          ["review", "콘텐츠 검수"],
          ["refund", "환불"],
        ].map(([k, v]) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {v}{" "}
            <b>
              {rows
                .filter((r) => k === "all" || r.kind === k)
                .reduce((n, r) => n + r.count, 0)}
            </b>
          </button>
        ))}
      </div>
      {!visible.length ? (
        <p>현재 이 항목에 처리할 일이 없어요.</p>
      ) : (
        <ul className="queue-list">
          {visible.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <span>
                  {r.label} · {r.count}건
                </span>
              </div>
              <button onClick={() => onOpen(r)}>{r.label} →</button>
            </li>
          ))}
        </ul>
      )}
      {!admin && (
        <p className="queue-note">
          운영 대행 캠페인의 선정·검수는 담당자가 진행해요. 각 캠페인에서 진행
          상황을 확인할 수 있어요.
        </p>
      )}
    </section>
  );
}
