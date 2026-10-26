"use client";
import { useEffect, useState } from "react";
import { participantQueue } from "@/lib/campaign-queue";
import { marketFetch } from "./public-fetch";
export default function ParticipantCampaignQueue({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<ReturnType<typeof participantQueue> | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      marketFetch("/api/commerce?role=participant")
        .then((d) => {
          if (active) {
            setRows(participantQueue(d.campaigns));
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("캠페인 할 일을 불러오지 못했어요.");
        });
    void load();
    window.addEventListener("om-commerce-update", load);
    return () => {
      active = false;
      window.removeEventListener("om-commerce-update", load);
    };
  }, []);
  return (
    <section className="operation-queue participant-action-queue">
      <h2>캠페인 할 일 {rows ? "· " + rows.length : ""}</h2>
      {error ? (
        <p role="alert">
          {error} <button onClick={() => onOpen("")}>내 캠페인 확인</button>
        </p>
      ) : rows === null ? (
        <p role="status">할 일을 확인하고 있어요.</p>
      ) : !rows.length ? (
        <p>
          수락하거나 제출할 캠페인이 없어요. 아래에서 참여 제안과 게시 작업을
          확인해주세요.
        </p>
      ) : (
        <ul className="queue-list">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <span>
                  {r.label}
                  {r.due
                    ? " · 기한 " +
                      new Date(r.due).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })
                    : ""}
                </span>
              </div>
              <button onClick={() => onOpen(r.campaignId)}>{r.label} →</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
