"use client";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
export default function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <>
      <button
        type="button"
        disabled={!value}
        aria-label={`${label} 복사하기`}
        title={`${label} 복사하기`}
        style={{ padding: "5px 8px", fontSize: 12, flexShrink: 0 }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? <Check size={13} /> : <Copy size={13} />}
        {state === "copied" ? "복사됨" : "복사"}
      </button>
      <span role="status" style={{ fontSize: 12, color: "var(--muted)" }}>
        {state === "error"
          ? "복사하지 못했습니다. 직접 선택해 복사해주세요."
          : ""}
      </span>
    </>
  );
}
