"use client";
import { useId, useRef, useState } from "react";
import { Copy, Check, Gift } from "lucide-react";
import styles from "./public-experience.module.css";

export default function ReferralPromotion({
  referralCode,
  onShowLink,
}: {
  referralCode: string;
  onShowLink: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <aside
        className={styles.referralPromotion}
        aria-label="친구 추천 특별 프로모션"
      >
        <Gift size={22} aria-hidden="true" />
        <div>
          <strong>친구 추천하고 2,000원 추가 받기</strong>
          <p>친구 첫 캠페인 완료·원고료 지급 시</p>
          <p>기존 추천료도 그대로 받아요</p>
        </div>
        <div className={styles.referralActions}>
          <button
            type="button"
            aria-label={copied ? "초대 링크 복사 완료" : "초대 링크 복사"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/participants/apply?ref=${encodeURIComponent(referralCode)}`,
                );
                setCopied(true);
              } catch {
                onShowLink();
              }
            }}
          >
            {copied ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <Copy size={17} aria-hidden="true" />
            )}
            <span aria-live="polite">
              {copied ? "복사 완료" : "초대 링크 복사"}
            </span>
          </button>
          <button
            type="button"
            className={styles.referralDetails}
            onClick={() => {
              const dialog = dialogRef.current;
              if (!dialog) return;
              dialog.showModal();
              dialog.querySelector("h2")?.focus({ preventScroll: true });
              dialog.scrollTop = 0;
            }}
            aria-haspopup="dialog"
          >
            자세히 보기
          </button>
        </div>
      </aside>
      <dialog
        ref={dialogRef}
        className={styles.referralDialog}
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        <h2 id={titleId} tabIndex={-1}>
          친구 추천 프로모션 안내
        </h2>
        <p className={styles.referralLead}>
          친구의 첫 캠페인 완료·원고료 지급 후<br />
          <strong>추천인에게 2,000원 추가 적립</strong>
        </p>
        <h3>참여 방법</h3>
        <ol>
          <li>내 초대 링크를 복사해 친구에게 보내주세요.</li>
          <li>친구가 해당 링크로 신규 가입하면 추천 관계가 등록돼요.</li>
          <li>
            친구의 첫 정상 캠페인이 완료되고 원고료 지급까지 끝나면 특별 보상이
            적립돼요.
          </li>
        </ol>
        <h3>기존 캠페인 추천료도 그대로 받아요</h3>
        <p>
          단독 캠페인 500원 · 블로그+클립 묶음 1,200원입니다. 캠페인별 완료·지급
          조건을 충족할 때마다 기존 기준대로 적립돼요.
        </p>
        <h3>꼭 확인해주세요</h3>
        <ul>
          <li>
            특별 보상 2,000원은 신규 참여자당 최초 1회예요.
            가입·지원·선정만으로는 지급되지 않아요.
          </li>
          <li>
            기존 가입 이력이 있는 재가입자는 신규 추천 특별 보상 대상에서
            제외돼요.
          </li>
          <li>
            본인 추천, 중복·허위 계정, 타인 정보 도용 등 부정 참여는 인정되지
            않으며 검수 결과에 따라 보상이 제외될 수 있어요.
          </li>
          <li>테스트 캠페인은 원고료·추천 보상 대상이 아니에요.</li>
          <li>
            추천 내역과 적립·정산 상태는 ‘정산·추천’에서 확인해주세요. 적립과
            실제 지급은 구분되며 운영 정산 절차에 따라 지급돼요.
          </li>
        </ul>
        <button
          type="button"
          className="primary"
          onClick={() => dialogRef.current?.close()}
        >
          확인
        </button>
      </dialog>
    </>
  );
}
