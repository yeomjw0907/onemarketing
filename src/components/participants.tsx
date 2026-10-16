"use client";
import { useState, type FormEvent } from "react";
import KakaoLinkReview from "./kakao-link-review";
import ParticipantApplications from "./participant-applications";
import ParticipantAccountReview from "./participant-account-review";
import ParticipantSettlements from "./participant-settlements";
import CopyButton from "./copy-button";
import styles from "./participants.module.css";
import ParticipantPaymentFields from "./participant-payment-fields";
import {
  elapsedLabel,
  participantPerformance,
} from "@/lib/participant-performance";
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
  operationType: "self",
  teamName: "",
  nickname: "",
  contact: "",
  phone: "",
  email: "",
  status: "active",
  specialties: "",
  notes: "",
  blogRate: 3000,
  clipRate: 3000,
  bundleRate: 7000,
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
    [showDeleted, setShowDeleted] = useState(false),
    [checked, setChecked] = useState<Record<string, number>>({}),
    [notice, setNotice] = useState(""),
    [sort, setSort] = useState("name"),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Draft>(fresh),
    [history, setHistory] = useState<Draft | null>(null),
    [tab, setTab] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const participant = data.participants.find((p) => p.id === selected);
  const visibleParticipants = data.participants
    .filter(
      (p) =>
        Boolean(p.deletedAt) === showDeleted &&
        (!status || p.status === status) &&
        (!query ||
          [
            p.name,
            p.nickname,
            p.specialties,
            p.contact,
            p.phone,
            p.email,
            ...(p.accounts as Draft[]).map((a) => a.url),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) => {
      const x = participantPerformance(data.tasks, a.id),
        y = participantPerformance(data.tasks, b.id);
      return sort === "speed"
        ? (x.averageResponseMs ?? Infinity) - (y.averageResponseMs ?? Infinity)
        : sort === "quality"
          ? (y.averageQuality ?? -1) - (x.averageQuality ?? -1)
          : String(a.name).localeCompare(String(b.name), "ko");
    });
  const picked = visibleParticipants.filter((p) => checked[p.id] !== undefined);
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
      setChecked({});
      setEditing(false);
      setHistory(null);
      if (kind === "participants") onSelect(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }
  async function removeParticipant() {
    if (
      !participant ||
      !window.confirm(
        `${String(participant.name)} 참여자를 삭제할까요? 체험단·승인 완료 목록에서 제외하고 신규 배정을 중단합니다. 기존 게시·정산 이력은 보존합니다.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "participant-delete",
          key: crypto.randomUUID(),
          data: { id: participant.id, version: participant.version },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "삭제 실패");
      await onReload();
      setChecked({});
      setEditing(false);
      setHistory(null);
      onSelect("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }
  async function restoreParticipant(target: RecordData) {
    const restoredStatus =
      states[String(target.statusBeforeDeletion)] || states.paused;
    if (
      !window.confirm(
        `${String(target.name)} 참여자를 ‘${restoredStatus}’ 상태로 복구할까요? 체험단 목록과 연결된 승인 완료 목록에 다시 표시됩니다.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "participant-restore",
          key: crypto.randomUUID(),
          data: { id: target.id, version: target.version },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "복구 실패");
      await onReload();
      setChecked({});
      setShowDeleted(false);
      setStatus("");
      setEditing(false);
      setTab(0);
      onSelect(target.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "복구 실패");
    } finally {
      setBusy(false);
    }
  }
  async function bulkLifecycle() {
    if (!picked.length || busy) return;
    const verb = showDeleted ? "복구" : "삭제";
    const names = picked
      .slice(0, 5)
      .map((p) => String(p.name))
      .join(", ");
    if (
      !window.confirm(
        `${names}${picked.length > 5 ? " 외 " + (picked.length - 5) + "명" : ""}\n선택한 ${picked.length}명을 한 번에 ${verb}할까요?\n${showDeleted ? "삭제 전 활동 상태로 복구합니다. 이전 상태가 없는 분은 섭외 보류로 복구됩니다." : "목록에서 제외하고 신규 배정을 중단합니다. 기존 게시·정산 이력은 보존합니다."}`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: showDeleted
            ? "participant-bulk-restore"
            : "participant-bulk-delete",
          key: crypto.randomUUID(),
          data: {
            items: picked.map((p) => ({ id: p.id, version: checked[p.id] })),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `일괄 ${verb} 실패`);
      setChecked({});
      setNotice(`${body.processedCount}명을 ${verb}했습니다.`);
      await onReload();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : `일괄 ${verb} 실패`) +
          " 선택 내역을 확인하고 새로고침 후 다시 시도해주세요.",
      );
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
    setDraft(
      p
        ? {
            ...p,
            blogRate: p.blogRate ?? 3000,
            clipRate: p.clipRate ?? 3000,
            bundleRate: p.bundleRate ?? 7000,
            phone: p.phone || "",
            email: p.email || "",
            accounts: structuredClone(p.accounts),
          }
        : fresh(),
    );
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
              체험단 목록
            </button>
          )}
          <h1 style={participant ? { marginTop: 16 } : undefined}>
            {participant
              ? String(participant.nickname || participant.name)
              : "체험단 관리"}
          </h1>
          <p>
            {participant
              ? `${String(participant.name)} · ${states[String(participant.status)]}`
              : "체험단·기자단·클립 게시자의 계정과 협업 이력을 관리하세요."}
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {!!participant?.deletedAt && (
            <button
              type="button"
              disabled={busy}
              onClick={() => restoreParticipant(participant)}
            >
              참여자 복구
            </button>
          )}
          {participant && !participant.deletedAt && (
            <button
              type="button"
              disabled={busy}
              onClick={removeParticipant}
              style={{ color: "#dc3545" }}
            >
              참여자 삭제
            </button>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => begin(participant)}
          >
            <Plus size={16} />
            {participant ? "프로필 수정" : "체험단 등록"}
          </button>
        </div>
      </div>
      {!!participant?.deletedAt && (
        <p className="hint">
          삭제된 참여자입니다. 기존 게시·정산 이력 확인과 정보 수정만
          가능합니다.
        </p>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {!participant && !editing && (
        <KakaoLinkReview participants={data.participants} />
      )}
      {!participant && !editing && (
        <ParticipantApplications
          refreshSignal={data}
          onApproved={async (id) => {
            await onReload();
            onSelect(id);
          }}
        />
      )}
      {editing && (
        <section className="section">
          <h2>{draft.id ? "체험단 수정" : "새 체험단 등록"}</h2>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              persist("participants", draft);
            }}
          >
            <div className="fields">
              {field("name", "이름")}
              <label>
                계정 운영 형태
                <select
                  value={draft.operationType || "self"}
                  onChange={(e) =>
                    setDraft({ ...draft, operationType: e.target.value })
                  }
                >
                  <option value="self">본인 계정</option>
                  <option value="managed">여러 계정 운영</option>
                </select>
              </label>
              {field("teamName", "업체명 · 운영팀명")}
              {field("nickname", "닉네임")}
              {field("phone", "전화번호", "tel")}
              {field("email", "이메일", "email")}
              {field("contact", "기타 연락처 · 카톡 등")}
              <div className="full">
                <ParticipantPaymentFields
                  payment={draft.payment}
                  onChange={(payment) => setDraft({ ...draft, payment })}
                />
              </div>
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
              {field("bundleRate", "블로그+클립 통합 지급액", "number")}
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
              블로그와 클립은 같은 네이버 블로그 계정으로 배정할 수 있어요. 여러
              계정을 운영한다면 별칭으로 구분해주세요.
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
              새 작업에는 활동 중인 체험단만 배정할 수 있어요. 기본 단가 변경은
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
                {busy ? "저장 중…" : "체험단 저장"}
              </button>
            </div>
          </form>
        </section>
      )}
      {!participant && !editing && (
        <>
          <div
            className="row"
            style={{ marginBottom: 16, flexWrap: "wrap" }}
            role="group"
            aria-label="참여자 목록 구분"
          >
            <button
              type="button"
              aria-pressed={!showDeleted}
              className={!showDeleted ? "primary" : ""}
              onClick={() => {
                setShowDeleted(false);
                setChecked({});
                setNotice("");
                setStatus("");
              }}
            >
              등록된 참여자 (
              {data.participants.filter((p) => !p.deletedAt).length})
            </button>
            <button
              type="button"
              aria-pressed={showDeleted}
              className={showDeleted ? "primary" : ""}
              onClick={() => {
                setShowDeleted(true);
                setChecked({});
                setNotice("");
                setStatus("");
              }}
            >
              삭제된 참여자 (
              {data.participants.filter((p) => p.deletedAt).length})
            </button>
          </div>
          {showDeleted && (
            <p className="hint">
              삭제일과 기존 이력을 확인하고 복구할 수 있습니다. 삭제 전 상태를
              알 수 없는 기존 삭제 건은 ‘섭외 보류’로 복구됩니다.
            </p>
          )}
          <div className={styles.filters}>
            <input
              aria-label="체험단 검색"
              placeholder="이름·닉네임·블로그 주소 검색"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setChecked({});
              }}
            />
            <select
              aria-label="활동 상태 필터"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setChecked({});
              }}
            >
              <option value="">모든 활동 상태</option>
              {Object.entries(states).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="정렬"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">이름순</option>
              <option value="speed">평균 링크 접수 빠른순</option>
              <option value="quality">품질 평가 높은순</option>
            </select>
          </div>
          <div className="row" style={{ margin: "12px 0", flexWrap: "wrap" }}>
            <strong>{picked.length}명 선택</strong>
            <button
              type="button"
              disabled={busy || !picked.length}
              onClick={() => setChecked({})}
            >
              선택 해제
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !picked.length}
              onClick={bulkLifecycle}
            >
              {busy
                ? "처리 중…"
                : showDeleted
                  ? "선택한 참여자 복구"
                  : "선택한 참여자 삭제"}
            </button>
            <span className="hint">
              한 번에 최대 100명까지 처리할 수 있습니다.
            </span>
          </div>
          {notice && <p role="status">{notice}</p>}
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="현재 목록 선택 (최대 100명)"
                      style={{ width: 18 }}
                      disabled={busy || !visibleParticipants.length}
                      checked={
                        visibleParticipants.length > 0 &&
                        visibleParticipants
                          .slice(0, 100)
                          .every((p) => checked[p.id] !== undefined)
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            picked.length > 0 &&
                            !visibleParticipants
                              .slice(0, 100)
                              .every((p) => checked[p.id] !== undefined);
                      }}
                      onChange={(e) =>
                        setChecked(
                          e.target.checked
                            ? Object.fromEntries(
                                visibleParticipants
                                  .slice(0, 100)
                                  .map((p) => [p.id, p.version]),
                              )
                            : {},
                        )
                      }
                    />
                  </th>
                  {[
                    "체험단",
                    "활동 계정",
                    "분야 / 상태",
                    "참여 이력",
                    "평균 링크 접수 / 품질",
                    "미지급 합계",
                    "관리",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleParticipants.map((p) => {
                  const s = summary(p.id);
                  const performance = participantPerformance(data.tasks, p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${String(p.name)} 선택`}
                          style={{ width: 18 }}
                          checked={checked[p.id] !== undefined}
                          disabled={
                            busy ||
                            (picked.length >= 100 &&
                              checked[p.id] === undefined)
                          }
                          onChange={(e) =>
                            setChecked((previous) => {
                              const next = { ...previous };
                              if (e.target.checked) next[p.id] = p.version;
                              else delete next[p.id];
                              return next;
                            })
                          }
                        />
                      </td>
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
                        <small>
                          {p.deletedAt ? "삭제됨" : states[String(p.status)]}
                        </small>
                        {!!p.deletedAt && (
                          <small>
                            삭제일{" "}
                            {new Date(String(p.deletedAt)).toLocaleString(
                              "ko-KR",
                              { timeZone: "Asia/Seoul" },
                            )}
                          </small>
                        )}
                      </td>
                      <td>{s.count}건</td>
                      <td>
                        {elapsedLabel(performance.averageResponseMs)}
                        <small>
                          {performance.averageQuality === null
                            ? "미평가"
                            : performance.averageQuality.toFixed(1) +
                              " / 5점"}{" "}
                          · 접수 {performance.submitted}건 / 평가{" "}
                          {performance.qualityCount}건
                        </small>
                      </td>
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
                        {!!p.deletedAt && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => restoreParticipant(p)}
                          >
                            복구
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.participants.some(
              (p) => Boolean(p.deletedAt) === showDeleted,
            ) && (
              <div className={`empty ${styles.empty}`}>
                <h3>
                  {showDeleted
                    ? "삭제된 참여자가 없습니다"
                    : "첫 체험단을 등록하세요"}
                </h3>
                {!showDeleted &&
                  "등록 후 프로젝트 작업에서 담당자와 게시 계정을 선택할 수 있어요."}
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
          {(() => {
            const p = participantPerformance(data.tasks, selected);
            return (
              <section className="section">
                <h2>요청·응답·검수 지표</h2>
                <div className="stats">
                  {[
                    [
                      "요청 → 링크 접수",
                      elapsedLabel(p.averageResponseMs),
                      `${p.submitted}건 기준`,
                    ],
                    [
                      "링크 접수 → 운영자 확인",
                      elapsedLabel(p.averageReviewMs),
                      "운영자 검수 시간 분리",
                    ],
                    [
                      "기한 내 링크 접수",
                      p.deadlineCount
                        ? `${p.onTime}/${p.deadlineCount}건`
                        : "기록 없음",
                      `미접수 지연 ${p.overdue}건`,
                    ],
                    [
                      "품질·수정",
                      p.averageQuality === null
                        ? "미평가"
                        : `${p.averageQuality.toFixed(1)} / 5점`,
                      `${p.qualityCount}건 평가 · 게시 수정 요청 ${p.revisionCount}회`,
                    ],
                  ].map(([label, value, hint]) => (
                    <div className="stat" key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>{hint}</small>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  게시 작업 기준입니다. 요청 시각이 기록된 작업만 속도를
                  계산하며, 링크 접수는 운영자가 입력한 시각입니다. 실제 업로드
                  시각과 다를 수 있습니다. 품질은 운영자의 선택 평가이며
                  미평가를 0점으로 계산하지 않습니다.
                </p>
              </section>
            );
          })()}
          <div className="tabs">
            {["프로필", "참여 이력", "정산 이력", "요청·응답 기록"].map(
              (label, i) => (
                <button
                  key={label}
                  className={tab === i ? "active" : ""}
                  onClick={() => setTab(i)}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          {tab === 0 && (
            <div className="split">
              <section className="section">
                <h2>기본 정보</h2>
                {[
                  ["전화번호", participant.phone],
                  [
                    "계정 운영 형태",
                    participant.operationType === "managed"
                      ? "여러 계정 운영"
                      : "본인 계정",
                  ],
                  ["업체 · 운영팀", participant.teamName],
                  ["이메일", participant.email],
                  [
                    "정산 방식",
                    (participant.payment as Draft)?.method === "bank"
                      ? "계좌 송금"
                      : (participant.payment as Draft)?.method === "kakaopay"
                        ? "카카오페이"
                        : "미등록",
                  ],
                  ...((participant.payment as Draft)?.method === "bank"
                    ? [
                        ["은행", (participant.payment as Draft).bankName],
                        [
                          "계좌번호",
                          (participant.payment as Draft).accountNumber,
                        ],
                      ]
                    : []),
                  ["기타 연락처", participant.contact],
                  ["관심 분야", participant.specialties],
                  ["블로그 기본 지급액", money(participant.blogRate)],
                  ["클립 기본 지급액", money(participant.clipRate)],
                  ["블로그+클립 지급액", money(participant.bundleRate ?? 7000)],
                ].map(([k, v]) => (
                  <div className="amountline" key={String(k)}>
                    <span className="muted">{String(k)}</span>
                    <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {String(v || "미등록")}
                      {["전화번호", "이메일"].includes(String(k)) &&
                        Boolean(v) && (
                          <CopyButton value={String(v)} label={String(k)} />
                        )}
                    </span>
                  </div>
                ))}
                <h3 style={{ marginTop: 22 }}>내부 메모</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {String(participant.notes || "없음")}
                </p>
              </section>
              <ParticipantAccountReview
                participant={participant}
                reload={onReload}
              />
            </div>
          )}
          {tab === 3 && (
            <section className="section">
              <h2>요청·응답·확인 이력</h2>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>시각</th>
                      <th>종류</th>
                      <th>작업·내용</th>
                      <th>평가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.participant_events
                      .filter((e) => e.participantId === selected)
                      .map((e) => (
                        <tr key={e.id}>
                          <td>
                            {new Date(
                              String(e.occurredAt || e.createdAt),
                            ).toLocaleString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })}
                          </td>
                          <td>
                            {{
                              assignment: "배정",
                              request: "게시 요청",
                              submission: "링크 접수",
                              verification: "게시 확인",
                              revision: "게시 수정 요청",
                            }[String(e.type)] || String(e.type)}
                          </td>
                          <td>
                            {String(
                              data.tasks.find((t) => t.id === e.taskId)?.name ||
                                data.work_slots.find((s) => s.id === e.slotId)
                                  ?.name ||
                                "",
                            )}{" "}
                            · {String(e.note || "")}
                          </td>
                          <td>
                            {typeof e.qualityScore === "number"
                              ? `${e.qualityScore} / 5점`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {(tab === 1 || tab === 2) && (
            <>
              {tab === 2 && (
                <ParticipantSettlements
                  participant={participant}
                  data={data}
                  reload={onReload}
                />
              )}
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
                        "요청 / 링크 접수 / 확인",
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
                            {[t.requestedAt, t.submittedAt, t.verifiedAt].map(
                              (v, i) => (
                                <small style={{ display: "block" }} key={i}>
                                  {["요청", "접수", "확인"][i]}:{" "}
                                  {v
                                    ? new Date(String(v)).toLocaleString(
                                        "ko-KR",
                                        { timeZone: "Asia/Seoul" },
                                      )
                                    : "미기록"}
                                </small>
                              ),
                            )}
                          </td>
                          <td>
                            {t.postingSetId
                              ? "세트 보수에 포함"
                              : money(t.payout)}
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
                                busy ||
                                p?.settled === true ||
                                t.payout === null ||
                                Boolean(t.postingSetId || t.workSlotId)
                              }
                              onClick={() => payout(t)}
                            >
                              {t.postingSetId
                                ? "프로젝트에서 통합 지급"
                                : t.payoutStatus === "paid"
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
                        <td>시각 미기록 · 과거 이력</td>
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
