"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import s from "./question-flow.module.css";
import ApplicationEmail from "./application-email";
import { formatMobilePhone } from "@/lib/participant-payment";
export type Question = {
  validate?: (value: string) => string | null;
  key: string;
  title: string;
  hint?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  options?: { value: string; label: string; detail?: string }[];
  custom?: boolean;
  visible?: (values: Record<string, string>) => boolean;
  render?: ReactNode;
};
export default function QuestionFlow({
  title,
  questions,
  values,
  onChange,
  onComplete,
  onSave,
  onAdvance,
  busy = false,
  error = "",
  completeLabel = "완료하기",
  footer,
}: {
  title: string;
  questions: Question[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onComplete: () => void | Promise<unknown>;
  onSave?: () => void | Promise<unknown>;
  onAdvance?: () => Promise<boolean>;
  busy?: boolean;
  error?: string;
  completeLabel?: string;
  footer?: ReactNode;
}) {
  const [position, setPosition] = useState(0),
    [validation, setValidation] = useState("");
  const active = questions.filter((q) => !q.visible || q.visible(values));
  const index = Math.min(position, active.length),
    review = index === active.length,
    q = active[index];
  const field = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setValidation("");
    heading.current?.focus();
  }, [index]);
  async function next() {
    if (q?.validate) {
      const message = q.validate(values[q.key] || "");
      if (message) {
        setValidation(message);
        return;
      }
    }
    const input = field.current?.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >("input,textarea");
    if (q?.required && !values[q.key]?.trim()) {
      setValidation("답변을 입력하거나 선택해주세요.");
      return;
    }
    if (input && !input.checkValidity()) {
      input.reportValidity();
      return;
    }
    if (onAdvance && !(await onAdvance())) return;
    setValidation("");
    setPosition(index + 1);
  }
  return (
    <section className={s.root} aria-label={title} aria-busy={busy}>
      <header className={s.header}>
        <button
          type="button"
          disabled={busy || index === 0}
          aria-label="이전 질문"
          onClick={() => setPosition(Math.max(0, index - 1))}
        >
          <ArrowLeft size={21} />
        </button>
        <span>{title}</span>
        {onSave ? (
          <button type="button" disabled={busy} onClick={() => void onSave()}>
            임시 저장
          </button>
        ) : (
          <span>
            {Math.min(index + 1, active.length)} / {active.length}
          </span>
        )}
      </header>
      <div
        className={s.progress}
        role="progressbar"
        aria-label="작성 진행"
        aria-valuemin={0}
        aria-valuemax={active.length}
        aria-valuenow={index}
      >
        <span
          style={{ width: `${(index / Math.max(1, active.length)) * 100}%` }}
        />
      </div>
      <div key={q?.key || "review"} className={s.body}>
        <p className={s.eyebrow}>
          {review ? "마지막 확인" : `${index + 1}번째 질문`}
        </p>
        <h2 tabIndex={-1} ref={heading}>
          {review ? "입력한 내용을 확인해주세요." : q.title}
        </h2>
        {!review && q.hint && <p className={s.hint}>{q.hint}</p>}
        {review ? (
          <dl className={s.review}>
            {active.map((item, i) => (
              <div key={item.key}>
                <dt>{item.title}</dt>
                <dd>
                  {item.type === "password"
                    ? "비밀번호 설정 완료"
                    : item.type === "checkbox"
                      ? values[item.key] === "true"
                        ? "동의함"
                        : "동의하지 않음"
                      : item.options?.find((o) => o.value === values[item.key])
                          ?.label ||
                        values[item.key] ||
                        (item.render ? "첨부 자료 확인 완료" : "입력하지 않음")}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPosition(i)}
                  >
                    수정
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div ref={field}>
            {q.render ||
              (q.options ? (
                <div className={s.options}>
                  {q.options.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      disabled={busy}
                      aria-pressed={values[q.key] === option.value}
                      onClick={() => {
                        onChange(q.key, option.value);
                        setValidation("");
                      }}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        {option.detail && <small>{option.detail}</small>}
                      </span>
                      <Check size={22} />
                    </button>
                  ))}
                  {q.custom && (
                    <input
                      aria-label="기타 직접 입력"
                      placeholder="기타 · 직접 입력"
                      value={
                        q.options.some((o) => o.value === values[q.key])
                          ? ""
                          : values[q.key] || ""
                      }
                      maxLength={q.maxLength || 200}
                      onChange={(e) => onChange(q.key, e.target.value)}
                      disabled={busy}
                    />
                  )}
                </div>
              ) : q.type === "checkbox" ? (
                <label className={s.consent}>
                  <input
                    type="checkbox"
                    checked={values[q.key] === "true"}
                    disabled={busy}
                    onChange={(e) =>
                      onChange(q.key, e.target.checked ? "true" : "")
                    }
                  />
                  {q.hint || q.title}
                </label>
              ) : q.type === "email" ? (
                <ApplicationEmail
                  value={values[q.key] || ""}
                  onChange={(value) => onChange(q.key, value)}
                  required={q.required}
                  disabled={busy}
                />
              ) : q.type === "textarea" ? (
                <textarea
                  aria-label={q.title}
                  value={values[q.key] || ""}
                  onChange={(e) => onChange(q.key, e.target.value)}
                  required={q.required}
                  minLength={q.minLength}
                  maxLength={q.maxLength || 5000}
                  disabled={busy}
                />
              ) : (
                <input
                  aria-label={q.title}
                  type={q.type || "text"}
                  value={
                    q.type === "tel" &&
                    (q.key === "phone" || /^01/.test(values[q.key] || ""))
                      ? formatMobilePhone(values[q.key] || "")
                      : values[q.key] || ""
                  }
                  onChange={(e) =>
                    onChange(
                      q.key,
                      q.type === "tel" &&
                        (q.key === "phone" ||
                          /^01/.test(e.target.value.replace(/\D/g, "")))
                        ? formatMobilePhone(e.target.value)
                        : e.target.value,
                    )
                  }
                  required={q.required}
                  minLength={q.minLength}
                  maxLength={q.maxLength || 200}
                  disabled={busy}
                  autoComplete={q.type === "password" ? "new-password" : "off"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void next();
                    }
                  }}
                />
              ))}
            {!q.required && !q.render && (
              <p className={s.optional}>
                선택 항목이에요. 아직 정해지지 않았다면 넘어가도 괜찮아요.
              </p>
            )}
          </div>
        )}
      </div>
      {(error || validation) && (
        <p className={s.error} role="alert">
          {error || validation}
        </p>
      )}
      <footer className={s.footer}>
        <button
          type="button"
          className={s.next}
          disabled={busy}
          onClick={() => {
            if (review) void onComplete();
            else void next();
          }}
        >
          {busy ? "저장하고 있어요…" : review ? completeLabel : "다음"}
          <ArrowRight size={19} />
        </button>
        {footer}
      </footer>
    </section>
  );
}
