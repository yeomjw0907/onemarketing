"use client";
import { useState } from "react";
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
  return (
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
      <button
        type="button"
        aria-label={copied ? "추천 링크 복사 완료" : "내 추천 링크 복사"}
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
        <span aria-live="polite">{copied ? "복사 완료" : "링크 복사"}</span>
      </button>
    </aside>
  );
}
