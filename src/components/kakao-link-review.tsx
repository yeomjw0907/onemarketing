"use client";
import { useEffect, useState } from "react";
import { Button, Field, Form, Feedback } from "./ui/workflow-ui";
import type { RecordData } from "@/lib/types";
export default function KakaoLinkReview({
  participants,
}: {
  participants: RecordData[];
}) {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/kakao-links");
    if (!r.ok) throw Error("연결 요청을 읽지 못했어요.");
    setRows(await r.json());
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [participants]);
  return (
    <section className="section">
      <h2>카카오 계정 연결 요청 {rows.length}건</h2>
      <p className="muted">
        이름·번호만으로 승인하지 말고, 기존에 등록된 연락처로 본인 요청인지
        확인해주세요.
      </p>
      {error && <Feedback tone="error">{error}</Feedback>}
      {!rows.length ? (
        <p className="muted">확인할 연결 요청이 없어요.</p>
      ) : (
        rows.map((r) => (
          <Form
            key={r.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/kakao-links", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: r.id,
                    participantId: form.get("participantId"),
                    evidence: form.get("evidence"),
                    approve:
                      (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                        "value",
                      ) === "approve",
                  }),
                });
                const d = await response.json();
                if (!response.ok) throw Error(d.error);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "처리 실패");
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              <strong>{r.name}</strong> · {r.phone} · 카카오 표시명 {r.nickname}
            </p>
            <Field>
              연결할 참여자
              <select name="participantId" defaultValue={r.candidateId || ""}>
                <option value="">참여자 선택</option>
                {participants
                  .filter((p) => p.status === "active" && !p.deletedAt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.name)} · {String(p.phone || "")}
                    </option>
                  ))}
              </select>
            </Field>
            <Field>
              본인 확인 근거
              <input
                name="evidence"
                required
                placeholder="등록 연락처 통화로 연결 요청 확인"
              />
            </Field>
            <Button
              name="decision"
              value="approve"
              type="submit"
              variant="primary"
              busy={busy}
            >
              확인 후 연결
            </Button>
            <Button name="decision" value="reject" type="submit" busy={busy}>
              거절
            </Button>
          </Form>
        ))
      )}
    </section>
  );
}
