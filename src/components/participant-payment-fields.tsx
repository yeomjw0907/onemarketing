"use client";
import { Check } from "lucide-react";
import type { ParticipantPayment } from "@/lib/participant-payment";
import ApplicationBank from "./application-bank";
import ApplicationInput from "./application-input";
import styles from "./application-inputs.module.css";
export default function ParticipantPaymentFields({
  payment,
  onChange,
}: {
  payment?: ParticipantPayment;
  onChange: (payment: ParticipantPayment) => void;
}) {
  return (
    <section className={styles.section} aria-label="정산 정보">
      <h3>정산 받을 방법</h3>
      <div
        role="group"
        aria-label="정산 방식"
        className={styles.paymentOptions}
      >
        <button
          type="button"
          aria-pressed={payment?.method === "kakaopay"}
          onClick={() => onChange({ method: "kakaopay" })}
        >
          {payment?.method === "kakaopay" && <Check size={18} />}카카오페이
        </button>
        <button
          type="button"
          aria-pressed={payment?.method === "bank"}
          onClick={() =>
            onChange(
              payment?.method === "bank"
                ? payment
                : { method: "bank", bankName: "", accountNumber: "" },
            )
          }
        >
          {payment?.method === "bank" && <Check size={18} />}계좌 송금
        </button>
      </div>
      {payment?.method === "kakaopay" && (
        <p className={styles.fieldHelp}>
          입력한 휴대전화 번호로 카카오페이 정산을 안내합니다.
        </p>
      )}
      {payment?.method === "bank" && (
        <div className={styles.fieldGrid}>
          <ApplicationBank
            value={payment.bankName}
            onChange={(bankName) => onChange({ ...payment, bankName })}
          />
          <ApplicationInput
            label="계좌번호"
            required
            inputMode="numeric"
            maxLength={40}
            autoComplete="off"
            placeholder="숫자만 입력해주세요"
            value={payment.accountNumber}
            onChange={(accountNumber) =>
              onChange({
                ...payment,
                accountNumber: accountNumber.replace(/[^0-9]/g, ""),
              })
            }
            validate={(value) =>
              value.length < 6 ? "계좌번호를 확인해주세요." : ""
            }
            help="신청자 본인 명의의 계좌를 입력해주세요."
          />
        </div>
      )}
    </section>
  );
}
