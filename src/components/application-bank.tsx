"use client";
import { useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import ApplicationInput from "./application-input";
import styles from "./application-inputs.module.css";
const banks = [
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "SC제일은행",
  "우체국",
  "새마을금고",
  "신협",
  "수협은행",
  "부산은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
];
export default function ApplicationBank({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  return (
    <div className={styles.bank}>
      <ApplicationInput
        label="은행"
        required
        value={value}
        onChange={onChange}
        inputRef={input}
        maxLength={100}
        autoComplete="off"
        placeholder="은행을 선택하거나 직접 입력해주세요"
      />
      <button
        type="button"
        className={styles.bankOpen}
        aria-label="은행 선택"
        aria-haspopup="dialog"
        onClick={() => {
          setQuery("");
          dialog.current?.showModal();
        }}
      >
        <ChevronDown size={22} />
      </button>
      <dialog ref={dialog} className={styles.bankDialog} aria-labelledby={id}>
        <div className={styles.pickerHeader}>
          <h3 id={id}>은행 선택</h3>
          <button
            type="button"
            aria-label="은행 선택 닫기"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <ApplicationInput
          label="은행 검색"
          placeholder="은행 이름으로 검색"
          value={query}
          onChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const first = banks.find((bank) =>
                bank.toLowerCase().includes(query.trim().toLowerCase()),
              );
              if (query.trim() && first) {
                onChange(first);
                dialog.current?.close();
              }
            }
          }}
          autoComplete="off"
        />
        <div className={styles.bankList}>
          {banks
            .filter((bank) =>
              bank.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .map((bank) => (
              <button
                type="button"
                aria-pressed={value === bank}
                key={bank}
                onClick={() => {
                  onChange(bank);
                  dialog.current?.close();
                }}
              >
                {bank}
                {value === bank && <Check size={16} />}
              </button>
            ))}
        </div>
        {!banks.some((bank) =>
          bank.toLowerCase().includes(query.trim().toLowerCase()),
        ) && (
          <p className={styles.fieldHelp}>
            검색 결과가 없습니다. 은행명을 직접 입력할 수 있어요.
          </p>
        )}
        <button
          type="button"
          style={{ marginTop: 18, width: "100%" }}
          onClick={() => {
            if (query.trim()) onChange(query.trim());
            dialog.current?.close();
            input.current?.focus();
          }}
        >
          직접 입력하기
        </button>
      </dialog>
    </div>
  );
}
