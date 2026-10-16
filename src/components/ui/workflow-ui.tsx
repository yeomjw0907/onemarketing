"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type ButtonHTMLAttributes,
  type LabelHTMLAttributes,
  type FormHTMLAttributes,
} from "react";
import inputStyles from "../application-inputs.module.css";
import { stageLabels } from "@/lib/types";
export function Button({
  variant = "secondary",
  busy = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "text";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      className={`ui-button ${variant} ${className}`}
      disabled={props.disabled || busy}
    >
      {busy && <span className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
type ControlProps = {
  id?: string;
  type?: string;
  "aria-describedby"?: string;
  onBlur?: (e: any) => void;
  onChange?: (e: any) => void;
  onInvalid?: (e: any) => void;
  required?: boolean;
};
export function Field({
  children,
  help,
  fullWidth = false,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  help?: string;
  fullWidth?: boolean;
}) {
  const id = useId(),
    [error, setError] = useState("");
  const nodes = Children.toArray(children);
  const control = nodes.find(
    (n) =>
      isValidElement(n) &&
      ["input", "select", "textarea"].includes(String(n.type)),
  ) as ReactElement<ControlProps> | undefined;
  if (!control)
    return (
      <label {...props} className="ui-checkbox">
        {children}
      </label>
    );
  const controlId = control.props.id || id;
  const checkbox = control.props.type === "checkbox";
  const check = (
    el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ) => {
    const m = el.validity.valid
      ? ""
      : el.validity.valueMissing
        ? "필수 항목을 입력하거나 선택해주세요."
        : el.validity.typeMismatch
          ? "입력 형식을 확인해주세요."
          : el.validity.rangeUnderflow
            ? "최솟값 이상으로 입력해주세요."
            : el.validity.rangeOverflow
              ? "최댓값 이하로 입력해주세요."
              : "입력값을 확인해주세요.";
    setError(m);
  };
  const input = cloneElement(control, {
    id: controlId,
    "aria-invalid": !!error,
    "aria-describedby":
      [
        control.props["aria-describedby"],
        error || help ? controlId + "-help" : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    onBlur: (e: any) => {
      check(e.currentTarget);
      control.props.onBlur?.(e);
    },
    onChange: (e: any) => {
      setError("");
      control.props.onChange?.(e);
    },
    onInvalid: (e: any) => {
      e.preventDefault();
      check(e.currentTarget);
      const first = e.currentTarget.form?.querySelector(":invalid");
      first?.focus();
      control.props.onInvalid?.(e);
    },
  } as ControlProps);
  const content = nodes.filter((n) => n !== control);
  return (
    <div
      className={`${inputStyles.field} ui-field ${checkbox ? "ui-field-check" : ""} ${fullWidth ? "ui-full" : ""}`}
    >
      <label {...props} htmlFor={controlId}>
        {checkbox ? input : null}
        <span>
          {content}
          {control.props.required && !checkbox && (
            <span className="ui-required" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </span>
      </label>
      {!checkbox && input}
      {(error || help) && (
        <p
          id={controlId + "-help"}
          className={error ? inputStyles.fieldError : inputStyles.fieldHelp}
          role={error ? "alert" : undefined}
        >
          {error || help}
        </p>
      )}
    </div>
  );
}
export function Form(props: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} className={`ui-form ${props.className || ""}`} />;
}
export function Feedback({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "success" | "error";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tone === "error") ref.current?.focus();
  }, [tone, children]);
  return (
    <div
      ref={ref}
      tabIndex={tone === "error" ? -1 : undefined}
      className={`ui-feedback ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="ui-empty">
      <p>{title}</p>
      {description && <span>{description}</span>}
    </div>
  );
}
const labels: Record<string, string> = {
  waiting_approval: "검수 대기",
  rejected: "반려",
  ...stageLabels,
  proposed: "수락 대기",
  accepted: "수락 완료",
  declined: "거절",
  expired: "기간 만료",
  upgraded: "묶음 전환",
  available: "지급 가능",
  queued: "발송 대기",
  sending: "발송 중",
  uncertain: "확인 필요",
  closed: "종료",
  active: "활동 중",
  confirmed: "확정",
  unassigned: "미배정",
  needs_recovery: "복구 확인 필요",
};
export function statusLabel(value: unknown) {
  return labels[String(value)] || String(value);
}
export function StatusBadge({
  value,
  context,
  label,
}: {
  value: unknown;
  context?: "notification";
  label?: string;
}) {
  const s = String(value);
  return (
    <span
      className={`badge ${["verified", "accepted", "succeeded", "paid", "confirmed"].includes(s) ? "green" : ["failed", "uncertain", "changes", "needs_recovery"].includes(s) ? "orange" : "blue"}`}
    >
      {label ??
        (context === "notification" && s === "accepted"
          ? "발송 접수"
          : statusLabel(value))}
    </span>
  );
}
export function Tabs({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const base = useId();
  return (
    <div className="tabs ui-tabs" role="tablist" aria-label={label}>
      {items.map((item, i) => (
        <button
          type="button"
          role="tab"
          key={item.id}
          id={`${base}-${item.id}`}
          aria-selected={value === item.id}
          className={value === item.id ? "active" : ""}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => {
            let next = i;
            if (e.key === "ArrowRight") next = (i + 1) % items.length;
            else if (e.key === "ArrowLeft")
              next = (i - 1 + items.length) % items.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = items.length - 1;
            else return;
            e.preventDefault();
            onChange(items[next].id);
            document.getElementById(`${base}-${items[next].id}`)?.focus();
          }}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ui-count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
type Decision = {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  inputLabel?: string;
  checkboxLabel?: string;
};
type Answer = { value: string; checked: boolean };
export function useDecisionDialog() {
  const [decision, setDecision] = useState<Decision | null>(null);
  const resolve = useRef<((v: Answer | null) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const finish = (answer: Answer | null) => {
    resolve.current?.(answer);
    resolve.current = null;
    dialog.current?.close();
    setDecision(null);
  };
  useEffect(() => {
    if (decision && !dialog.current?.open) dialog.current?.showModal();
  }, [decision]);
  useEffect(
    () => () => {
      resolve.current?.(null);
    },
    [],
  );
  const ask = (options: Decision) =>
    new Promise<Answer | null>((r) => {
      resolve.current = r;
      setDecision(options);
    });
  return {
    ask,
    confirm: async (description: string) =>
      !!(await ask({
        title: /취소|종료|만료/.test(description)
          ? "변경 내용을 확인해주세요"
          : "진행 내용을 확인해주세요",
        danger: /지급 기록을 취소|배정을 종료/.test(description),
        description,
        confirmLabel: "확인",
      })),
    dialog: decision ? (
      <dialog
        ref={dialog}
        className="ui-dialog"
        aria-labelledby={id + "-title"}
        aria-describedby={
          decision.description ? id + "-description" : undefined
        }
        onCancel={(e) => {
          e.preventDefault();
          finish(null);
        }}
      >
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            finish({
              value: String(f.get("value") || ""),
              checked: f.get("checked") === "on",
            });
          }}
        >
          <h2 id={id + "-title"}>{decision.title}</h2>
          {decision.description && (
            <p id={id + "-description"} className="hint">
              {decision.description}
            </p>
          )}
          {decision.inputLabel && (
            <Field>
              {decision.inputLabel}
              <textarea name="value" required maxLength={2000} autoFocus />
            </Field>
          )}
          {decision.checkboxLabel && (
            <Field>
              <input name="checked" type="checkbox" />
              {decision.checkboxLabel}
            </Field>
          )}
          <footer>
            <Button type="button" onClick={() => finish(null)}>
              취소
            </Button>
            <Button
              type="submit"
              variant={decision.danger ? "danger" : "primary"}
            >
              {decision.confirmLabel || "저장"}
            </Button>
          </footer>
        </Form>
      </dialog>
    ) : null,
  };
}
