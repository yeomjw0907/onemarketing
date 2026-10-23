"use client";
import { useEffect, useRef, useState } from "react";
import BrandOrb from "./brand-orb";
import { Button, Feedback } from "./ui/workflow-ui";
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
    [error, setError] = useState("");
  const autoAttempted = useRef(false);
  async function refresh() {
    const r = await fetch("/api/auth/kakao/account");
    if (!r.ok) throw new Error("로그인 상태를 확인하지 못했어요.");
    const d = await r.json();
    setPending(d.pending);
    setEnabled(d.enabled);
    setReady(true);
    if (d.pending) {
      if (d.pending.status === "approved") await action("continue");
      else if (d.pending.status !== "application_pending")
        location.replace("/participants/apply?kakao=1");
      return;
    }
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
  async function action(type: "login" | "continue") {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="portal-auth">
      {error && <Feedback tone="error">{error}</Feedback>}
      <h2>{pending ? "참여 신청 확인" : "카카오로 간편하게 시작하세요"}</h2>
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
            {pending.nickname}님, 참여 신청 상태를 확인하고 있어요.
          </p>
          {pending.status === "application_pending" ? (
            <>
              <Feedback tone="info">
                참여 신청을 접수했어요. 신청 상태를 확인해주세요.
              </Feedback>
              <Button busy={busy} onClick={() => void action("continue")}>
                신청 상태 확인
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
            <p className="muted">참여 신청 화면으로 이동하고 있어요.</p>
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
