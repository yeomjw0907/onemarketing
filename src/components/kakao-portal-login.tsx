"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandOrb from "./brand-orb";
import { Button, Field, Form, Feedback } from "./ui/workflow-ui";
type Pending = {
  nickname: string;
  hasCandidate: boolean;
  status?: string;
  applicationStatus?: string;
};
export default function KakaoPortalLogin({
  access,
  onAuthenticated,
}: {
  access: string;
  onAuthenticated: () => Promise<void>;
}) {
  const [pending, setPending] = useState<Pending | null>(null),
    [ready, setReady] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [phone, setPhone] = useState("");
  const autoAttempted = useRef(false);
  async function refresh() {
    const r = await fetch("/api/auth/kakao/account");
    if (!r.ok) throw new Error("로그인 상태를 확인하지 못했어요.");
    const d = await r.json();
    setPending(d.pending);
    setEnabled(d.enabled);
    setReady(true);
    const params = new URL(location.href).searchParams;
    if (
      d.enabled &&
      !d.pending &&
      !autoAttempted.current &&
      /KAKAOTALK/i.test(navigator.userAgent) &&
      !params.has("loginError") &&
      params.get("autoLogin") !== "skipped" &&
      sessionStorage.getItem("om_kakao_auto_skip") !== "1"
    ) {
      autoAttempted.current = true;
      setBusy(true);
      try {
        const response = await fetch("/api/auth/kakao/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ silent: true, access: access || undefined }),
        });
        const result = await response.json();
        if (response.ok) location.assign(result.url);
        else setBusy(false);
      } catch {
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    void refresh().catch((e) => {
      setError(e.message);
      setReady(true);
    });
    if (new URL(location.href).searchParams.has("loginError"))
      setError("카카오 로그인을 완료하지 못했어요. 다시 시도해주세요.");
  }, []);
  async function action(type: "login" | "request" | "continue") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        type === "login" ? "/api/auth/kakao/start" : "/api/auth/kakao/account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: type,
            access: access || undefined,
            reselect: !!pending,
            name,
            phone,
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (type === "login") {
        sessionStorage.removeItem("om_kakao_auto_skip");
        sessionStorage.removeItem("om_portal_access");
        location.assign(d.url);
      } else if (type === "continue") await onAuthenticated();
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="portal-auth">
      {error && <Feedback tone="error">{error}</Feedback>}
      <h2>
        {pending?.applicationStatus
          ? "참여 신청 확인"
          : pending
            ? "기존 참여자 계정 연결"
            : "카카오로 간편하게 시작하세요"}
      </h2>
      {!ready ? (
        <p className="muted">
          <BrandOrb
            active={!ready && !error}
            state="connecting"
            label="로그인 상태를 확인하고 있어요."
          />
        </p>
      ) : pending ? (
        <>
          <p className="muted">
            {pending.nickname}님,{" "}
            {pending.applicationStatus
              ? "신청 상태를 확인하고, 승인 후 내 작업 화면으로 이동할 수 있어요."
              : "처음 참여하신다면 체험단을 신청해주세요. 이미 등록된 참여자는 계정을 한 번 연결하면 돼요."}
          </p>
          {pending.status === "application_pending" ? (
            <>
              <Feedback tone="info">
                참여 신청을 접수했어요. 담당자가 신청 내용을 검토 중이에요.
              </Feedback>
              <Button busy={busy} onClick={() => void action("continue")}>
                신청 상태 확인
              </Button>
            </>
          ) : pending.status === "pending" ? (
            <>
              <Feedback tone="info">
                연결 요청을 접수했어요. 담당자가 등록된 연락처로 확인한 뒤
                연결해드려요.
              </Feedback>
              <Button busy={busy} onClick={() => void action("continue")}>
                연결 상태 확인
              </Button>
            </>
          ) : pending.status === "approved" ? (
            <Button
              variant="primary"
              busy={busy}
              onClick={() => void action("continue")}
            >
              내 작업으로 이동
            </Button>
          ) : (
            <>
              {pending.status === "rejected" && (
                <Feedback tone="error">
                  연결 요청을 확인하지 못했어요. 정보를 확인해 다시
                  요청해주세요.
                </Feedback>
              )}
              {!pending.hasCandidate && (
                <p>
                  <Link
                    className="ui-text-link"
                    href="/participants/apply?kakao=1"
                  >
                    {pending.applicationStatus === "rejected"
                      ? "참여 신청 다시 작성하기"
                      : "신규 체험단 신청하기"}
                  </Link>
                </p>
              )}
              {pending.applicationStatus === "rejected" && (
                <Feedback tone="info">
                  이번 신청은 승인되지 않았어요. 자세한 내용은 담당자에게
                  문의해주세요.
                </Feedback>
              )}
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("request");
                }}
              >
                <Field>
                  등록된 이름
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field>
                  등록된 휴대폰 번호
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    placeholder="01012345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" busy={busy}>
                  기존 참여자 연결 요청
                </Button>
              </Form>
              <p className="muted">
                처음 참여하시나요?{" "}
                <Link
                  className="ui-text-link"
                  href="/participants/apply?kakao=1"
                >
                  체험단 신청하기
                </Link>
              </p>
            </>
          )}
          <Button
            variant="text"
            busy={busy}
            onClick={() => void action("login")}
          >
            카카오 계정 다시 선택
          </Button>
        </>
      ) : (
        <>
          <p className="muted">
            참여 제안부터 게시·정산까지, 내 작업을 한곳에서 확인하세요.
          </p>
          <Button
            className="kakao-login-button"
            busy={busy}
            disabled={!enabled}
            onClick={() => void action("login")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 3C6.48 3 2 6.52 2 10.86c0 2.78 1.83 5.22 4.6 6.62l-1.17 4.3 5.1-3.1c.48.05.97.08 1.47.08 5.52 0 10-3.53 10-7.9S17.52 3 12 3Z"
              />
            </svg>
            카카오로 시작하기
          </Button>
          {!enabled && (
            <p className="muted">카카오 로그인 연결을 준비 중이에요.</p>
          )}
        </>
      )}
    </section>
  );
}
