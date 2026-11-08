"use client";
import { useEffect, useRef, useState } from "react";
import BrandOrb from "./brand-orb";
import Image from "next/image";
import SocialLoginButtons from "./social-login-buttons";
import type { SocialProvider } from "@/lib/social-identity";
import { socialSignupPath } from "@/lib/social-referral";
import { participantPortalReturn } from "@/lib/login-entry";
import { Button, Feedback } from "./ui/workflow-ui";
type Pending = {
  provider?: SocialProvider;
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
    [naverReviewPending, setNaverReviewPending] = useState(false),
    [providers, setProviders] = useState<
      Partial<Record<SocialProvider, boolean>>
    >({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const autoAttempted = useRef(false);
  async function refresh() {
    const r = await fetch("/api/auth/kakao/account");
    if (!r.ok) throw new Error("로그인 상태를 확인하지 못했어요.");
    const d = await r.json();
    setPending(d.pending);
    setEnabled(d.enabled);
    setProviders(d.providers || {});
    setNaverReviewPending(d.naverReviewPending === true);
    setReady(true);
    if (d.pending) {
      if (d.pending.status === "approved") await action("continue");
      else if (d.pending.status !== "application_pending")
        location.replace(
          socialSignupPath(
            d.pending.provider || "kakao",
            d.pending.referralCode,
          ),
        );
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
          body: JSON.stringify({
            silent: true,
            next:
              participantPortalReturn(location.pathname, location.search) ||
              undefined,
            access: access || undefined,
            referralCode:
              new URLSearchParams(location.search).get("ref") || undefined,
          }),
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
      setError("간편 로그인을 완료하지 못했어요. 다시 시도해주세요.");
  }, []);
  async function action(type: "login" | "continue") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        type === "login"
          ? `/api/auth/${pending?.provider || "kakao"}/start`
          : "/api/auth/kakao/account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: type,
            next:
              participantPortalReturn(location.pathname, location.search) ||
              undefined,
            access: access || undefined,
            reselect: !!pending,
            referralCode:
              new URLSearchParams(location.search).get("ref") || undefined,
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
      <h2>{pending ? "참여 신청 확인" : "간편 로그인으로 시작하세요"}</h2>
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
            간편 로그인 다시 시작
          </Button>
          <SocialLoginButtons
            providers={providers}
            naverReviewPending={naverReviewPending}
            role="participant"
            access={access}
            disabled={busy}
            onError={setError}
          />
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
            <Image
              src="/brands/kakao-login.svg"
              alt=""
              width={20}
              height={20}
            />
            카카오 로그인
          </Button>
          {!enabled && (
            <p className="muted">카카오 로그인 연결을 준비 중이에요.</p>
          )}
          <SocialLoginButtons
            providers={providers}
            naverReviewPending={naverReviewPending}
            role="participant"
            access={access}
            disabled={busy}
            onError={setError}
          />
        </>
      )}
    </section>
  );
}
