"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PublicShell from "./public-shell";
import { marketFetch } from "./public-fetch";
import s from "./platform.module.css";
export default function AdvertiserConnections() {
  const [rows, setRows] = useState<Record<string, any>[]>([]),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [endpoint, setEndpoint] = useState("");
  const load = () => marketFetch("/api/advertiser-connections").then(setRows);
  useEffect(() => {
    setEndpoint(location.origin + "/api/advertiser-mcp");
    load().catch((e) => setError(e.message));
  }, []);
  async function act(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setToken("");
    try {
      const r = await marketFetch("/api/advertiser-connections", body);
      setToken(r.token || "");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell>
      <div>
        <section className={s.section}>
          <Link href="/advertisers">← 광고주 마이페이지</Link>
          <h1>대화에서 캠페인으로</h1>
          <p>
            MCP 연결은 무료입니다. 상품 견적 확인·내 캠페인 조회·주문 접수를
            AI와 대화하며 진행하세요. 캠페인 운영 비용은 웹 주문과 같습니다.
          </p>
          {error && (
            <p role="alert" className={s.error}>
              {error} <Link href="/login">광고주 로그인</Link>
            </p>
          )}
          <div className={s.columns}>
            <article className={s.panel}>
              <h2>직접 키 연결</h2>
              <form
                className={s.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({
                    action: "create",
                    label: new FormData(e.currentTarget).get("label"),
                  });
                }}
              >
                <label>
                  연결 이름
                  <input
                    name="label"
                    required
                    maxLength={80}
                    placeholder="내 AI 작업 도구"
                  />
                </label>
                <button disabled={busy} className={s.primary}>
                  90일 연결 키 발급
                </button>
              </form>
              {token && (
                <div role="status">
                  <p>
                    키는 지금 한 번만 표시됩니다. 내 계정의 캠페인 자료에
                    접근하고 주문을 접수할 수 있으므로 비밀로 보관하세요.
                  </p>
                  <textarea
                    readOnly
                    aria-label="발급된 연결 키"
                    value={token}
                  />
                  <button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(token)
                        .catch(() => setError("키를 직접 복사해주세요."));
                    }}
                  >
                    키 복사
                  </button>
                  <button onClick={() => setToken("")}>화면에서 숨기기</button>
                </div>
              )}
            </article>
            <article className={s.panel}>
              <h2>MCP 서버 주소</h2>
              <p>
                원격 Streamable HTTP와 Bearer 헤더 설정을 지원하는
                클라이언트에서 사용하세요. 클라이언트별 지원 방식이 다르며 OAuth
                연결 화면에서는 키를 입력하지 말고 서버 주소로 연결하세요.
              </p>
              <label>
                서버 주소
                <input readOnly value={endpoint} />
              </label>
              <p>인증 헤더: Authorization: Bearer 발급받은_키</p>
              <p>
                OAuth를 지원하는 클라이언트는 위 서버 주소에서 인증 정보를
                탐색하고 원마케팅 광고주 로그인·동의 화면으로 이동합니다.
                클라이언트 요금제·관리자 설정에 따라 연결 기능 제공 여부가 다를
                수 있습니다. Claude 등 다른 클라이언트의 정확한 콜백 주소는 운영
                설정에 등록해야 합니다.
              </p>
            </article>
          </div>
          <article className={s.panel}>
            <h2>3. 이렇게 요청해보세요</h2>
            <p>
              “우리 카페 블로그 캠페인 5명, 1인 보수 2만원으로 견적을 내줘.
              모집·게시 기간과 가이드를 정리한 다음, 내가 금액을 확인하면
              주문해줘.”
            </p>
            <p>
              AI 주문도 입금 대기 상태로 접수됩니다. 실제 입금 확인 뒤 모집이
              열립니다. AI는 지급·환불 송금이나 관리자 처리를 할 수 없습니다.
            </p>
            <a href="/skills/onemarketing/SKILL.md" download>
              에이전트용 Skill 안내 다운로드
            </a>
          </article>
          <h2>연결 관리</h2>
          {rows.length === 0 && <p>등록된 연결이 없습니다.</p>}
          {rows.map((r) => (
            <div className={s.panel} key={r.id}>
              <strong>{r.label}</strong>
              <p>
                만료 {new Date(r.expires_at).toLocaleDateString("ko-KR")} ·{" "}
                {r.revoked_at
                  ? "해제됨"
                  : new Date(r.expires_at) < new Date()
                    ? "만료됨"
                    : "연결 가능"}
              </p>
              {!r.revoked_at && (
                <button
                  disabled={busy}
                  onClick={() =>
                    act({
                      action: r.oauth ? "oauth-revoke" : "revoke",
                      id: r.id,
                    })
                  }
                >
                  즉시 연결 해제
                </button>
              )}
            </div>
          ))}
        </section>
      </div>
    </PublicShell>
  );
}
