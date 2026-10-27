"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdvertiserAccess } from "./market-public";
import KakaoPortalLogin from "./kakao-portal-login";
export default function LoginScreen({
  next,
  register,
  initialRole,
}: {
  next: string;
  register: boolean;
  initialRole: "advertiser" | "participant";
}) {
  const [role, setRole] = useState(initialRole);
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    try {
      if (next && role === "participant")
        sessionStorage.setItem("om_campaign_return", next);
      else if (sessionStorage.getItem("om_campaign_return") === next)
        sessionStorage.removeItem("om_campaign_return");
    } catch {}
  }, [next, role]);
  return (
    <div className="auth-page">
      {!onboarding && !(register && role === "advertiser") && (
        <>
          <h1>{register ? "회원가입" : "로그인"}</h1>
          <p>이용할 계정을 선택해주세요.</p>
        </>
      )}
      {!onboarding && (
        <div className="auth-roles" aria-label="계정 유형">
          <button
            aria-pressed={role === "advertiser"}
            onClick={() => setRole("advertiser")}
          >
            광고주
          </button>
          <button
            aria-pressed={role === "participant"}
            onClick={() => setRole("participant")}
          >
            체험단
          </button>
        </div>
      )}
      {role === "advertiser" ? (
        <AdvertiserAccess
          key={String(register)}
          register={register}
          returnTo={next}
          onOnboardingChange={setOnboarding}
        />
      ) : (
        <div className="participant-portal portal-entry auth-participant">
          <KakaoPortalLogin
            access=""
            onAuthenticated={async () => {
              location.assign(next || "/participants/portal");
            }}
          />
        </div>
      )}
      {!onboarding && (
        <p className="auth-admin">
          운영 담당자는 <Link href="/admin">관리자 로그인</Link>을 이용해주세요.
        </p>
      )}
    </div>
  );
}
