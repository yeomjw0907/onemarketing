"use client";
import { useEffect, useRef, useState } from "react";
import BrandOrb from "./brand-orb";
import SocialOnboardingChoice from "./social-onboarding-choice";
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
  referralCode?: string;
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
  const [linking, setLinking] = useState(false);
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
      {!pending && (
        <>
          <h2>체험단 로그인·회원가입</h2>
          <p className="muted">
            연결된 계정은 바로 로그인되고, 처음이라면 가입을 이어가요.
          </p>
        </>
      )}
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
          ) : pending.status === "pending" ? (
            <>
              <Feedback tone="info">
                기존 계정 연결 요청을 접수했어요. 담당자가 등록 연락처로 본인
                확인 후 연결합니다.
              </Feedback>
              <Button
                busy={busy}
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                연결 상태 확인
              </Button>
            </>
          ) : linking ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const response = await fetch("/api/auth/kakao/account", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "request",
                      name: form.get("name"),
                      phone: form.get("phone"),
                    }),
                  });
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(
                      result.error || "연결 요청을 접수하지 못했어요.",
                    );
                  setLinking(false);
                  await refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "다시 시도해주세요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>기존 체험단 계정 연결</h2>
              <p>
                기존 가입 시 등록한 이름과 휴대폰 번호를 입력해주세요. 담당자가
                본인 확인 후 연결하며, 입력만으로 계정이 연결되지는 않아요.
              </p>
              <label>
                등록 이름
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  disabled={busy}
                />
              </label>
              <label>
                등록 휴대폰 번호
                <input
                  name="phone"
                  type="tel"
                  required
                  maxLength={20}
                  autoComplete="tel"
                  disabled={busy}
                />
              </label>
              <Button variant="primary" busy={busy}>
                연결 확인 요청하기
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setLinking(false)}
              >
                시작 방법으로 돌아가기
              </button>
            </form>
          ) : (
            <SocialOnboardingChoice
              role="participant"
              busy={busy}
              onNew={() =>
                location.assign(
                  socialSignupPath(
                    pending.provider || "kakao",
                    pending.referralCode,
                  ),
                )
              }
              onExisting={() => setLinking(true)}
            />
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
          {!enabled && (
            <p className="muted">카카오 로그인 연결을 준비 중이에요.</p>
          )}
          <SocialLoginButtons
            providers={{ ...providers, kakao: enabled }}
            includeKakao
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
