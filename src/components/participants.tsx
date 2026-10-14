"use client";
import { useState, type FormEvent } from "react";
import { Plus, ArrowLeft, ExternalLink, X } from "lucide-react";
import {
  money,
  stageLabels,
  type DatabaseView,
  type RecordData,
} from "@/lib/types";
type Draft = Record<string, any>;
const channels: Record<string, string> = {
  blog: "네이버 블로그",
  clip: "네이버 클립",
  instagram: "인스타그램",
  facebook: "페이스북",
  linkedin: "링크드인",
  youtube: "유튜브",
  other: "기타",
};
const states: Record<string, string> = {
  active: "활동 중",
  paused: "섭외 보류",
  closed: "협업 종료",
};
const fresh = () => ({
  name: "",
  nickname: "",
  contact: "",
  status: "active",
  specialties: "",
  notes: "",
  blogRate: null,
  clipRate: null,
  accounts: [{ id: crypto.randomUUID(), channel: "blog", url: "", label: "" }],
});
const accountable = (t: RecordData) =>
  t.status !== "cancelled" ||
  t.payoutStatus === "paid" ||
  t.payoutCommitted === true;
export default function Participants({
  data,
  selected,
  onSelect,
  onProject,
  onReload,
}: {
  data: DatabaseView;
  selected: string;
  onSelect: (id: string) => void;
  onProject: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Draft>(fresh),
    [history, setHistory] = useState<Draft | null>(null),
    [tab, setTab] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const participant = data.participants.find((p) => p.id === selected);
  const tasks = data.tasks.filter((t) => t.participantId === selected),
    manual = data.participant_history.filter(
      (h) => h.participantId === selected,
    );
  const summary = (id: string) => {
    const assigned = data.tasks.filter(
        (t) => t.participantId === id && accountable(t),
      ),
      past = data.participant_history.filter((h) => h.participantId === id);
    const missing = [
      ...assigned.map((t) => t.payout),
      ...past.map((h) => h.amount),
    ].some((v) => v === null);
    return {
      count:
        data.tasks.filter((t) => t.participantId === id).length + past.length,
      paid:
        assigned
          .filter((t) => t.payoutStatus === "paid")
          .reduce((n, t) => n + Number(t.payout || 0), 0) +
        past
          .filter((h) => h.paid === true)
          .reduce((n, h) => n + Number(h.amount || 0), 0),
      unpaid:
        assigned
          .filter((t) => t.payoutStatus !== "paid")
          .reduce((n, t) => n + Number(t.payout || 0), 0) +
        past
          .filter((h) => h.paid !== true)
          .reduce((n, h) => n + Number(h.amount || 0), 0),
      missing,
    };
  };
  async function persist(kind: string, values: Draft) {
    setBusy(true);
    setError("");
    try {
      const { id, version, ...input } = values;
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          version,
          data:
            kind === "participants"
              ? {
                  ...input,
                  accounts: input.accounts.filter(
                    (a: Draft) => a.url.trim() || a.label.trim(),
                  ),
                }
              : input,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "저장 실패");
      await onReload();
      setEditing(false);
      setHistory(null);
      if (kind === "participants") onSelect(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }
  async function payout(task: RecordData) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "payout",
          key: crypto.randomUUID(),
          data: {
            id: task.id,
            version: task.version,
            paid: task.payoutStatus !== "paid",
          },
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "저장 실패");
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }
  function field(key: string, label: string, type = "text") {
    return (
      <label>
        {label}
        <input
          type={type}
          value={draft[key] ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              [key]:
                type === "number"
                  ? e.target.value === ""
                    ? null
                    : Number(e.target.value)
                  : e.target.value,
            })
          }
          min={type === "number" ? 0 : undefined}
        />
      </label>
    );
  }
  function begin(p?: RecordData) {
    setDraft(p ? { ...p, accounts: structuredClone(p.accounts) } : fresh());
    setEditing(true);
    setHistory(null);
    setError("");
  }
  function historyField(key: string, label: string, type = "text") {
    return (
      <label>
        {label}
        <input
          type={type}
          value={history?.[key] ?? ""}
          onChange={(e) =>
            setHistory({
              ...history,
              [key]:
                type === "number"
                  ? e.target.value === ""
                    ? null
                    : Number(e.target.value)
                  : e.target.value,
            })
          }
        />
      </label>
    );
  }
  return (
    <>
      <div className="pagehead">
        <div>
          {participant && (
            <button
              onClick={() => {
                onSelect("");
                setEditing(false);
                setHistory(null);
                setTab(0);
              }}
            >
              <ArrowLeft size={15} />
              참여자 목록
            </button>
          )}
          <h1 style={participant ? { marginTop: 16 } : undefined}>
            {participant
              ? String(participant.nickname || participant.name)
              : "참여자 관리"}
          </h1>
          <p>
            {participant
              ? `${String(participant.name)} · ${states[String(participant.status)]}`
              : "체험단·기자단·클립 게시자의 계정과 협업 이력을 관리하세요."}
          </p>
        </div>
        <button className="primary" onClick={() => begin(participant)}>
          <Plus size={16} />
          {participant ? "프로필 수정" : "참여자 등록"}
        </button>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {editing && (
        <section className="section">
          <h2>{draft.id ? "참여자 수정" : "새 참여자 등록"}</h2>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              persist("participants", draft);
            }}
          >
            <div className="fields">
              {field("name", "이름")}
              {field("nickname", "닉네임")}
              {field("contact", "연락처")}
              {field("specialties", "관심 분야 · 쉼표로 구분")}
              <label>
                활동 상태
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value })
                  }
                >
                  {Object.entries(states).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div />
              {field(
                "blogRate",
                "블로그 기본 지급액 · 미정이면 빈칸",
                "number",
              )}
              {field("clipRate", "클립 기본 지급액 · 미정이면 빈칸", "number")}
              <label className="full">
                내부 메모
                <textarea
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                  placeholder="선호 분야, 일정 준수, 수정 대응 등 확인한 내용을 적어주세요."
                />
              </label>
            </div>
            <div className="section-title" style={{ marginTop: 22 }}>
              <h3>블로그·클립 링크</h3>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    accounts: [
                      ...draft.accounts,
                      {
                        id: crypto.randomUUID(),
                        channel: "blog",
                        url: "",
                        label: "",
                      },
                    ],
                  })
                }
              >
                블로그·클립 링크 추가
              </button>
            </div>
            <p className="hint">
              블로그 주소를 붙여 넣으세요. 같은 참여자의 클립 링크는 링크 추가
              후 채널을 선택하면 됩니다.
            </p>
            {draft.accounts.map((a: Draft, i: number) => (
              <div className="row" key={a.id} style={{ margin: "12px 0" }}>
                <select
                  style={{ flex: 1 }}
                  aria-label={"계정 채널 " + (i + 1)}
                  value={a.channel}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      accounts: draft.accounts.map((v: Draft, j: number) =>
                        j === i ? { ...v, channel: e.target.value } : v,
                      ),
                    })
                  }
                >
                  {Object.entries(channels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  style={{ flex: 2 }}
                  aria-label={
                    (a.channel === "blog" ? "블로그 링크 " : "계정 링크 ") +
                    (i + 1)
                  }
                  placeholder="https://blog.naver.com/..."
                  type="url"
                  value={a.url}
                  required={!!a.label}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      accounts: draft.accounts.map((v: Draft, j: number) =>
                        j === i ? { ...v, url: e.target.value } : v,
                      ),
                    })
                  }
                />
                <input
                  style={{ flex: 1 }}
                  aria-label={"계정 별칭 " + (i + 1)}
                  placeholder="계정 별칭"
                  value={a.label}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      accounts: draft.accounts.map((v: Draft, j: number) =>
                        j === i ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={"계정 삭제 " + (i + 1)}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      accounts: draft.accounts.filter(
                        (_: unknown, j: number) => j !== i,
                      ),
                    })
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <p className="hint">
              새 작업에는 활동 중인 참여자만 배정할 수 있어요. 기본 단가 변경은
              이전 작업에 소급되지 않습니다.
            </p>
            <div
              className="row"
              style={{ justifyContent: "flex-end", marginTop: 20 }}
            >
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                취소
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "저장 중…" : "참여자 저장"}
              </button>
            </div>
          </form>
        </section>
      )}
      {!participant && !editing && (
        <>
          <div className="toolbar">
            <input
              aria-label="참여자 검색"
              placeholder="이름·닉네임·블로그 주소 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="활동 상태 필터"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">모든 활동 상태</option>
              {Object.entries(states).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {[
                    "참여자",
                    "활동 계정",
                    "분야 / 상태",
                    "참여 이력",
                    "미지급 합계",
                    "관리",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.participants
                  .filter(
                    (p) =>
                      (!status || p.status === status) &&
                      (!query ||
                        [
                          p.name,
                          p.nickname,
                          p.specialties,
                          p.contact,
                          ...(p.accounts as Draft[]).map((a) => a.url),
                        ]
                          .join(" ")
                          .toLowerCase()
                          .includes(query.toLowerCase())),
                  )
                  .map((p) => {
                    const s = summary(p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{String(p.nickname || p.name)}</strong>
                          <small>{String(p.name)}</small>
                        </td>
                        <td>
                          {(p.accounts as Draft[]).map((a) => (
                            <div key={a.id}>
                              <a href={a.url} target="_blank" rel="noreferrer">
                                {channels[a.channel]}
                                {a.label ? " · " + a.label : ""} ↗
                              </a>
                            </div>
                          ))}
                        </td>
                        <td>
                          {String(p.specialties || "—")}
                          <small>{states[String(p.status)]}</small>
                        </td>
                        <td>{s.count}건</td>
                        <td>
                          {money(s.unpaid)}
                          {s.missing && <small>미정 금액 별도</small>}
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              onSelect(p.id);
                              setTab(0);
                            }}
                          >
                            상세 보기
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {!data.participants.length && (
              <div className="empty">
                <h3>첫 참여자를 등록하세요</h3>등록 후 프로젝트 작업에서
                담당자와 게시 계정을 선택할 수 있어요.
              </div>
            )}
          </div>
        </>
      )}
      {participant && !editing && (
        <>
          <div className="stats">
            {[
              ["참여 이력", summary(selected).count + "건"],
              ["지급 완료", money(summary(selected).paid)],
              ["미지급 합계", money(summary(selected).unpaid)],
              ["활동 계정", (participant.accounts as Draft[]).length + "개"],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {summary(selected).missing && (
            <div className="notice">
              금액 미정 이력이 있습니다. 표시 합계는 확정된 금액만 더한
              값입니다.
            </div>
          )}
          <div className="tabs">
            {["프로필", "참여 이력", "정산 이력"].map((label, i) => (
              <button
                key={label}
                className={tab === i ? "active" : ""}
                onClick={() => setTab(i)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 0 && (
            <div className="split">
              <section className="section">
                <h2>기본 정보</h2>
                {[
                  ["연락처", participant.contact],
                  ["관심 분야", participant.specialties],
                  ["블로그 기본 지급액", money(participant.blogRate)],
                  ["클립 기본 지급액", money(participant.clipRate)],
                ].map(([k, v]) => (
                  <div className="amountline" key={String(k)}>
                    <span className="muted">{String(k)}</span>
                    <span>{String(v || "미등록")}</span>
                  </div>
                ))}
                <h3 style={{ marginTop: 22 }}>내부 메모</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {String(participant.notes || "없음")}
                </p>
              </section>
              <section className="section">
                <h2>블로그·클립 링크</h2>
                {(participant.accounts as Draft[]).map((a) => (
                  <div className="amountline" key={a.id}>
                    <span>
                      {channels[a.channel]} · {a.label || "기본 계정"}
                    </span>
                    <a href={a.url} target="_blank" rel="noreferrer">
                      {a.url} ↗
                    </a>
                  </div>
                ))}
              </section>
            </div>
          )}
          {tab !== 0 && (
            <>
              <div className="section-title">
                <h2>{tab === 1 ? "참여한 작업" : "지급·미지급 내역"}</h2>
                <button
                  onClick={() => {
                    setHistory({
                      participantId: selected,
                      name: "",
                      channel: "blog",
                      date: new Intl.DateTimeFormat("sv-SE", {
                        timeZone: "Asia/Seoul",
                      }).format(new Date()),
                      link: "",
                      customer: "",
                      product: "",
                      amount: null,
                      paid: false,
                      paidDate: "",
                      notes: "",
                    });
                    setError("");
                  }}
                >
                  기존 협업 이력 추가
                </button>
              </div>
              <p className="hint">
                프로젝트 배정 이력은 자동으로 모입니다. 시스템 외 과거 협업은
                별도로 등록하세요. 과거 이력 금액은 프로젝트 원가에 다시 더하지
                않습니다.
              </p>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "작업 / 고객·제품",
                        "게시·진행 상태",
                        "지급액",
                        "지급 상태 / 일자",
                        "관리",
                      ].map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const p = data.projects.find((p) => p.id === t.projectId),
                        c = data.customers.find((c) => c.id === p?.customerId),
                        product = data.products.find(
                          (x) => x.id === p?.productId,
                        );
                      return (
                        <tr key={t.id}>
                          <td>
                            <strong>{String(t.name)}</strong>
                            <small>
                              {String(c?.name || "")} ·{" "}
                              {String(product?.name || "")}
                            </small>
                            <small>
                              {(t.participantSnapshot as Draft)?.account
                                ?.url && (
                                <a
                                  href={
                                    (t.participantSnapshot as Draft).account.url
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  배정 계정 ↗
                                </a>
                              )}
                            </small>
                          </td>
                          <td>
                            <span className="badge">
                              {stageLabels[String(t.status)] ||
                                String(t.status)}
                            </span>
                            {t.link ? (
                              <div>
                                <a
                                  href={String(t.link)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  게시물 열기 ↗
                                </a>
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {money(t.payout)}
                            {!accountable(t) && <small>취소 · 합계 제외</small>}
                          </td>
                          <td>
                            {t.payoutStatus === "paid"
                              ? "지급 완료"
                              : "지급 예정"}
                            <small>
                              {t.paidAt
                                ? new Date(String(t.paidAt)).toLocaleDateString(
                                    "ko-KR",
                                    { timeZone: "Asia/Seoul" },
                                  )
                                : "—"}
                            </small>
                          </td>
                          <td>
                            <button
                              onClick={() => onProject(String(t.projectId))}
                            >
                              프로젝트 열기
                            </button>
                            <button
                              disabled={
                                busy || p?.settled === true || t.payout === null
                              }
                              onClick={() => payout(t)}
                            >
                              {t.payoutStatus === "paid"
                                ? "지급 취소"
                                : "지급 완료"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {manual.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <strong>{String(h.name)}</strong>
                          <small>
                            {[h.customer, h.product]
                              .filter(Boolean)
                              .join(" · ") || "고객·제품 미등록"}
                          </small>
                          <small>기존 협업 · {String(h.date)}</small>
                        </td>
                        <td>
                          {h.link ? (
                            <a
                              href={String(h.link)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              게시물 열기 ↗
                            </a>
                          ) : (
                            "링크 미등록"
                          )}
                        </td>
                        <td>{money(h.amount)}</td>
                        <td>
                          {h.paid ? "지급 완료" : "지급 예정"}
                          <small>{String(h.paidDate || "—")}</small>
                        </td>
                        <td>
                          <button onClick={() => setHistory({ ...h })}>
                            이력 수정
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!tasks.length && !manual.length && (
                  <div className="empty">아직 참여 이력이 없습니다.</div>
                )}
              </div>
            </>
          )}
        </>
      )}
      {history && (
        <section className="section">
          <h2>기존 협업 이력</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              persist("participant_history", history);
            }}
          >
            <div className="fields">
              {historyField("name", "작업명")}
              {historyField("date", "참여일", "date")}
              <label>
                채널
                <select
                  value={history.channel}
                  onChange={(e) =>
                    setHistory({ ...history, channel: e.target.value })
                  }
                >
                  <option value="blog">네이버 블로그</option>
                  <option value="clip">네이버 클립</option>
                  <option value="other">기타</option>
                </select>
              </label>
              {historyField("customer", "고객·브랜드")}
              {historyField("product", "제품")}
              {historyField("link", "게시 링크", "url")}
              {historyField("amount", "지급액 · 미정이면 빈칸", "number")}
              <label>
                지급 완료
                <input
                  type="checkbox"
                  checked={history.paid}
                  onChange={(e) =>
                    setHistory({ ...history, paid: e.target.checked })
                  }
                />
              </label>
              {historyField("paidDate", "지급일", "date")}
              <label className="full">
                메모
                <textarea
                  value={history.notes}
                  onChange={(e) =>
                    setHistory({ ...history, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <div
              className="row"
              style={{ justifyContent: "flex-end", marginTop: 20 }}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => setHistory(null)}
              >
                취소
              </button>
              <button className="primary" disabled={busy}>
                이력 저장
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
