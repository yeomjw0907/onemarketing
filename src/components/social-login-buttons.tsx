"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  socialProviderLabels,
  type SocialProvider,
} from "@/lib/social-identity";
export default function SocialLoginButtons({
  providers,
  role,
  access = "",
  disabled = false,
  includeKakao = false,
  onError,
}: {
  providers: Partial<Record<SocialProvider, boolean>>;
  role: "participant" | "advertiser";
  access?: string;
  disabled?: boolean;
  includeKakao?: boolean;
  naverReviewPending?: boolean;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {(includeKakao
        ? (["kakao", "google"] as const)
        : (["google"] as const)
      ).map(
        (provider) =>
          providers[provider] && (
            <button
              key={provider}
              type="button"
              aria-label={`${socialProviderLabels[provider]}로 가입·로그인`}
              className="ui-button secondary"
              disabled={disabled || busy}
              style={{
                background: provider === "kakao" ? "#fee500" : "#fff",
                color: "#1f1f1f",
                border:
                  provider === "kakao"
                    ? "1px solid #fee500"
                    : "1px solid #747775",
                minHeight: 48,
                height: 48,
                margin: 0,
                borderRadius: 12,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: 12,
                gap: 10,
                fontFamily:
                  provider === "google"
                    ? '"Google Sans", Arial, sans-serif'
                    : undefined,
              }}
              onClick={async () => {
                setBusy(true);
                onError("");
                try {
                  const response = await fetch(`/api/auth/${provider}/start`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      role,
                      access: access || undefined,
                      referralCode:
                        role === "participant"
                          ? new URLSearchParams(location.search).get("ref") ||
                            undefined
                          : undefined,
                    }),
                  });
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(
                      result.error || "로그인을 시작하지 못했어요.",
                    );
                  sessionStorage.removeItem("om_portal_access");
                  location.assign(result.url);
                } catch (e) {
                  onError(
                    e instanceof Error
                      ? e.message
                      : "로그인을 다시 시도해주세요.",
                  );
                  setBusy(false);
                }
              }}
            >
              <Image
                src={
                  provider === "google"
                    ? "/brands/google-login.png"
                    : "/brands/kakao-login.svg"
                }
                alt=""
                width={provider === "google" ? 200 : 20}
                height={provider === "google" ? 204 : 20}
                style={{ width: 20, height: "auto" }}
              />
              {provider === "google" ? "Google로 계속하기" : "카카오 로그인"}
            </button>
          ),
      )}
    </div>
  );
}

export function SocialSignupOptions() {
  const [state, setState] = useState<{
      providers: Partial<Record<SocialProvider, boolean>>;
      pending: unknown;
      naverReviewPending?: boolean;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/kakao/account")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("간편 로그인 상태를 확인하지 못했어요.");
        return response.json();
      })
      .then((result) => {
        if (active) setState(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!state) return null;
  if (state.pending)
    return (
      <p role="status">
        간편 인증을 마쳤어요. 아래에서 가입 정보를 입력해주세요.
      </p>
    );
  return (
    <div aria-label="간편 회원가입">
      <SocialLoginButtons
        providers={state.providers}
        role="participant"
        includeKakao
        naverReviewPending={state.naverReviewPending}
        onError={setError}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
