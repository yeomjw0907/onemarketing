"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Field, Form, Feedback } from "./ui/workflow-ui";
type Pending = { nickname: string; hasCandidate: boolean; status?: string };
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
  async function refresh() {
    const r = await fetch("/api/auth/kakao/account");
    if (!r.ok) throw new Error("로그인 상태를 확인하지 못했어요.");
    const d = await r.json();
    setPending(d.pending);
    setEnabled(d.enabled);
    setReady(true);
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
        {pending ? "기존 참여자 계정 연결" : "카카오로 간편하게 시작하세요"}
      </h2>
      {!ready ? (
        <p className="muted">로그인 상태를 확인하고 있어요.</p>
      ) : pending ? (
        <>
          <p className="muted">
            {pending.nickname}님, 처음 한 번 기존 참여자 정보를 연결하면
            다음부터 카카오 로그인만으로 내 작업을 볼 수 있어요.
          </p>
          {pending.status === "pending" ? (
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
                <Link className="ui-text-link" href="/participants/apply">
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
          <p className="muted">
            원케이션 채널 추가는 선택이에요. 추가하지 않아도 참여할 수 있어요.
          </p>
        </>
      )}
    </section>
  );
}
