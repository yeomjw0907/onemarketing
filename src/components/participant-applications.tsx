"use client";
import { useEffect, useState } from "react";
import ApplicationFields from "./participant-application-fields";
import CopyButton from "./copy-button";
import { accountStatusLabels } from "@/lib/participant-account-policy";
import type {
  ApplicationDraft,
  ParticipantApplication,
} from "@/lib/participant-application-schema";
const labels = {
  new: "신규",
  approved: "승인 완료",
  rejected: "반려",
  deleted: "삭제된 신청",
};
export default function ParticipantApplications({
  onApproved,
  refreshSignal,
}: {
  onApproved: (id: string) => Promise<void>;
  refreshSignal?: object;
}) {
  const [items, setItems] = useState<ParticipantApplication[]>([]),
    [filter, setFilter] = useState("new"),
    [search, setSearch] = useState(""),
    [checked, setChecked] = useState<Record<string, number>>({}),
    [current, setCurrent] = useState<ParticipantApplication | null>(null),
    [draft, setDraft] = useState<ApplicationDraft | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const selectable =
    filter === "new" || filter === "rejected" || filter === "deleted";
  const query = search.trim();
  const nameQuery = query.replace(/\s/g, "").toLocaleLowerCase("ko-KR");
  const phoneQuery = /^[0-9+()\s-]+$/.test(query)
    ? query.replace(/\D/g, "")
    : "";
  const matches = (i: ParticipantApplication) => {
    const statusMatches =
      filter === "deleted"
        ? Boolean(i.data.deletedAt)
        : !i.data.deletedAt && i.status === filter;
    return (
      statusMatches &&
      (!query ||
        i.data.name
          .replace(/\s/g, "")
          .toLocaleLowerCase("ko-KR")
          .includes(nameQuery) ||
        (phoneQuery.length > 0 &&
          i.data.phone.replace(/\D/g, "").includes(phoneQuery)))
    );
  };
  const pending = items.filter(matches);
  const picked = pending.filter((i) => checked[i.id] !== undefined);
  async function bulkReview(
    action:
      | "bulk-approve"
      | "bulk-reject"
      | "bulk-reapprove"
      | "bulk-delete"
      | "bulk-restore",
  ) {
    if (!picked.length || busy || current) return;
    const approve = action === "bulk-approve" || action === "bulk-reapprove";
    const verb =
      action === "bulk-delete"
        ? "삭제"
        : action === "bulk-restore"
          ? "복구"
          : action === "bulk-reapprove"
            ? "재승인"
            : approve
              ? "승인"
              : "반려";
    const names = picked
      .slice(0, 5)
      .map((i) => i.data.name)
      .join(", ");
    if (
      !window.confirm(
        `${names}${picked.length > 5 ? " 외 " + (picked.length - 5) + "명" : ""}\n선택한 ${filter === "deleted" ? "삭제된" : filter === "rejected" ? "반려" : "신규"} 신청 ${picked.length}건을 한 번에 ${verb}할까요?\n${action === "bulk-delete" ? "삭제된 신청 목록으로 이동하며 나중에 복구할 수 있습니다." : action === "bulk-restore" ? "삭제 전 신규·반려 상태로 복구합니다. 참여자를 등록하지 않습니다." : approve ? "검토 대기·승인 계정을 승인하고 참여자로 등록합니다. 개별 반려한 계정은 유지됩니다." : "선택한 신청을 반려하며 참여자를 등록하지 않습니다."}`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    let applied = false;
    try {
      const response = await fetch("/api/participant-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          key: crypto.randomUUID(),
          items: picked.map((i) => ({ id: i.id, version: checked[i.id] })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "일괄 처리 실패");
      applied = true;
      setChecked({});
      await load();
      setMessage(
        `${body.processedCount}건을 ${verb}했습니다.${approve ? " 참여자로 등록되었습니다." : ""}`,
      );
      if (approve) await onApproved("");
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "일괄 처리 실패"} ${applied ? "처리는 완료됐습니다. 목록을 새로고침해주세요." : "일괄 변경은 적용되지 않았습니다."}`,
      );
    } finally {
      setBusy(false);
    }
  }
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
      setChecked({});
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
            신규{" "}
            {
              items.filter((i) => !i.data.deletedAt && i.status === "new")
                .length
            }
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
              setChecked({});
              setMessage("");
              setCurrent(null);
              setDraft(null);
            }}
          >
            {label} (
            {
              items.filter((i) =>
                key === "deleted"
                  ? Boolean(i.data.deletedAt)
                  : !i.data.deletedAt && i.status === key,
              ).length
            }
            )
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="search"
          aria-label="신청 이름·전화번호 검색"
          placeholder="이름 또는 전화번호 검색"
          autoComplete="off"
          maxLength={200}
          value={search}
          disabled={busy}
          style={{ width: 320, maxWidth: "100%", height: 40 }}
          onChange={(e) => {
            setSearch(e.target.value);
            setChecked({});
            setMessage("");
          }}
        />
        {search && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSearch("");
              setChecked({});
            }}
          >
            검색 지우기
          </button>
        )}
        {!loading && (
          <span role="status" className="hint">
            {labels[filter as keyof typeof labels]} ·{" "}
            {query ? "검색 결과 " : ""}
            {pending.length}건
          </span>
        )}
      </div>
      {selectable && !loading && (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
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
              disabled={busy || !picked.length || !!current}
              onClick={() =>
                bulkReview(
                  filter === "deleted"
                    ? "bulk-restore"
                    : filter === "rejected"
                      ? "bulk-reapprove"
                      : "bulk-approve",
                )
              }
            >
              {filter === "deleted"
                ? "선택한 신청 복구"
                : filter === "rejected"
                  ? "선택한 신청 재승인"
                  : "선택한 신청 승인"}
            </button>
            {filter !== "deleted" && (
              <button
                type="button"
                disabled={busy || !picked.length || !!current}
                onClick={() => bulkReview("bulk-delete")}
              >
                선택한 신청 삭제
              </button>
            )}
            {filter === "new" && (
              <button
                type="button"
                disabled={busy || !picked.length || !!current}
                onClick={() => bulkReview("bulk-reject")}
              >
                선택한 신청 반려
              </button>
            )}
          </div>
          <p className="hint">
            {filter === "deleted"
              ? "삭제 전 신규·반려 상태로 복구합니다. 복구 후 신청 내용을 검토해주세요."
              : "일괄 승인 시 검토 대기 계정도 승인됩니다. 계정별로 다르게 처리하려면 ‘검토 · 수정’을 이용해주세요."}{" "}
            한 번에 최대 100명까지 처리합니다.
          </p>
        </>
      )}
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
                {selectable && (
                  <th>
                    <input
                      type="checkbox"
                      style={{ width: 18 }}
                      aria-label={`${filter === "deleted" ? "삭제된" : filter === "rejected" ? "반려" : "신규"} 신청 목록 선택 (최대 100명)`}
                      disabled={busy || !pending.length || !!current}
                      checked={
                        pending.length > 0 &&
                        pending
                          .slice(0, 100)
                          .every((i) => checked[i.id] !== undefined)
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            picked.length > 0 &&
                            !pending
                              .slice(0, 100)
                              .every((i) => checked[i.id] !== undefined);
                      }}
                      onChange={(e) =>
                        setChecked(
                          e.target.checked
                            ? Object.fromEntries(
                                pending
                                  .slice(0, 100)
                                  .map((i) => [i.id, i.version]),
                              )
                            : {},
                        )
                      }
                    />
                  </th>
                )}
                <th>이름</th>
                <th>연락처</th>
                <th>신청일</th>
                <th>상태</th>
                <th>검토</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(matches).map((item) => (
                <tr key={item.id}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 18 }}
                        aria-label={`${item.data.name} 신청 선택`}
                        checked={checked[item.id] !== undefined}
                        disabled={
                          busy ||
                          !!current ||
                          (picked.length >= 100 &&
                            checked[item.id] === undefined)
                        }
                        onChange={(e) =>
                          setChecked((previous) => {
                            const next = { ...previous };
                            if (e.target.checked) next[item.id] = item.version;
                            else delete next[item.id];
                            return next;
                          })
                        }
                      />
                    </td>
                  )}
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
                  <td>
                    {item.data.deletedAt
                      ? `삭제됨 · 이전 ${labels[item.status]}`
                      : labels[item.status]}
                    {!!item.data.deletedAt && (
                      <small>
                        삭제일{" "}
                        {new Date(item.data.deletedAt).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })}
                      </small>
                    )}
                  </td>
                  <td>
                    {item.status === "approved" && item.participant_id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onApproved(item.participant_id!)}
                      >
                        참여자 수정 · 삭제
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => {
                        setChecked({});
                        setCurrent(item);
                        setDraft(structuredClone(item.data));
                        setError("");
                        setMessage("");
                      }}
                    >
                      {!item.data.deletedAt && item.status !== "approved"
                        ? "검토 · 수정"
                        : "내용 보기"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.some(matches) && (
            <p className="empty">
              {query
                ? "검색 결과가 없습니다."
                : `${labels[filter as keyof typeof labels]} 신청이 없습니다.`}
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
            disabled={
              busy || current.status === "approved" || !!current.data.deletedAt
            }
          />
          <section className="section" aria-label="신청 계정별 검토">
            <h3>계정별 승인</h3>
            <p className="hint">
              승인한 계정만 배정할 수 있습니다. 보류·반려 계정은 담당자 등록
              후에도 다시 검토할 수 있어요.
            </p>
            {draft.accounts.map((account, i) => (
              <div
                key={account.id}
                className="row"
                style={{ flexWrap: "wrap", marginBottom: 14, gap: 12 }}
              >
                <strong>{account.label || `계정 ${i + 1}`}</strong>
                <span style={{ overflowWrap: "anywhere" }}>{account.url}</span>
                <select
                  aria-label={`${account.label || `계정 ${i + 1}`} 승인 상태`}
                  disabled={
                    busy ||
                    current.status === "approved" ||
                    !!current.data.deletedAt
                  }
                  value={
                    account.approvalStatus ||
                    (current.status === "approved" ? "approved" : "pending")
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      accounts: draft.accounts.map((a, j) =>
                        j === i
                          ? {
                              ...a,
                              approvalStatus: e.target.value as
                                "pending" | "approved" | "rejected",
                            }
                          : a,
                      ),
                    })
                  }
                  style={{ width: 140 }}
                >
                  {Object.entries(accountStatusLabels).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </section>
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
            {!current.data.deletedAt && current.status !== "approved" && (
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
                  disabled={
                    busy ||
                    !draft.accounts.some((a) => a.approvalStatus === "approved")
                  }
                >
                  {busy ? "처리 중…" : "담당자 승인 · 선택 계정 등록"}
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
