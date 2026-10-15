"use client";
import { useId, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { applicationChannels } from "@/lib/participant-application-schema";
import ChannelIcon from "./channel-icon";
import styles from "./application-inputs.module.css";
export default function ApplicationChannelSelect({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: keyof typeof applicationChannels) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const selected = value === "clip" ? "blog" : value;
  const options = Object.entries(applicationChannels);
  function open() {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 32);
    setPosition({
      "--picker-left": `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`,
      "--picker-top": `${Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 390))}px`,
      "--picker-width": `${width}px`,
    } as CSSProperties);
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();
  }
  return (
    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
      <span id={id + "-label"} className={styles.label}>
        {label}
      </span>
      <button
        ref={trigger}
        className={styles.trigger}
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="dialog"
        onClick={open}
      >
        <span id={id + "-value"} className={styles.selection}>
          <ChannelIcon channel={selected} />
          {applicationChannels[selected as keyof typeof applicationChannels] ||
            "채널 선택"}
        </span>
        <ChevronDown size={18} color="#8b95a1" />
      </button>
      <dialog
        ref={dialog}
        className={styles.picker}
        style={position}
        aria-labelledby={id + "-title"}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            dialog.current?.close();
        }}
      >
        <div className={styles.pickerHeader}>
          <h3 id={id + "-title"}>활동 채널 선택</h3>
          <button
            type="button"
            aria-label="채널 선택 닫기"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <div
          role="listbox"
          aria-label={label}
          onKeyDown={(e) => {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="option"]',
              ),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let next = index;
            if (e.key === "ArrowDown") next = (index + 1) % buttons.length;
            else if (e.key === "ArrowUp")
              next = (index - 1 + buttons.length) % buttons.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = buttons.length - 1;
            else return;
            e.preventDefault();
            buttons[next]?.focus();
          }}
        >
          {options.map(([key, text]) => (
            <button
              type="button"
              role="option"
              aria-selected={selected === key}
              tabIndex={selected === key ? 0 : -1}
              className={styles.option}
              key={key}
              onClick={() => {
                onChange(key as keyof typeof applicationChannels);
                dialog.current?.close();
              }}
            >
              <span className={styles.selection}>
                <ChannelIcon channel={key} />
                {text}
              </span>
              {selected === key && <Check size={20} />}
            </button>
          ))}
        </div>
      </dialog>
    </div>
  );
}
