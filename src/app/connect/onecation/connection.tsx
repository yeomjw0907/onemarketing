"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Feedback, Form } from "@/components/ui/workflow-ui";
import styles from "./connection.module.css";
const labels: Record<string, string> = {
  "catalog:read": "고객·제품과 캠페인 상품 조회",
  "catalog:write": "고객·제품 신규 등록",
  "campaigns:draft": "견적·캠페인 초안 저장",
};
export default function Connection({
  email,
  request,
  consent,
  error,
  connections,
  endpoint,
}: {
  email: string | null;
  request?: string;
  consent?: { clientName: string; scopes: string[] };
  error: string;
  connections: { id: string; name: string; scopes: string[] }[];
  endpoint: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function call(path: string, body: unknown, method = "POST") {
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok)
      throw new Error(d.error_description || d.error || "처리하지 못했어요.");
    return d;
  }
  async function authorize(allow: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const d = await call("/api/mcp/authorize", { request, allow });
      window.location.assign(d.redirect);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "다시 시도해주세요.");
      setBusy(false);
    }
  }
  return (
    <>
      {(error || message) && (
        <Feedback tone="error">{error || message}</Feedback>
      )}
      {!email ? (
        <section className={styles.panel}>
          <h2>관리자로 로그인해주세요</h2>
          <p>기존 원케이션 관리자 계정으로 연결 권한을 확인해요.</p>
          <Form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setMessage("");
              try {
                await call("/api/auth", {
                  email: f.get("email"),
                  password: f.get("password"),
                });
                router.refresh();
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "로그인에 실패했어요.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field>
              이메일
              <input
                required
                name="email"
                type="email"
                autoComplete="username"
              />
            </Field>
            <Field>
              비밀번호
              <input
                required
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </Field>
            <Button busy={busy} variant="primary">
              로그인
            </Button>
          </Form>
        </section>
      ) : (
        <>
          <p className={styles.account}>{email} · 관리자</p>
          {consent && request && !error ? (
            <section className={styles.panel}>
              <h2>연결 권한을 확인해주세요</h2>
              <p>
                요청한 앱: <strong>{consent.clientName}</strong>
              </p>
              <ul>
                {consent.scopes.map((scope) => (
                  <li key={scope}>{labels[scope] || scope}</li>
                ))}
              </ul>
              <div className={styles.notice}>
                <strong>계약 확정과 카톡 발송은 운영 화면에서</strong>
                <p>
                  이 연결에는 계약 확정·참여자 제안·카톡 발송·유료 생성·지급
                  권한이 없어요. 등록과 초안 저장도 대화에서 내용을 확인한 뒤
                  요청해주세요.
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  busy={busy}
                  onClick={() => void authorize(true)}
                >
                  연결 허용
                </Button>
                <Button disabled={busy} onClick={() => void authorize(false)}>
                  취소
                </Button>
              </div>
            </section>
          ) : (
            !request && (
              <section className={styles.panel}>
                <h2>ChatGPT·Codex에서 연결하기</h2>
                <p>
                  사용 중인 앱의 MCP 연결 설정에 아래 주소를 입력하고 OAuth
                  인증을 선택해주세요.
                </p>
                <code className={styles.endpoint}>{endpoint}</code>
                <p>
                  연결 후 이 화면에서 권한을 허용하면 사용할 수 있어요. 현재
                  대화의 연결 도구 반영에는 새 대화나 앱 새로고침이 필요할 수
                  있어요.
                </p>
              </section>
            )
          )}
          <section className={styles.panel}>
            <h2>허용한 연결</h2>
            {!connections.length ? (
              <p>아직 연결한 앱이 없어요.</p>
            ) : (
              connections.map((c) => (
                <div className={styles.connection} key={c.id}>
                  <strong>{c.name}</strong>
                  <p>{c.scopes.map((s) => labels[s] || s).join(" · ")}</p>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        await call(
                          "/api/mcp/connections",
                          { id: c.id },
                          "DELETE",
                        );
                        router.refresh();
                      } catch (e) {
                        setMessage(
                          e instanceof Error
                            ? e.message
                            : "연결을 해제하지 못했어요.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    연결 해제
                  </Button>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}
