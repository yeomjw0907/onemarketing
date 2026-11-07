export function ClipQualityNote({ report }: { report: unknown }) {
  if (!report || typeof report !== "object") return null;
  if ("status" in report && report.status === "unavailable")
    return (
      <p className="warn">
        영상 자동 검토를 완료하지 못했습니다. 재생해서 화면과 전환을
        확인해주세요.
      </p>
    );
  if (!("warnings" in report) || !Array.isArray(report.warnings)) return null;
  const warnings = report.warnings.filter(
    (w): w is { start: number; end: number; message: string } =>
      !!w &&
      typeof w === "object" &&
      Number.isFinite(w.start) &&
      Number.isFinite(w.end) &&
      typeof w.message === "string",
  );
  if (!warnings.length) return null;
  return (
    <div className="warn">
      <strong>재생해서 확인할 구간</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>
            {w.start.toFixed(1)}~{w.end.toFixed(1)}초 · {w.message}
          </li>
        ))}
      </ul>
      <small>
        의도한 정지 화면이나 어두운 전환일 수 있습니다. 게시 전 확인해주세요.
      </small>
    </div>
  );
}
