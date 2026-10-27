"use client";
import { useEffect, useState } from "react";
import { workflowApi } from "./workflow-client";
import { intakeQuestions } from "@/lib/intake-question-plan";
type Item = {
  id: string;
  version: number;
  data: {
    status: string;
    revokedAt?: string;
    fields: Record<string, unknown>;
    requested: string[];
    assetIds: string[];
    note: string;
  };
};
export default function CustomerIntakeAdmin({
  projectId,
  onReload,
}: {
  projectId: string;
  onReload: () => Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [requested, setRequested] = useState([
      "product",
      "campaign",
      "files",
      "links",
    ]),
    [note, setNote] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    setItems(await workflowApi("/api/intake?project=" + projectId));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [projectId]);
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await workflowApi("/api/intake", body);
      await load();
      await onReload();
      return r;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <h2>고객에게 필요한 정보 요청</h2>
      <p className="hint">
        선택한 항목만 한 단계씩 질문합니다. 기존 회사·제품 정보는 미리
        채워집니다.
      </p>
      <div className="row">
        {[
          ["company", "회사·담당자"],
          ["product", "제품 정보"],
          ["campaign", "캠페인 조건·일정"],
          ["files", "첨부 자료"],
          ["links", "참고 링크"],
        ].map(([id, label]) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={requested.includes(id)}
              disabled={busy}
              onChange={(e) =>
                setRequested((v) =>
                  e.target.checked ? [...v, id] : v.filter((k) => k !== id),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      <label>
        고객에게 전할 안내
        <textarea
          value={note}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !requested.length}
        onClick={async () => {
          const r = await act({ action: "issue", projectId, requested, note });
          if (r) setUrl(location.origin + r.url);
        }}
      >
        정보 입력 링크 만들기
      </button>
      {url && (
        <div>
          <label>
            전달할 링크
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard
                .writeText(url)
                .then(() => setNotice("링크를 복사했습니다."))
                .catch(() => setError("링크를 선택해 직접 복사해주세요."))
            }
          >
            링크 복사
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {items.map((item) => (
        <details key={item.id}>
          <summary>
            {item.data.revokedAt
              ? "회수됨"
              : {
                  draft: "작성 중",
                  submitted: "검토 대기",
                  changes: "보완 요청",
                  accepted: "검토 완료",
                }[item.data.status] || item.data.status}{" "}
            · 첨부 {item.data.assetIds.length}개
          </summary>
          <dl>
            {intakeQuestions(item.data.requested)
              .filter((q) => q.key !== "files")
              .map((q) => (
                <div key={q.key}>
                  <dt>{q.title}</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>
                    {String(item.data.fields[q.key] || "미입력")}
                  </dd>
                </div>
              ))}
          </dl>
          {item.data.assetIds.map((id) => (
            <p key={id}>
              <a href={"/api/assets/" + id} target="_blank" rel="noreferrer">
                첨부 자료 열기
              </a>
            </p>
          ))}
          {item.data.status === "submitted" && !item.data.revokedAt && (
            <div className="row">
              <button
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "accept",
                    id: item.id,
                    version: item.version,
                    note: "",
                  })
                }
              >
                확인 완료·캠페인 자료에 반영
              </button>
              <button
                disabled={busy || !note.trim()}
                onClick={() =>
                  void act({
                    action: "changes",
                    id: item.id,
                    version: item.version,
                    note,
                  })
                }
              >
                안내 내용으로 보완 요청
              </button>
            </div>
          )}
          {!item.data.revokedAt && (
            <button
              disabled={busy}
              onClick={() =>
                void act({
                  action: "revoke",
                  id: item.id,
                  version: item.version,
                  note: "",
                })
              }
            >
              링크 회수
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
