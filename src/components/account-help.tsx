"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import PublicShell from "./public-shell";
import { marketFetch } from "./public-fetch";
import type { AccountRequest } from "@/lib/account-requests";
import s from "./account-help.module.css";
import { ownershipHelpPath } from "@/lib/application-account-readiness";
const categories = {
  withdrawal: "회원 탈퇴",
  privacy: "개인정보·자료 삭제",
  profile: "회원 정보·로그인",
  settlement: "정산·환불 문의",
};
const statuses = {
  requested: "접수 완료",
  reviewing: "담당자 확인 중",
  answered: "답변 등록",
  cancelled: "요청 철회",
};
type Role = "advertiser" | "participant" | "admin";

export default function AccountHelp({ admin = false }: { admin?: boolean }) {
  const [role, setRole] = useState<Role>(admin ? "admin" : "advertiser");
  const [rows, setRows] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState(""),
    [unauthorized, setUnauthorized] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [ownership, setOwnership] = useState(false);
  const [initialCategory, setInitialCategory] = useState("withdrawal");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const category = params.get("category");
    if (!admin && category && Object.hasOwn(categories, category))
      setInitialCategory(category);
    setOwnership(
      !admin &&
        params.get("role") === "participant" &&
        params.get("intent") === "ownership",
    );
    if (
      !admin &&
      new URLSearchParams(location.search).get("role") === "participant"
    )
      setRole("participant");
    setReady(true);
  }, [admin]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    setError("");
    setUnauthorized(false);
    setRows([]);
    setResponses({});
    marketFetch("/api/account-requests?role=" + role)
      .then((d) => {
        if (active) setRows(d.requests);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setUnauthorized(e.status === 401);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, refresh, ready]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await marketFetch("/api/account-requests", {
        role,
        action: "request",
        data: {
          category: f.get("category"),
          message: f.get("message"),
          consent: f.get("consent") === "on",
        },
      });
      setRows((old) => [
        result.request,
        ...old.filter((r) => r.id !== result.request.id),
      ]);
      setNotice(
        result.existing
          ? "같은 유형의 요청이 처리 중이에요. 아래 접수 내역을 확인해주세요."
          : "요청을 접수했어요. 아래에서 처리 상황과 답변을 확인할 수 있어요.",
      );
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function update(
    row: AccountRequest,
    status: "reviewing" | "answered" | "cancelled",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await marketFetch("/api/account-requests", {
        role,
        action: "update",
        data: {
          id: row.id,
          version: row.version,
          status,
          ...(status === "answered"
            ? { response: responses[row.id] || "" }
            : {}),
        },
      });
      setRows((old) => old.map((r) => (r.id === row.id ? result.request : r)));
      setNotice(
        status === "cancelled"
          ? "요청을 철회했어요."
          : "처리 상황을 저장했어요.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell>
      <div className={s.page}>
        <header>
          <h1>{admin ? "회원 요청 관리" : "계정·정산 문의"}</h1>
          <p>회원 정보, 탈퇴, 개인정보와 정산 요청의 처리 상황을 확인하세요.</p>
        </header>
        {admin ? (
          <p>
            <Link href="/admin/platform">주문·캠페인 관리로 이동</Link>
          </p>
        ) : (
          <nav className={s.roles} aria-label="요청 계정 유형">
            {(["advertiser", "participant"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={role === value}
                disabled={busy}
                onClick={() => {
                  setNotice("");
                  setRole(value);
                  history.replaceState(null, "", "/account?role=" + value);
                }}
              >
                {value === "advertiser" ? "광고주" : "체험단"}
              </button>
            ))}
          </nav>
        )}
        {error && (
          <div role="alert" className={s.error}>
            <p>{error}</p>
            <button
              disabled={busy || loading}
              onClick={() => setRefresh((v) => v + 1)}
            >
              다시 불러오기
            </button>
            {unauthorized && (
              <p>
                <Link
                  href={
                    admin
                      ? "/admin"
                      : role === "participant"
                        ? "/login?role=participant&next=" +
                          encodeURIComponent(
                            ownership
                              ? ownershipHelpPath
                              : "/account?role=participant",
                          )
                        : "/login?role=advertiser&next=%2Faccount"
                  }
                >
                  로그인하기
                </Link>
              </p>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className={s.notice}>
            {notice}
          </p>
        )}
        {loading ? (
          <p role="status">접수 내역을 불러오고 있어요.</p>
        ) : (
          <>
            {!error && !admin && (
              <section aria-labelledby="new-request">
                <h2 id="new-request">요청 접수</h2>
                <p>
                  탈퇴·삭제는 본인 확인과 남은 업무·정산 확인 후 담당자가
                  처리합니다. 접수만으로 계정이 삭제되지는 않아요.
                </p>
                <p>
                  비밀번호, 인증번호, 주민등록번호, 전체 계좌번호는 입력하지
                  마세요.
                </p>
                <form onSubmit={submit} className={s.form}>
                  <label>
                    요청 유형
                    <select
                      name="category"
                      defaultValue={ownership ? "profile" : initialCategory}
                      disabled={busy}
                      required
                    >
                      {Object.entries(categories).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    요청 내용
                    <textarea
                      name="message"
                      required
                      minLength={5}
                      maxLength={2000}
                      rows={5}
                      disabled={busy}
                      placeholder="도움이 필요한 내용이나 관련 캠페인을 알려주세요."
                      defaultValue={
                        ownership
                          ? "활동 계정의 소유·관리 권한 확인을 요청합니다. 확인이 필요한 활동 계정 URL과 확인 가능한 방법을 아래에 적겠습니다.\n"
                          : ""
                      }
                    />
                  </label>
                  <label className={s.consent}>
                    <input
                      type="checkbox"
                      name="consent"
                      required
                      disabled={busy}
                    />
                    요청 처리에 필요한 내용의 수집·이용에 동의합니다.
                  </label>
                  <button className={s.primary} disabled={busy}>
                    {busy ? "처리 중…" : "요청 접수하기"}
                  </button>
                </form>
              </section>
            )}
            {admin && (
              <p>
                탈퇴·삭제 요청은 남은 작업, 미지급 보수, 환불, 계정 연결과
                보관할 거래 이력을 확인한 뒤 처리 내용을 답변하세요. 답변 등록이
                계정 삭제를 실행하지는 않습니다.
              </p>
            )}
            <section aria-labelledby="request-history">
              <div className={s.heading}>
                <h2 id="request-history">
                  {admin ? "최근 접수 내역" : "내 접수 내역"}
                </h2>
                <button
                  disabled={loading || busy}
                  onClick={() => setRefresh((v) => v + 1)}
                >
                  새로고침
                </button>
              </div>
              {!error && rows.length === 0 && <p>접수한 요청이 없어요.</p>}
              {rows.map((row) => (
                <article className={s.request} key={row.id}>
                  <div className={s.heading}>
                    <h3>{categories[row.category]}</h3>
                    <strong>{statuses[row.status]}</strong>
                  </div>
                  <p className={s.meta}>
                    {new Date(row.createdAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · 접수번호 {row.id.slice(0, 8)}
                  </p>
                  {admin && (
                    <p className={s.meta}>
                      {row.role === "advertiser" ? "광고주" : "참여자"} ·
                      회원번호 {row.ownerId}
                    </p>
                  )}
                  <p className={s.message}>{row.message}</p>
                  {row.response && (
                    <div className={s.answer}>
                      <strong>담당자 답변</strong>
                      <p className={s.message}>{row.response}</p>
                    </div>
                  )}
                  {["requested", "reviewing"].includes(row.status) &&
                    (admin ? (
                      <div className={s.form}>
                        {row.status === "requested" && (
                          <button
                            disabled={busy}
                            onClick={() => void update(row, "reviewing")}
                          >
                            확인 시작
                          </button>
                        )}
                        <label>
                          처리 내용·다음 절차
                          <textarea
                            rows={3}
                            minLength={5}
                            maxLength={2000}
                            disabled={busy}
                            value={responses[row.id] || ""}
                            onChange={(e) =>
                              setResponses((old) => ({
                                ...old,
                                [row.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          disabled={
                            busy || (responses[row.id]?.trim().length || 0) < 5
                          }
                          onClick={() => void update(row, "answered")}
                        >
                          답변 등록
                        </button>
                      </div>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => void update(row, "cancelled")}
                      >
                        요청 철회
                      </button>
                    ))}
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </PublicShell>
  );
}
