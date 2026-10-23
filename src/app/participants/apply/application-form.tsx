"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ApplicationFields, {
  freshApplication,
} from "@/components/participant-application-fields";
import {
  applicationSchema,
  type ApplicationDraft,
} from "@/lib/participant-application-schema";
import styles from "./application.module.css";
import ChannelIcon from "@/components/channel-icon";
import { applicationReadiness } from "@/lib/application-readiness";
export default function ApplicationForm({
  rewards,
}: {
  rewards: { blog: number; clip: number; bundle: number };
}) {
  const termsRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const receiptTitleRef = useRef<HTMLHeadingElement>(null);
  const [popup, setPopup] = useState<"success" | "contact" | "confirm" | null>(
    null,
  );
  const websiteRef = useRef<FormDataEntryValue | null>("");
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
  const [kakaoLinked, setKakaoLinked] = useState(false);
  const stage = receipt ? "done" : draft ? "form" : "terms";
  const readiness = applicationReadiness(draft, consent);
  const canSubmit = readiness.ready;
  useEffect(() => {
    const actions = actionsRef.current;
    if (!actions) return;
    const resize = new ResizeObserver(() =>
      pageRef.current?.style.setProperty(
        "--actions-height",
        `${actions.getBoundingClientRect().height}px`,
      ),
    );
    resize.observe(actions);
    return () => resize.disconnect();
  }, [stage]);
  function start() {
    if (!readTerms) return;
    setDraft({
      ...freshApplication(),
      referralCode: new URLSearchParams(location.search).get("ref") || "",
    });
    setKey(crypto.randomUUID());
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !canSubmit) return;
    const parsed = applicationSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue?.message || "신청 내용을 확인해주세요.");
      const input = e.currentTarget.querySelector<HTMLInputElement>(
        `[data-field="${issue?.path.join(".")}"]`,
      );
      if (input) {
        input.setCustomValidity(issue.message);
        input.dispatchEvent(new Event("invalid", { cancelable: true }));
        input.focus();
      }
      return;
    }
    setError("");
    setDraft(parsed.data);
    websiteRef.current = new FormData(e.currentTarget).get("website");
    setPopup("confirm");
  }
  async function confirmSubmit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/participant-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: draft,
          consent,
          website: websiteRef.current,
          key,
          requireKakao:
            new URLSearchParams(location.search).get("kakao") === "1",
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "신청하지 못했습니다.");
      setReceipt(body.id);
      setKakaoLinked(body.kakaoLinked === true);
      setPopup("success");
    } catch (e) {
      dialogRef.current?.close();
      setError(e instanceof Error ? e.message : "잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      ref={pageRef}
      className={`${styles.page} ${stage === "terms" ? styles.termsPage : stage === "form" ? styles.writingPage : ""}`}
    >
      <header className={styles.header}>
        <span className={styles.brand}>
          ONE MARKETING<span>CREATOR PARTNERS</span>
        </span>
        <span>체험단 · 기자단 · 클립</span>
        {!draft && !receipt && (
          <button type="button" onClick={() => setPopup("contact")}>
            문의하기
          </button>
        )}
      </header>
      <div className={styles.content}>
        <section className={styles.form}>
          {receipt ? (
            <div role="status">
              <span className={styles.eyebrow}>신청 완료</span>
              <h2 ref={receiptTitleRef} tabIndex={-1}>
                가입이 완료되었습니다.
              </h2>
              <p>
                자동 승인되어 바로 참여할 수 있어요. 등록 정보는 운영자가 추후
                검수합니다.
              </p>
              <p className="hint">접수번호: {receipt}</p>
              {kakaoLinked && (
                <p>
                  <Link className="ui-text-link" href="/participants/portal">
                    참여자 화면으로 이동
                  </Link>
                </p>
              )}
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
                  <section
                    className={styles.conditions}
                    style={{ borderTop: 0 }}
                  >
                    <h3>
                      콘텐츠는 원마케팅이 만들고,
                      <br />
                      업로드는 참여자가 합니다.
                    </h3>
                    <p style={{ fontWeight: 400 }}>
                      블로그 원고·이미지부터 클립 영상까지 원마케팅이 제작해
                      전달합니다. 참여자는 업로드 안내에 따라 본인 계정에
                      게시하고 게시물 링크를 제출해주세요.
                    </p>
                  </section>
                  <section className={styles.channel}>
                    <h3
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <ChannelIcon channel="blog" />
                      네이버 블로그
                    </h3>
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
                    <div className={styles.rewardNote}>
                      <strong>
                        꾸준한 협업에는 추가 보수도 협의할 수 있어요.
                      </strong>
                      <p>
                        블로그 규모와 콘텐츠 품질, 업로드 기한 준수, 게시물 유지
                        여부 등을 종합적으로 검토합니다. 성실하게 참여해주신
                        분께는 이후 체험단 우선 참여 기회와 보수 인상을 제안할
                        수 있습니다. 적용 여부와 금액은 참여 전에 개별
                        안내합니다.
                      </p>
                    </div>
                  </section>
                  {["인스타그램", "페이스북", "링크드인", "유튜브"].map(
                    (channel) => (
                      <section className={styles.upcoming} key={channel}>
                        <h3
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <ChannelIcon
                            channel={
                              (
                                {
                                  인스타그램: "instagram",
                                  페이스북: "facebook",
                                  링크드인: "linkedin",
                                  유튜브: "youtube",
                                } as Record<string, string>
                              )[channel]
                            }
                          />
                          {channel}
                        </h3>
                        <span>오픈 예정</span>
                      </section>
                    ),
                  )}
                  <section className={styles.conditions}>
                    <h3>참여 전 꼭 확인해주세요</h3>
                    <ul>
                      <li>
                        원마케팅이 제작한 콘텐츠와 업로드 방법을 전달합니다.
                        참여자는 내용을 확인한 후 안내된 기한과 조건에 맞춰
                        게시하고 링크를 제출해주세요.
                      </li>
                      <li>
                        블로그 규모와 참여 이행 내역에 따라 추가 보수를 협의할
                        수 있습니다. 보수 인상은 자동 적용되지 않으며, 적용
                        여부와 금액은 참여 전에 개별 안내합니다.
                      </li>
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
              <div ref={actionsRef} className={styles.termsActions}>
                <div className={styles.termsActionInner}>
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
                </div>
              </div>
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
                <label className={styles.allConsent}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={consent && draft.kakaoMarketingConsent === true}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      setDraft({
                        ...draft,
                        kakaoMarketingConsent: e.target.checked,
                      });
                    }}
                  />
                  <span>
                    전체 동의 <small>선택 항목 포함</small>
                  </span>
                </label>
                <p>
                  개인정보 수집·이용과 카카오톡 모집 광고 수신에 함께 동의해요.
                  선택 동의를 해제해도 신청할 수 있어요.
                </p>
                <strong>개인정보 수집·이용 안내</strong>
                <p>
                  원마케팅은 참여 신청 검토, 협업 연락 및 보수 정산을 위해 이름,
                  전화번호, 이메일, 활동 지역, 계정 운영 형태, 업체·운영팀명,
                  계정 관리용 별칭, 관리 권한 확인, 활동 계정 주소, 정산 방식과
                  계좌 송금 선택 시 은행·계좌번호를 수집합니다. 신청 정보는
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
              <div ref={actionsRef} className={styles.termsActions}>
                <div className={styles.termsActionInner}>
                  <p
                    id="application-submit-hint"
                    className={styles.scrollHint}
                    role="status"
                  >
                    {busy ? "신청을 접수하고 있습니다." : readiness.message}
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !canSubmit}
                    aria-describedby="application-submit-hint"
                    style={{ width: "100%" }}
                  >
                    {busy ? "신청 접수 중…" : "참여 신청하기"}
                  </button>
                </div>
              </div>
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
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClose={() => {
          if (popup === "success") receiptTitleRef.current?.focus();
          setPopup(null);
        }}
      >
        <h2 id="application-popup-title">
          {popup === "confirm"
            ? "접수하시겠습니까?"
            : popup === "success"
              ? "신청이 완료되었습니다."
              : "체험단 문의하기"}
        </h2>
        <p id="application-popup-description">
          {popup === "confirm"
            ? "입력한 연락처와 정산 정보를 확인해주세요. 확인을 누르면 신청이 접수됩니다."
            : popup === "success"
              ? "자동 승인되어 바로 참여할 수 있어요. 등록 정보는 운영자가 추후 검수합니다."
              : "신청이나 협업에 궁금한 점이 있다면 아래 연락처로 문의해주세요."}
        </p>
        {popup !== "confirm" && (
          <div className={styles.contactLinks}>
            <a href="mailto:yeomjw0907@onecation.co.kr">
              <span>이메일</span>yeomjw0907@onecation.co.kr
            </a>
            <a href="tel:01063334649">
              <span>전화</span>010-6333-4649
            </a>
          </div>
        )}
        <button
          type="button"
          className="primary"
          autoFocus
          disabled={busy}
          onClick={() =>
            popup === "confirm" ? confirmSubmit() : dialogRef.current?.close()
          }
        >
          {busy ? "접수 중…" : "확인"}
        </button>
        {popup === "confirm" && (
          <button
            type="button"
            className={styles.dialogBack}
            disabled={busy}
            onClick={() => dialogRef.current?.close()}
          >
            돌아가기
          </button>
        )}
      </dialog>
    </main>
  );
}
