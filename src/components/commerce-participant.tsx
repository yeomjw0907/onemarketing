"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { marketFetch } from "./public-fetch";
import { appStates, money } from "@/lib/commerce-policy";
import s from "./platform.module.css";
type Row = Record<string, any>;
export function CommerceOpportunities() {
  const [rows, setRows] = useState<Row[]>([]),
    [member, setMember] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    marketFetch("/api/commerce?mode=campaigns")
      .then(setRows)
      .catch((e) => setError(e.message));
    marketFetch("/api/participant-portal")
      .then(setMember)
      .catch(() => {});
  }, []);
  return (
    <section className={s.section}>
      <h2>새 캠페인 모집</h2>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      {!rows.length && <p>모집이 열리면 이곳에서 확인할 수 있어요.</p>}
      {rows.map((c) => (
        <details className={s.panel} key={c.id}>
          <summary>
            {c.brand} · {c.title} · {money(c.reward)} / {c.quantity}명
          </summary>
          <p>
            채널 {c.channel} · 모집 {c.deadline} · 제출 {c.submissionDeadline}
          </p>
          <p>{c.benefit}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{c.guide}</p>
          {!member ? (
            <p>
              <Link href="/participants/portal">
                로그인·채널 확인 후 지원하기
              </Link>
            </p>
          ) : (
            <form
              className={s.form}
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await marketFetch("/api/commerce", {
                    role: "participant",
                    action: "apply",
                    data: {
                      campaignId: c.id,
                      blogAccountId: String(f.get("blogAccountId") || ""),
                      clipAccountId: String(f.get("clipAccountId") || ""),
                      message: String(f.get("message") || ""),
                      consent: true,
                    },
                  });
                  setNotice(
                    "지원했습니다. 나의 활동에서 선정 결과와 참여 제안을 확인하세요.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {(c.channel === "bundle" ? ["blog", "clip"] : [c.channel]).map(
                (channel) => (
                  <label key={channel}>
                    {channel === "blog" ? "블로그" : "클립"} 활동 계정
                    <select name={channel + "AccountId"} required>
                      <option value="">계정 선택</option>
                      {(member.accounts || member.participant?.accounts || [])
                        .filter(
                          (a: Row) =>
                            a.approvalStatus !== "pending" &&
                            a.approvalStatus !== "rejected" &&
                            (a.channel === channel ||
                              (channel === "clip" && a.channel === "blog")),
                        )
                        .map((a: Row) => (
                          <option value={a.id} key={a.id}>
                            {a.label || a.url}
                          </option>
                        ))}
                    </select>
                  </label>
                ),
              )}
              <label className={s.wide}>
                지원 한마디
                <textarea name="message" maxLength={1000} />
              </label>
              <label className={s.wide}>
                <span>
                  <input type="checkbox" required /> 가이드·리워드·일정을
                  확인했습니다. 선정 후 수락해야 참여가 확정됩니다.
                </span>
              </label>
              <button className={s.primary} disabled={busy}>
                캠페인 지원
              </button>
            </form>
          )}
        </details>
      ))}
    </section>
  );
}
export function CommerceParticipant({ focusId = "" }: { focusId?: string }) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    setData(await marketFetch("/api/commerce?role=participant"));
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (focusId) setFilter("all");
    if (data && focusId)
      requestAnimationFrame(() =>
        document
          .getElementById("my-campaign-" + focusId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
  }, [data, focusId]);
  async function act(a: Row, action: string, links?: Row) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await marketFetch("/api/commerce", {
        role: "participant",
        action: "participant",
        data: {
          id: a.id,
          version: a.version,
          action,
          ...(links ? { links } : {}),
        },
      });
      await load();
      window.dispatchEvent(new Event("om-commerce-update"));
      setNotice("작업 상태를 저장했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.panel}>
      <div className={s.row}>
        <h2>내 캠페인 · 참여·제출·리워드</h2>
        <button
          disabled={busy}
          onClick={() =>
            load()
              .then(() => setError(""))
              .catch((e) => setError(e.message))
          }
        >
          새로고침
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && !data.campaigns.length && (
        <p>
          새 캠페인 지원 내역이 없습니다.{" "}
          <Link href="/campaigns">캠페인 찾기 →</Link>
        </p>
      )}
      {data && (
        <div className="queue-filters" aria-label="내 캠페인 상태">
          {[
            ["all", "전체"],
            ["action", "수락·제출 필요"],
            ["submitted", "검수 대기"],
            ["paid", "리워드 지급"],
          ].map(([k, v]) => (
            <button
              key={k}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {data?.campaigns
        .filter(
          (c: Row) =>
            filter === "all" ||
            c.applications.some((a: Row) =>
              filter === "action"
                ? ["selected", "accepted", "revision"].includes(a.data.status)
                : a.data.status === filter,
            ),
        )
        .map((c: Row) => (
          <article className={s.list} key={c.id} id={"my-campaign-" + c.id}>
            <h3>{c.data.input.title}</h3>
            <p>
              제출 마감 {c.data.input.submissionDeadline} ·{" "}
              {c.data.status === "paused" ? "진행 보류 · 담당자 문의" : ""}
            </p>
            <details>
              <summary>가이드 확인</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{c.data.input.guide}</p>
              <p>{c.data.input.benefit}</p>
            </details>
            {c.applications.map((a: Row) => (
              <div key={a.id}>
                <p>
                  <strong>{appStates[a.data.status] || a.data.status}</strong> ·
                  약정 리워드 {money(a.data.amount)}
                </p>
                {a.data.expiresAt && a.data.status === "selected" && (
                  <p>
                    수락 기한{" "}
                    {new Date(a.data.expiresAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                )}
                {a.data.status === "applied" && (
                  <button disabled={busy} onClick={() => act(a, "withdraw")}>
                    지원 철회
                  </button>
                )}
                {a.data.status === "selected" && (
                  <div className={s.actions}>
                    <button
                      className={s.primary}
                      disabled={busy}
                      onClick={() => act(a, "accept")}
                    >
                      조건 확인·참여 수락
                    </button>
                    <button disabled={busy} onClick={() => act(a, "decline")}>
                      참여 거절
                    </button>
                  </div>
                )}
                {a.data.materials && (
                  <details open>
                    <summary>전달받은 제작 자료</summary>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {a.data.materials.copy}
                    </p>
                    {a.data.materials.assetIds?.map((id: string, i: number) => (
                      <p key={id}>
                        <a href={"/api/commerce/files/" + id}>
                          제작 파일 {i + 1} 다운로드
                        </a>
                      </p>
                    ))}
                    {a.data.materials.urls.map((u: string, i: number) => (
                      <p key={u}>
                        <a href={u} target="_blank" rel="noreferrer">
                          자료 {i + 1} 열기 ↗
                        </a>
                      </p>
                    ))}
                  </details>
                )}
                {a.data.note && <p>안내·수정 요청: {a.data.note}</p>}
                {["accepted", "revision"].includes(a.data.status) && (
                  <form
                    className={s.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(
                        a,
                        "submit",
                        Object.fromEntries(
                          Object.keys(a.data.accounts).map((channel) => [
                            channel,
                            String(f.get(channel) || ""),
                          ]),
                        ),
                      );
                    }}
                  >
                    {Object.keys(a.data.accounts).map((channel) => (
                      <label key={channel}>
                        {channel} 게시 URL
                        <input
                          name={channel}
                          type="url"
                          defaultValue={a.data.links?.[channel]}
                          required
                          maxLength={2000}
                        />
                      </label>
                    ))}
                    <label className={s.wide}>
                      <span>
                        <input type="checkbox" required /> 약정한 광고 표기·게시
                        조건을 확인했습니다.
                      </span>
                    </label>
                    <button className={s.primary} disabled={busy}>
                      게시 링크 제출
                    </button>
                  </form>
                )}
                {a.data.links &&
                  Object.entries(a.data.links).map(([channel, url]) => (
                    <p key={channel}>
                      <a href={String(url)} target="_blank" rel="noreferrer">
                        {channel} 제출 링크 ↗
                      </a>
                    </p>
                  ))}
                {a.data.paidAt && (
                  <p>
                    리워드 지급 기록{" "}
                    {new Date(a.data.paidAt).toLocaleDateString("ko-KR")} · 실제
                    수령에 문제가 있다면 담당자에게 문의하세요.
                  </p>
                )}
              </div>
            ))}
          </article>
        ))}
    </section>
  );
}
