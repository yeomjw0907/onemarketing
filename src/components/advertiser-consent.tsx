"use client";
import { useState } from "react";
import { AdvertiserAccess } from "./market-public";
import PublicShell from "./public-shell";
import { marketFetch } from "./public-fetch";
import s from "./platform.module.css";
export default function AdvertiserConsent({
  request,
  clientName,
  scopes,
  error: initialError,
}: {
  request: string;
  clientName: string;
  scopes: string[];
  error: string;
}) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function consent(allow: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await marketFetch("/advertiser/oauth/consent", {
        request,
        allow,
      });
      location.assign(r.redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <PublicShell>
      <section className={s.section}>
        <h1>내 광고주 계정을 AI에 연결</h1>
        {initialError ? (
          <p role="alert">{initialError}</p>
        ) : (
          <>
            <p>
              <strong>{clientName}</strong>에서 내 캠페인에 접근하려고 합니다.
              연결을 요청한 앱이 맞는지 확인하세요.
            </p>
            <ul>
              {scopes.map((scope) => (
                <li key={scope}>
                  {scope === "campaigns:read"
                    ? "내 캠페인·주문·지원·검수·환불 내역 조회"
                    : "확인한 구성·가격으로 신규 주문 접수"}
                </li>
              ))}
            </ul>
            <p>
              관리자 권한, 다른 광고주 자료, 송금 실행 권한은 제공하지 않습니다.
              연결은 90일 후 만료되며 AI 연결 관리에서 언제든 해제할 수
              있습니다.
            </p>
            <AdvertiserAccess />
            <p>위에서 광고주 로그인 후, 연결할 계정을 확인하고 허용하세요.</p>
            <div className={s.actions}>
              <button
                className={s.primary}
                disabled={busy}
                onClick={() => consent(true)}
              >
                이 계정으로 연결 허용
              </button>
              <button disabled={busy} onClick={() => consent(false)}>
                연결 거절
              </button>
            </div>
          </>
        )}
        {error && !initialError && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
      </section>
    </PublicShell>
  );
}
