"use client";
import { useEffect, useState, type FormEvent } from "react";
import { marketFetch } from "./public-fetch";
export default function CustomerAccountProvision({
  customerId,
}: {
  customerId: string;
}) {
  const [accounts, setAccounts] = useState<{ email: string }[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setAccounts(null);
    setLoading(true);
    setFailed(false);
    setMessage("");
    marketFetch("/api/customer-account?customerId=" + customerId)
      .then((d) => {
        if (active) setAccounts(d.accounts);
      })
      .catch((e) => {
        if (active) {
          setMessage(e.message);
          setFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, reload]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const data = Object.fromEntries(new FormData(form));
      const account = await marketFetch("/api/customer-account", {
        ...data,
        customerId,
      });
      setAccounts([account]);
      form.reset();
      setMessage(
        "계정을 발급했습니다. 고객에게 아이디와 초기 비밀번호를 직접 전달해주세요.",
      );
    } catch (e) {
      setFailed(true);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2>광고주 로그인 계정</h2>
      {loading ? (
        <p role="status">계정 정보를 확인 중입니다.</p>
      ) : accounts === null ? (
        <button type="button" onClick={() => setReload((v) => v + 1)}>
          계정 정보 다시 불러오기
        </button>
      ) : accounts.length ? (
        accounts.map((a) => <p key={a.email}>로그인 아이디: {a.email}</p>)
      ) : (
        <form onSubmit={submit} className="fields">
          <label>
            로그인 아이디 (이메일)
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <label>
            초기 비밀번호
            <input
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label>
            담당자 이름
            <input name="name" required maxLength={200} />
          </label>
          <label>
            담당자 휴대전화
            <input name="phone" type="tel" required maxLength={20} />
          </label>
          <button disabled={busy}>
            {busy ? "발급 중…" : "광고주 계정 발급"}
          </button>
        </form>
      )}
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </div>
  );
}
