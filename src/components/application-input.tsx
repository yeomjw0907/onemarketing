"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type RefObject,
} from "react";
import styles from "./application-inputs.module.css";
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  validate?: (value: string) => string;
  help?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
};
export default function ApplicationInput({
  label,
  value,
  onChange,
  validate,
  help,
  inputRef,
  onBlur,
  onInvalid,
  required,
  ...props
}: Props) {
  const id = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || localRef;
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.setCustomValidity("");
    setError("");
  }, [value]);
  function check() {
    const message =
      required && !value.trim()
        ? `${label}를 입력해주세요.`
        : validate?.(value) ||
          (ref.current?.validity.typeMismatch
            ? `${label} 형식을 확인해주세요.`
            : "");
    ref.current?.setCustomValidity(message);
    setError(message);
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <input
        {...props}
        id={id}
        ref={ref}
        required={required}
        value={value}
        aria-invalid={!!error}
        aria-describedby={error || help ? `${id}-help` : undefined}
        onChange={(e) => {
          ref.current?.setCustomValidity("");
          setError("");
          onChange(e.target.value);
        }}
        onBlur={(e) => {
          check();
          onBlur?.(e);
        }}
        onInvalid={(e) => {
          e.preventDefault();
          check();
          const first =
            e.currentTarget.form?.querySelector<HTMLInputElement>(
              "input:invalid",
            );
          first?.focus();
          onInvalid?.(e);
        }}
      />
      {(error || help) && (
        <p
          id={`${id}-help`}
          className={error ? styles.fieldError : styles.fieldHelp}
          role={error ? "alert" : undefined}
        >
          {error || help}
        </p>
      )}
    </div>
  );
}
