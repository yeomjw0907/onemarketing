"use client";
import type { ParticipantPayment } from "@/lib/participant-payment";
export default function ParticipantPaymentFields({
  payment,
  onChange,
}: {
  payment?: ParticipantPayment;
  onChange: (payment: ParticipantPayment) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3>정산 받을 방법 *</h3>
      <div
        role="group"
        aria-label="정산 방식"
        className="row"
        style={{ marginBottom: 16 }}
      >
        <button
          type="button"
          aria-pressed={payment?.method === "kakaopay"}
          className={payment?.method === "kakaopay" ? "primary" : ""}
          onClick={() => onChange({ method: "kakaopay" })}
        >
          카카오페이
        </button>
        <button
          type="button"
          aria-pressed={payment?.method === "bank"}
          className={payment?.method === "bank" ? "primary" : ""}
          onClick={() =>
            onChange(
              payment?.method === "bank"
                ? payment
                : { method: "bank", bankName: "", accountNumber: "" },
            )
          }
        >
          계좌 송금
        </button>
      </div>
      {payment?.method === "kakaopay" && (
        <p className="hint">
          입력한 휴대전화 번호로 카카오페이 정산을 안내합니다.
        </p>
      )}
      {payment?.method === "bank" && (
        <>
          <div className="fields">
            <label>
              은행 *
              <input
                required
                maxLength={100}
                placeholder="예: 카카오뱅크, 국민은행"
                autoComplete="off"
                value={payment.bankName}
                onChange={(e) =>
                  onChange({ ...payment, bankName: e.target.value })
                }
              />
            </label>
            <label>
              계좌번호 *
              <input
                required
                inputMode="numeric"
                maxLength={40}
                autoComplete="off"
                placeholder="숫자만 입력해주세요"
                value={payment.accountNumber}
                onChange={(e) =>
                  onChange({
                    ...payment,
                    accountNumber: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </label>
          </div>
          <p className="hint">신청자 본인 명의의 계좌를 입력해주세요.</p>
        </>
      )}
    </div>
  );
}
