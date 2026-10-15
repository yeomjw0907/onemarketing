"use client";
import { useEffect, useRef, useState } from "react";
import { stageLabels, type RecordData } from "@/lib/types";
const labels: Record<string, string> = {
  research: "조사·기획",
  copy: "원고",
  image: "이미지",
  video: "영상",
  slideshow: "슬라이드",
};
type Job = {
  id: string;
  type: string;
  taskId: string;
  status: string;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  error: string;
};
export default function JobMonitor({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: RecordData[];
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [logs, setLogs] = useState<RecordData[]>([]),
    [jobId, setJobId] = useState(""),
    [error, setError] = useState(""),
    [follow, setFollow] = useState(true),
    [updated, setUpdated] = useState("");
  const panel = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        if (!document.hidden) {
          const r = await fetch(
            `/api/job-logs?projectId=${projectId}${jobId ? `&jobId=${jobId}` : ""}`,
            { signal: controller.signal },
          );
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (!stopped) {
            setJobs(d.jobs);
            setLogs(d.logs);
            setError("");
            setUpdated(new Date().toLocaleTimeString("ko-KR"));
          }
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (!stopped) timer = setTimeout(refresh, 4000);
      }
    }
    refresh();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [projectId, jobId]);
  useEffect(() => {
    if (follow && panel.current)
      panel.current.scrollTop = panel.current.scrollHeight;
  }, [logs, follow]);
  const text = logs
    .map(
      (l) =>
        `[${new Date(l.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}] [${String(l.level).toUpperCase()}] [${labels[String(l.type)] || l.type}] [${l.jobId}] ${l.stage}: ${l.message}${l.provider ? ` | ${l.provider}` : ""}${l.model ? ` | ${l.model}` : ""}${l.requestId ? ` | request=${l.requestId}` : ""}${typeof l.durationMs === "number" ? ` | ${l.durationMs}ms` : ""}`,
    )
    .join("\n");
  return (
    <section className="section job-monitor">
      <div className="section-title">
        <h2>실시간 실행 상태 · 로그</h2>
        <span className="muted">
          4초마다 갱신{updated ? ` · ${updated}` : ""}
        </span>
      </div>
      <div>
        {jobs
          .filter((j) => !jobId || j.id === jobId)
          .slice(0, 12)
          .map((j) => {
            const last = [...logs].reverse().find((l) => l.jobId === j.id);
            const task = tasks.find((t) => t.id === j.taskId);
            return (
              <div className="amountline" key={j.id}>
                <div>
                  <strong>{labels[j.type] || j.type}</strong> ·{" "}
                  {String(task?.name || "프로젝트 전체")}
                  <small className="muted">
                    {" "}
                    · {j.id.slice(0, 8)} · 실행 {j.attempts}회
                  </small>
                  <p>
                    {j.error ||
                      String(last?.message || "상세 로그를 기다리고 있습니다.")}
                  </p>
                </div>
                <span
                  className={
                    j.status === "failed" || j.status === "uncertain"
                      ? "badge orange"
                      : "badge"
                  }
                >
                  {stageLabels[j.status] || j.status}
                </span>
              </div>
            );
          })}
        {!jobs.length && (
          <p className="muted">
            AI 작업을 실행하면 요청부터 결과 저장까지 이곳에 표시됩니다.
          </p>
        )}
      </div>
      <div className="row">
        <label>
          로그 작업
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">프로젝트 전체</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {labels[j.type] || j.type} · {j.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
            style={{ width: "auto" }}
          />
          최신 로그 따라가기
        </label>
        <button
          disabled={!logs.length}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([text], { type: "text/plain;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `실행로그_${projectId}.txt`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          로그 TXT 다운로드
        </button>
      </div>
      <pre
        className="execution-log"
        ref={panel}
        tabIndex={0}
        aria-label="작업 실행 로그"
      >
        {text || "아직 기록된 로그가 없습니다."}
      </pre>
      <p className="hint">
        선택한 범위의 최근 500개 로그입니다. API 키·프롬프트 원문·서명된
        다운로드 URL은 기록하지 않습니다. 생성 진행률은 공급사가 제공하는 상태로
        표시합니다.
      </p>
      {error && <p role="alert">{error} · 다음 갱신에서 다시 시도합니다.</p>}
    </section>
  );
}
