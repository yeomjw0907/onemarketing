"use client";
import { useEffect, useRef, useState } from "react";
import BrandOrb from "./brand-orb";
import styles from "./report-download.module.css";
export default function ReportDownload({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  useEffect(
    () => () => {
      const pending = controller.current;
      controller.current = null;
      pending?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  async function download() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    const timeout = setTimeout(() => request.abort(), 90000);
    try {
      const response = await fetch(href, {
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: request.signal,
      });
      if (!response.ok)
        throw Error(
          response.status === 404
            ? "보고 링크가 만료되었어요. 담당자에게 새 링크를 요청해주세요."
            : "보고서를 준비하지 못했어요. 잠시 후 다시 눌러주세요.",
        );
      if (!response.headers.get("content-type")?.includes("spreadsheetml"))
        throw Error("보고서 파일을 확인하지 못했어요. 다시 시도해주세요.");
      const blob = await response.blob();
      if (!blob.size)
        throw Error("보고서가 비어 있어요. 담당자에게 문의해주세요.");
      const encoded = response.headers
        .get("content-disposition")
        ?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = (
        encoded ? decodeURIComponent(encoded) : "원케이션_캠페인보고.xlsx"
      ).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 60000);
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof Error ? e.message : "보고서를 다운로드하지 못했어요.",
        );
      else if (controller.current === request)
        setError(
          "보고서 준비 시간이 길어지고 있어요. 잠시 후 다시 눌러주세요.",
        );
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className={styles.root}>
      <a
        href={href}
        className="ui-button primary report-download"
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={(event) => {
          event.preventDefault();
          if (!busy) void download();
        }}
      >
        {label}
      </a>
      {busy && (
        <p>
          <BrandOrb
            active
            state="working"
            label="보고서 파일을 준비하고 있어요."
          />
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
