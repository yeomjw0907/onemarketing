"use client";
import { useRef, useState } from "react";
import type { AssistantQuestion as Question } from "@/lib/assistant-questions";
import { Button } from "./ui/workflow-ui";
import styles from "./dashboard-assistant.module.css";

export default function AssistantQuestion({
  id,
  question: q,
  disabled,
  onAnswer,
  onCustom,
}: {
  id: string;
  question: Question;
  disabled: boolean;
  onAnswer: (body: {
    action: "answer";
    id: string;
    values: string[];
    requestId: string;
  }) => Promise<unknown>;
  onCustom: () => void;
}) {
  const [values, setValues] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const retry = useRef<{ key: string; requestId: string } | null>(null);
  const scalar = q.kind === "dates" || q.kind === "quantities";
  const multiple = q.kind === "channels";
  async function submit(next = values) {
    const key = JSON.stringify(next);
    if (retry.current?.key !== key)
      retry.current = { key, requestId: crypto.randomUUID() };
    const result = await onAnswer({
      action: "answer",
      id,
      values: next,
      requestId: retry.current.requestId,
    });
    if (result) retry.current = null;
  }
  const options = q.options.filter((o) =>
    o.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <section className={styles.question} aria-label={q.title}>
      <span className={styles.questionEyebrow}>다음 단계</span>
      <h3>{q.title}</h3>
      {q.options.length > 6 && (
        <input
          className={styles.questionSearch}
          type="search"
          aria-label="선택지 검색"
          placeholder="이름으로 검색"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {scalar ? (
        <div className={styles.questionFields}>
          {(q.kind === "dates"
            ? ["게시 시작일", "게시 마감일"]
            : ["블로그 수량", "클립 수량"]
          ).map((label, i) => (
            <label key={label}>
              {label}
              <input
                aria-label={label}
                type={q.kind === "dates" ? "date" : "number"}
                min={q.kind === "dates" ? undefined : 0}
                max={q.kind === "dates" ? undefined : 100}
                step={q.kind === "dates" ? undefined : 1}
                disabled={disabled}
                value={values[i] ?? (q.kind === "quantities" ? "0" : "")}
                onChange={(e) =>
                  setValues((old) => {
                    const n = [
                      old[0] ?? (q.kind === "quantities" ? "0" : ""),
                      old[1] ?? (q.kind === "quantities" ? "0" : ""),
                    ];
                    n[i] = e.target.value;
                    return n;
                  })
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <div className={styles.questionOptions}>
          {options.slice(0, 40).map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              aria-pressed={multiple ? values.includes(o.value) : undefined}
              onClick={() =>
                multiple
                  ? setValues((old) =>
                      old.includes(o.value)
                        ? old.filter((v) => v !== o.value)
                        : [...old, o.value],
                    )
                  : void submit([o.value])
              }
            >
              {multiple && (
                <span className={styles.optionCheck} aria-hidden="true">
                  {values.includes(o.value) ? "✓" : ""}
                </span>
              )}
              {o.label}
            </button>
          ))}
          {!options.length && (
            <p>선택할 항목이 없어요. 아래에서 직접 입력해주세요.</p>
          )}
          {options.length > 40 && <p>검색하면 다른 항목도 찾을 수 있어요.</p>}
        </div>
      )}
      <div className={styles.questionActions}>
        {(scalar || multiple) && (
          <Button
            variant="primary"
            disabled={
              disabled ||
              (scalar
                ? values.length !== 2 ||
                  values.some((v) => !v) ||
                  (q.kind === "quantities" &&
                    Number(values[0]) + Number(values[1]) === 0)
                : !values.length)
            }
            onClick={() => void submit()}
          >
            {multiple ? "선택 완료" : "이 내용으로 계속"}
          </Button>
        )}
        <Button variant="text" disabled={disabled} onClick={onCustom}>
          직접 입력할게요
        </Button>
      </div>
      <p className={styles.questionHint}>
        다르게 답하고 싶으면 아래 입력창에 편하게 적어주세요.
      </p>
    </section>
  );
}
