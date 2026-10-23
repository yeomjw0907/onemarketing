"use client";
import { useEffect, useState } from "react";
import ApplicationFields from "./participant-application-fields";
import CopyButton from "./copy-button";
import { accountStatusLabels } from "@/lib/participant-account-policy";
import type {
  ApplicationDraft,
  ParticipantApplication,
} from "@/lib/participant-application-schema";
import {
  applicationListLabels as labels,
  matchesApplication,
  applicationDateRangeError,
  applicationDatePresets,
  applicationPresetRange,
  type ApplicationDatePreset,
  sortApplications,
  type ApplicationSort,
} from "@/lib/participant-application-filter";
export default function ParticipantApplications({
  onApproved,
  refreshSignal,
}: {
  onApproved: (id: string) => Promise<void>;
  refreshSignal?: object;
}) {
  const [items, setItems] = useState<ParticipantApplication[]>([]),
    [filter, setFilter] = useState("unreviewed"),
    [search, setSearch] = useState(""),
    [order, setOrder] = useState<ApplicationSort>("newest"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState(""),
    [datePreset, setDatePreset] = useState<ApplicationDatePreset | null>(null),
    [checked, setChecked] = useState<Record<string, number>>({}),
    [current, setCurrent] = useState<ParticipantApplication | null>(null),
    [draft, setDraft] = useState<ApplicationDraft | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [exporting, setExporting] = useState(false);
  const selectable =
    filter === "unreviewed" ||
    filter === "new" ||
    filter === "approved" ||
    filter === "rejected" ||
    filter === "deleted";
  const query = search.trim();
  const range = { startDate, endDate };
  const rangeError = applicationDateRangeError(range);
  const hasConditions = Boolean(query || startDate || endDate);
  const matches = (i: ParticipantApplication) =>
    matchesApplication(i, filter, query, range);
  const pending = sortApplications(items.filter(matches), order);
  const picked = pending.filter((i) => checked[i.id] !== undefined);
  const pageCount = Math.max(1, Math.ceil(pending.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = pending.slice(pageStart, pageStart + pageSize);
  const pagePicked = pageItems.filter((i) => checked[i.id] !== undefined);
  useEffect(() => {
    setPage((previous) => Math.min(previous, pageCount));
  }, [pageCount]);
  async function downloadExcel(onlySelected = false) {
    if (
      exporting ||
      busy ||
      loading ||
      !pending.length ||
      (onlySelected && !picked.length)
    )
      return;
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams({
        status: filter,
        search: query,
        sort: order,
        startDate,
        endDate,
      });
      const response = onlySelected
        ? await fetch("/api/participant-applications/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: filter,
              search: query,
              sort: order,
              startDate,
              endDate,
              ids: picked.map((i) => i.id),
            }),
          })
        : await fetch(`/api/participant-applications/export?${params}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "엑셀 다운로드 실패");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = decodeURIComponent(
        response.headers.get("Content-Disposition")?.split("UTF-8''")[1] ||
          "체험단_신청.xlsx",
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀 다운로드 실패");
    } finally {
      setExporting(false);
    }
  }
  async function bulkReview(
    action:
      | "bulk-verify"
      | "bulk-exclude"
      | "bulk-approve"
      | "bulk-reject"
      | "bulk-reapprove"
      | "bulk-delete"
      | "bulk-restore",
  ) {
    if (!picked.length || busy || current) return;
    const approve = action === "bulk-approve" || action === "bulk-reapprove";
    const verb =
      action === "bulk-verify"
        ? "검수 완료 · 보상 확정"
        : action === "bulk-exclude"
          ? "검수 완료 · 보상 제외"
          : action === "bulk-delete"
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
        `${names}${picked.length > 5 ? " 외 " + (picked.length - 5) + "명" : ""}\n선택한 ${filter === "deleted" ? "삭제된" : filter === "rejected" ? "반려" : "신규"} 신청 ${picked.length}건을 한 번에 ${verb}할까요?\n${action === "bulk-verify" ? "신규 추천 보상 2,000원이 지급 가능해집니다. 실제 송금은 별도 정산에서 처리합니다." : action === "bulk-exclude" ? "신규 추천 보상을 취소합니다. 회원 이용은 유지됩니다." : action === "bulk-delete" ? "삭제된 신청 목록으로 이동하며 나중에 복구할 수 있습니다." : action === "bulk-restore" ? "삭제 전 신규·반려 상태로 복구합니다. 참여자를 등록하지 않습니다." : approve ? "검토 대기·승인 계정을 승인하고 참여자로 등록합니다. 개별 반려한 계정은 유지됩니다." : "선택한 신청을 반려하며 참여자를 등록하지 않습니다."}${picked.length > 100 ? "\n100건씩 순서대로 처리합니다. 중간 오류가 발생하면 완료된 건은 유지하고 나머지는 중단합니다." : ""}`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    const selected = picked.map((i) => ({ id: i.id, version: checked[i.id] }));
    let completed = 0;
    let processingFinished = false;
    try {
      for (let offset = 0; offset < selected.length; offset += 100) {
        const batch = selected.slice(offset, offset + 100);
        const payload = JSON.stringify({
          action,
          key: crypto.randomUUID(),
          items: batch,
        });
        setMessage(
          `${selected.length}건 중 ${completed}건 ${verb} 완료 · 처리 중…`,
        );
        let response: Response | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await fetch("/api/participant-applications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: payload,
            });
            if (response.status < 500 || attempt === 1) break;
          } catch (e) {
            if (attempt === 1) throw e;
          }
        }
        if (!response) throw new Error("서버 응답을 확인하지 못했습니다.");
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "일괄 처리 실패");
        completed += body.processedCount;
        setChecked((previous) => {
          const next = { ...previous };
          for (const item of batch) delete next[item.id];
          return next;
        });
      }
      processingFinished = true;
      setMessage(
        `${completed}건을 ${verb}했습니다.${approve ? " 참여자로 등록되었습니다." : ""}`,
      );
      await load();
      if (approve) await onApproved("");
    } catch (e) {
      setMessage("");
      setError(
        `${e instanceof Error ? e.message : "일괄 처리 실패"} ${processingFinished ? "처리는 완료됐습니다. 목록을 새로고침해주세요." : `완료 확인 ${completed}/${selected.length}건. 나머지 처리를 중단했습니다. 이미 완료된 건은 유지되며, 목록을 새로고침한 뒤 남은 신청을 확인해주세요.`}`,
      );
      try {
        await load();
        if (approve && completed) await onApproved("");
      } catch {
        /* Refresh can be retried with the workspace refresh button. */
      }
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
  async function review(
    action: "save" | "approve" | "reject" | "verify" | "exclude",
  ) {
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
        action === "verify"
          ? "검수를 완료했습니다. 신규 추천 보상이 지급 가능해졌습니다."
          : action === "exclude"
            ? "검수를 완료하고 신규 추천 보상에서 제외했습니다."
            : action === "approve"
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
        새 신청은 자동 승인됩니다. 미검수 회원을 확인한 뒤 검수를 완료하면 신규
        추천 보상 2,000원이 지급 가능해집니다. 부적합 회원은 참여자 수정 ·
        삭제에서 처리해주세요.
      </p>
      <div className="row" style={{ margin: "16px 0", flexWrap: "wrap" }}>
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            disabled={busy}
            className={filter === key ? "primary" : ""}
            onClick={() => {
              setFilter(key);
              setPage(1);
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
                  : matchesApplication(i, key, ""),
              ).length
            }
            )
          </button>
        ))}
      </div>
      <div
        className="row"
        style={{ marginBottom: 12, flexWrap: "wrap" }}
        role="group"
        aria-label="신청일 빠른 선택"
      >
        {Object.entries(applicationDatePresets).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-pressed={datePreset === key}
            className={datePreset === key ? "primary" : ""}
            onClick={() => {
              const preset = key as ApplicationDatePreset;
              const dates = applicationPresetRange(preset);
              setStartDate(dates.startDate);
              setEndDate(dates.endDate);
              setDatePreset(preset);
              setPage(1);
              setChecked({});
              setMessage("");
              setError("");
            }}
          >
            {label}
          </button>
        ))}
        <span className="hint">한국 날짜 기준 · 최근 7일은 오늘 포함</span>
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
            setPage(1);
            setChecked({});
            setMessage("");
          }}
        />
        <label style={{ display: "grid", gap: 4 }}>
          신청일 시작
          <input
            type="date"
            aria-label="신청일 시작"
            value={startDate}
            disabled={busy}
            max={endDate || "9999-12-31"}
            style={{ width: 170, height: 40 }}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
              setDatePreset(null);
              setChecked({});
              setMessage("");
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          신청일 종료
          <input
            type="date"
            aria-label="신청일 종료"
            value={endDate}
            disabled={busy}
            min={startDate || undefined}
            max="9999-12-31"
            style={{ width: 170, height: 40 }}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
              setDatePreset(null);
              setChecked({});
              setMessage("");
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          정렬
          <select
            aria-label="신청일 정렬"
            value={order}
            disabled={busy}
            style={{ width: 170, height: 40 }}
            onChange={(e) => {
              setOrder(e.target.value as ApplicationSort);
              setPage(1);
            }}
          >
            <option value="newest">신청일 최신순</option>
            <option value="oldest">신청일 오래된순</option>
          </select>
        </label>
        {(startDate || endDate) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setPage(1);
              setDatePreset(null);
              setChecked({});
            }}
          >
            기간 지우기
          </button>
        )}
        {search && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSearch("");
              setPage(1);
              setChecked({});
            }}
          >
            검색 지우기
          </button>
        )}
        <button
          type="button"
          disabled={loading || busy || exporting || !pending.length}
          onClick={() => downloadExcel()}
        >
          {exporting
            ? "엑셀 준비 중…"
            : hasConditions
              ? "검색 결과 엑셀 다운로드"
              : "엑셀 다운로드"}
        </button>
        {!loading && (
          <span role="status" className="hint">
            {labels[filter as keyof typeof labels]} ·{" "}
            {hasConditions ? "검색 결과 " : ""}
            {pending.length}건
          </span>
        )}
      </div>
      {rangeError && (
        <p role="alert" className="error">
          {rangeError}
        </p>
      )}
      {(startDate || endDate) && !rangeError && (
        <p className="hint">
          신청일 기준 · 한국 시간 · {startDate || "처음"} ~{" "}
          {endDate || "제한 없음"} (시작일·종료일 포함)
        </p>
      )}
      {selectable && !loading && (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <strong>{picked.length}명 선택</strong>
            <button
              type="button"
              disabled={busy || loading || !pending.length || !!current}
              onClick={() => {
                setChecked(
                  Object.fromEntries(pending.map((i) => [i.id, i.version])),
                );
                setMessage("");
              }}
            >
              검색·기간 결과 전체 선택 ({pending.length}건)
            </button>
            <button
              type="button"
              disabled={busy || !picked.length}
              onClick={() => setChecked({})}
            >
              선택 해제
            </button>
            <button
              type="button"
              disabled={busy || loading || exporting || !picked.length}
              onClick={() => downloadExcel(true)}
            >
              선택한 신청 엑셀 다운로드
            </button>
            {filter !== "approved" && filter !== "unreviewed" && (
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
            )}
            {filter !== "deleted" &&
              filter !== "approved" &&
              filter !== "unreviewed" && (
                <button
                  type="button"
                  disabled={busy || !picked.length || !!current}
                  onClick={() => bulkReview("bulk-delete")}
                >
                  선택한 신청 삭제
                </button>
              )}
            {filter === "unreviewed" && (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !picked.length || !!current}
                  onClick={() => bulkReview("bulk-verify")}
                >
                  선택한 회원 검수 완료 · 보상 확정
                </button>
                <button
                  type="button"
                  disabled={busy || !picked.length || !!current}
                  onClick={() => bulkReview("bulk-exclude")}
                >
                  선택한 회원 검수 완료 · 보상 제외
                </button>
              </>
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
            {filter === "unreviewed"
              ? "등록 정보를 확인한 회원만 검수 완료해주세요. 보상 확정과 실제 지급은 별도입니다."
              : filter === "approved"
                ? "승인 완료된 신청도 선택한 건만 엑셀로 내려받을 수 있습니다."
                : filter === "deleted"
                  ? "삭제 전 신규·반려 상태로 복구합니다. 복구 후 신청 내용을 검토해주세요."
                  : "일괄 승인 시 검토 대기 계정도 승인됩니다. 계정별로 다르게 처리하려면 ‘검토 · 수정’을 이용해주세요."}{" "}
            전체 선택은 검색·기간에 맞는 모든 페이지에 적용됩니다. 일괄 처리는
            100건씩 진행하며, 오류가 나면 완료된 건을 유지하고 나머지는
            중단합니다. 체크는 페이지를 이동해도 유지됩니다. 목록 위 엑셀
            다운로드는 현재 페이지가 아닌 검색·기간 조건의 전체 결과입니다.
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
                      aria-label="현재 페이지 신청 전체 선택"
                      disabled={busy || !pageItems.length || !!current}
                      checked={
                        pageItems.length > 0 &&
                        pagePicked.length === pageItems.length
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            pagePicked.length > 0 &&
                            pagePicked.length < pageItems.length;
                      }}
                      onChange={(e) => {
                        const select = e.target.checked;
                        setChecked((previous) => {
                          const next = { ...previous };
                          for (const item of pageItems) {
                            if (select) {
                              next[item.id] = item.version;
                            } else delete next[item.id];
                          }
                          return next;
                        });
                      }}
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
              {pageItems.map((item) => (
                <tr key={item.id}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 18 }}
                        aria-label={`${item.data.name} 신청 선택`}
                        checked={checked[item.id] !== undefined}
                        disabled={busy || !!current}
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
                      {!item.data.deletedAt &&
                      (item.status !== "approved" ||
                        item.data.reviewStatus === "pending")
                        ? "검토 · 수정"
                        : "내용 보기"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav
            aria-label="신청 목록 페이지"
            className="row"
            style={{
              padding: "16px 0",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <span role="status">
              전체 {pending.length}건 · {pending.length ? pageStart + 1 : 0}–
              {Math.min(pageStart + pageSize, pending.length)}건 표시 ·{" "}
              {currentPage} / {pageCount} 페이지
            </span>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label>
                페이지당{" "}
                <select
                  aria-label="신청 목록 페이지당 개수"
                  value={pageSize}
                  disabled={busy}
                  style={{ width: 90, height: 40 }}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}개
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || currentPage === 1}
                onClick={() => setPage(1)}
              >
                처음
              </button>
              <button
                type="button"
                disabled={busy || currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                이전
              </button>
              <button
                type="button"
                disabled={busy || currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                다음
              </button>
              <button
                type="button"
                disabled={busy || currentPage === pageCount}
                onClick={() => setPage(pageCount)}
              >
                마지막
              </button>
            </div>
          </nav>
          {!items.some(matches) && (
            <p className="empty">
              {hasConditions
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
          {current.data.reviewStatus === "pending" &&
            !current.data.deletedAt && (
              <div className="row">
                <p>
                  자동 승인 · 미검수
                  {current.data.signupBonusAmount
                    ? " · 신규 추천 보상 2,000원 검수 대기"
                    : ""}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review("verify")}
                >
                  검수 완료 · 보상 확정
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review("exclude")}
                >
                  검수 완료 · 보상 제외
                </button>
              </div>
            )}
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
