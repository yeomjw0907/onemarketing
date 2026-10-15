"use client";
import { useState, type FormEvent } from "react";
import ApplicationFields, {
  freshApplication,
} from "@/components/participant-application-fields";
import type { ApplicationDraft } from "@/lib/participant-application-schema";
import styles from "./application.module.css";
export default function ApplicationForm() {
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const [key, setKey] = useState("");
  function start() {
    setDraft(freshApplication());
    setKey(crypto.randomUUID());
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const website = new FormData(e.currentTarget).get("website");
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/participant-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: draft, consent, website, key }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "신청하지 못했습니다.");
      setReceipt(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          ONE MARKETING<span>CREATOR PARTNERS</span>
        </span>
        <span>체험단 · 기자단 · 클립</span>
      </header>
      <div className={styles.content}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>크리에이터 참여 신청</span>
          <h1>
            당신의 경험을
            <br />
            함께 나눠주세요.
          </h1>
          <p>
            블로그부터 클립까지.
            <br />
            원마케팅과 함께할 크리에이터를 기다립니다.
          </p>
          <ol>
            <li>프로필과 활동 계정 입력</li>
            <li>담당자 검토</li>
            <li>승인 후 개별 협업 안내</li>
          </ol>
          <small>
            신청은 참여자 등록을 위한 절차입니다.
            <br />
            실제 협업 일정과 조건은 별도로 안내합니다.
          </small>
        </div>
        <section className={styles.form}>
          {receipt ? (
            <div role="status">
              <span className={styles.eyebrow}>신청 완료</span>
              <h2>신청이 접수되었습니다.</h2>
              <p>
                담당자가 프로필을 확인한 뒤 협업이 가능한 경우 남겨주신 연락처로
                안내드립니다.
              </p>
              <p className="hint">접수번호: {receipt}</p>
            </div>
          ) : !draft ? (
            <>
              <h2>체험단 참여 신청</h2>
              <p>이름, 연락처, 활동 계정을 준비해주세요.</p>
              <button className="primary" onClick={start}>
                신청서 작성하기 →
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <h2>참여자 프로필</h2>
              <p className="hint">* 표시는 필수 항목입니다.</p>
              <ApplicationFields
                draft={draft}
                onChange={setDraft}
                disabled={busy}
              />
              <div className={styles.trap} aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <div className={styles.consent}>
                <strong>개인정보 수집·이용 안내</strong>
                <p>
                  원마케팅은 참여 신청 검토 및 협업 연락을 위해 이름, 닉네임,
                  전화번호, 이메일, 활동 지역, 관심 분야, 계정 주소와 소개
                  내용을 수집합니다. 신청 정보는 접수일로부터 1년간 보관 후
                  삭제합니다. 승인된 프로필은 협업 종료 후 1년까지 보관합니다.
                  동의를 거부할 수 있으나 신청 접수는 제한됩니다.
                </p>
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    disabled={busy}
                    onChange={(e) => setConsent(e.target.checked)}
                  />{" "}
                  개인정보 수집·이용에 동의합니다. *
                </label>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary"
                disabled={busy || !consent}
                style={{ width: "100%", marginTop: 20 }}
              >
                {busy ? "신청 접수 중…" : "참여 신청하기"}
              </button>
            </form>
          )}
        </section>
      </div>
      <footer className={styles.footer}>© ONE MARKETING</footer>
    </main>
  );
}
