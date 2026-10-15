"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ApplicationFields, {
  freshApplication,
} from "@/components/participant-application-fields";
import type { ApplicationDraft } from "@/lib/participant-application-schema";
import styles from "./application.module.css";
export default function ApplicationForm({
  rewards,
}: {
  rewards: { blog: number; clip: number; bundle: number };
}) {
  const termsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const receiptTitleRef = useRef<HTMLHeadingElement>(null);
  const [popup, setPopup] = useState<"success" | "contact" | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (popup && dialog && !dialog.open) dialog.showModal();
  }, [popup]);
  const [readTerms, setReadTerms] = useState(false);
  useEffect(() => {
    const panel = termsRef.current;
    if (!panel) return;
    const check = () => {
      if (panel.scrollHeight - panel.scrollTop <= panel.clientHeight + 4)
        setReadTerms(true);
    };
    const observer = new ResizeObserver(check);
    observer.observe(panel);
    if (panel.firstElementChild) observer.observe(panel.firstElementChild);
    panel.addEventListener("scroll", check, { passive: true });
    check();
    return () => {
      observer.disconnect();
      panel.removeEventListener("scroll", check);
    };
  }, []);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const [key, setKey] = useState("");
  function start() {
    if (!readTerms) return;
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
      setPopup("success");
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
        <section className={styles.form}>
          {receipt ? (
            <div role="status">
              <span className={styles.eyebrow}>신청 완료</span>
              <h2 ref={receiptTitleRef} tabIndex={-1}>
                신청이 접수되었습니다.
              </h2>
              <p>
                신청 내용을 확인한 후 남겨주신 연락처로 개별 연락드리겠습니다.
              </p>
              <p className="hint">접수번호: {receipt}</p>
            </div>
          ) : !draft ? (
            <>
              <h2>체험단 참여 신청</h2>
              <p className="hint">채널별 보수와 참여 조건을 확인해주세요.</p>
              <div
                ref={termsRef}
                className={styles.terms}
                tabIndex={0}
                role="region"
                aria-label="채널별 보수 및 참여 조건"
                aria-describedby="terms-scroll-hint"
              >
                <div>
                  <section className={styles.channel}>
                    <h3>네이버</h3>
                    <dl className={styles.rates}>
                      <div>
                        <dt>블로그 글 업로드</dt>
                        <dd>{rewards.blog.toLocaleString("ko-KR")}원 / 건</dd>
                      </div>
                      <div>
                        <dt>클립 업로드</dt>
                        <dd>{rewards.clip.toLocaleString("ko-KR")}원 / 건</dd>
                      </div>
                      <div>
                        <dt>블로그 + 클립 업로드</dt>
                        <dd>
                          {rewards.bundle.toLocaleString("ko-KR")}원 / 세트
                        </dd>
                      </div>
                    </dl>
                    <p className="hint">
                      기본 보수 기준이며, 실제 협업 보수와 지급 조건은 참여 전
                      개별 안내합니다.
                    </p>
                  </section>
                  {["인스타그램", "페이스북", "링크드인", "유튜브"].map(
                    (channel) => (
                      <section className={styles.upcoming} key={channel}>
                        <h3>{channel}</h3>
                        <span>오픈 예정</span>
                      </section>
                    ),
                  )}
                  <section className={styles.conditions}>
                    <h3>참여 전 꼭 확인해주세요</h3>
                    <ul>
                      <li>
                        참여가 확정된 작업은 안내된 기한과 업로드 조건을
                        지켜주세요.
                      </li>
                      <li>
                        기한 내 업로드하지 않거나 연락 없이 작업을 중단하면 이후
                        체험단 선정에서 후순위로 배정될 수 있습니다.
                      </li>
                      <li>
                        게시물은 개별 안내한 유지 기간 동안 공개 상태로
                        유지해주세요. 사전 협의 없이 삭제하거나 비공개로
                        전환하면 이후 참여가 제한될 수 있습니다.
                      </li>
                      <li>
                        미업로드 또는 무단 삭제가 반복되는 경우 협업이 종료되고
                        체험단 등록이 해제될 수 있습니다.
                      </li>
                      <li>
                        업로드가 어렵거나 게시물을 수정·삭제해야 하는 사정이
                        생기면 담당자에게 먼저 연락해주세요.
                      </li>
                    </ul>
                    <p>
                      위 보수 안내와 참여 조건을 확인했으며, 동의 후 신청을
                      진행합니다.
                    </p>
                  </section>
                </div>
              </div>
              <p
                id="terms-scroll-hint"
                className={styles.scrollHint}
                role="status"
              >
                {readTerms
                  ? "안내를 모두 확인했습니다. 동의 후 신청서를 작성해주세요."
                  : "안내 영역을 아래 끝까지 내려 확인하면 버튼이 활성화됩니다."}
              </p>
              <button
                className="primary"
                disabled={!readTerms}
                onClick={start}
                style={{ width: "100%" }}
              >
                동의합니다.
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
                  원마케팅은 참여 신청 검토, 협업 연락 및 보수 정산을 위해 이름,
                  전화번호, 이메일, 활동 지역, 활동 계정 주소, 정산 방식과 계좌
                  송금 선택 시 은행·계좌번호를 수집합니다. 신청 정보는
                  접수일로부터 1년간 보관 후 삭제합니다. 승인된 프로필은 협업
                  종료 후 1년까지 보관합니다. 동의를 거부할 수 있으나 신청
                  접수는 제한됩니다.
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
      <footer className={styles.footer}>
        <span>© ONE MARKETING</span>
        <button type="button" onClick={() => setPopup("contact")}>
          문의하기
        </button>
      </footer>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="application-popup-title"
        aria-describedby="application-popup-description"
        onClose={() => {
          if (popup === "success") receiptTitleRef.current?.focus();
          setPopup(null);
        }}
      >
        <h2 id="application-popup-title">
          {popup === "success" ? "신청이 완료되었습니다." : "체험단 문의하기"}
        </h2>
        <p id="application-popup-description">
          {popup === "success"
            ? "신청 내용을 확인한 후 남겨주신 연락처로 개별 연락드리겠습니다."
            : "신청이나 협업에 궁금한 점이 있다면 아래 연락처로 문의해주세요."}
        </p>
        <div className={styles.contactLinks}>
          <a href="mailto:yeomjw0907@onecation.co.kr">
            <span>이메일</span>yeomjw0907@onecation.co.kr
          </a>
          <a href="tel:01063334649">
            <span>전화</span>010-6333-4649
          </a>
        </div>
        <button
          type="button"
          className="primary"
          autoFocus
          onClick={() => dialogRef.current?.close()}
        >
          확인
        </button>
      </dialog>
    </main>
  );
}
