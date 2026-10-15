"use client";
import { useRef, useState } from "react";
import styles from "./application-inputs.module.css";
const domains = [
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "nate.com",
  "icloud.com",
  "outlook.com",
];
export default function ApplicationEmail({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const [id, domain = ""] = value.split("@");
  const suggestions =
    focused && id && !/\s/.test(value) && value.split("@").length <= 2
      ? domains
          .filter(
            (d) =>
              d.startsWith(domain.toLowerCase()) && d !== domain.toLowerCase(),
          )
          .slice(0, 3)
          .map((d) => `${id}@${d}`)
      : [];
  return (
    <div
      className={styles.email}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <label>
        이메일
        <input
          ref={ref}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="onecation@gmail.com"
          maxLength={254}
          value={value}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setFocused(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFocused(false);
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault();
              e.currentTarget
                .closest(`.${styles.email}`)
                ?.querySelector<HTMLButtonElement>("button")
                ?.focus();
            }
          }}
        />
      </label>
      {suggestions.length > 0 && (
        <div
          className={styles.suggestions}
          role="group"
          aria-label="추천 이메일 주소"
        >
          {suggestions.map((address) => (
            <button
              key={address}
              type="button"
              onClick={() => {
                onChange(address);
                ref.current?.focus();
                setFocused(false);
              }}
            >
              {address}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
