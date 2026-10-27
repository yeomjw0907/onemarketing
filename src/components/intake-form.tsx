"use client";
import { useEffect, useState, useRef } from "react";
import { requestJSON } from "@/lib/request-json";
import QuestionFlow from "./question-flow";
import { intakeQuestions } from "@/lib/intake-question-plan";
import { workflowApi } from "./workflow-client";
import { intakeFields, type IntakeFields } from "@/lib/intake-schema";
import styles from "./intake-form.module.css";
type IntakeView = {
  id: string;
  version: number;
  status: string;
  fields: IntakeFields;
  requested: string[];
  note: string;
  fileCount: number;
  pendingUploads?: { id: string; name: string }[];
};
export default function IntakeForm() {
  const initialToken = useRef<string | null>(null);
  const savedDraft = useRef("");
  const loadGeneration = useRef(0);
  const serialize = (value: object) =>
    JSON.stringify(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
    );
  const [view, setView] = useState<IntakeView | null>(null),
    [fields, setFields] = useState(intakeFields.parse({})),
    [links, setLinks] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [uploadPhase, setUploadPhase] = useState("");
  async function load() {
    const request = ++loadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const token = initialToken.current;
      const v = await workflowApi<IntakeView>(
        "/api/intake",
        token ? { action: "open", token } : undefined,
      );
      if (request !== loadGeneration.current) return;
      const normalized = intakeFields.parse(v.fields);
      setView({ ...v, fields: normalized });
      setFields(normalized);
      setLinks(normalized.links.join("\n"));
      savedDraft.current = serialize(normalized);
    } catch (e) {
      if (request === loadGeneration.current) setError((e as Error).message);
    } finally {
      if (request === loadGeneration.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (initialToken.current === null)
      initialToken.current = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, []);
  const locked = !!view && ["submitted", "accepted"].includes(view.status);
  async function save(submit: boolean, quiet = false) {
    if (!view || busy) return false;
    const draft = {
      ...fields,
      links: links
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    if (!submit && serialize(draft) === savedDraft.current) {
      if (!quiet) setNotice("작성한 내용이 저장돼 있어요.");
      return true;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const v = await workflowApi<IntakeView>("/api/intake", {
        action: submit ? "submit" : "save",
        intakeId: view.id,
        version: view.version,
        fields: draft,
      });
      setView(v);
      setFields(v.fields);
      savedDraft.current = serialize(v.fields);
      if (!quiet)
        setNotice(
          submit
            ? "자료를 전달했습니다. 검토 후 필요한 내용을 안내해드릴게요."
            : "작성한 내용을 저장했습니다.",
        );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!view || busy) return;
    const video = /\.mp4$/i.test(file.name);
    if (!file.size || file.size > (video ? 40 : 4) * 1024 * 1024) {
      setError(
        video
          ? "MP4 영상은 40MB 이하로 등록해주세요."
          : "자료는 4MB 이하로 등록해주세요.",
      );
      return;
    }
    setBusy(true);
    setError("");
    let uploadId: string | undefined;
    let transferred = false;
    setUploadPhase("업로드를 준비하고 있어요…");
    try {
      if (file.size <= 4 * 1024 * 1024) {
        const form = new FormData();
        form.set("file", file);
        form.set("version", String(view.version));
        form.set("intakeId", view.id);
        setUploadPhase("자료를 등록하고 있어요…");
        const result = await requestJSON<{ version: number }>(
          "/api/intake",
          { method: "POST", body: form },
          { timeoutMs: 60_000 },
        );
        setView({
          ...view,
          version: result.version,
          fileCount: view.fileCount + 1,
        });
        setNotice(file.name + "을 등록했습니다.");
        return;
      }
      const upload = await workflowApi<{ id: string; signedUrl: string }>(
        "/api/intake",
        {
          action: "prepare-upload",
          intakeId: view.id,
          name: file.name,
          size: file.size,
        },
      );
      uploadId = upload.id;
      setUploadPhase("파일을 전송하고 있어요…");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload.signedUrl);
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );
        xhr.setRequestHeader("cache-control", "max-age=3600");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(Error("파일 전송에 실패했습니다. 다시 등록해주세요."));
        xhr.onerror = () => reject(Error("네트워크 연결을 확인해주세요."));
        xhr.ontimeout = () => reject(Error("전송 시간이 초과되었습니다."));
        xhr.timeout = 180000;
        xhr.send(file);
      });
      transferred = true;
      setUploadPhase("전송한 자료를 등록하고 있어요…");
      setProgress(null);
      const b = await workflowApi<{ version: number; fileCount: number }>(
        "/api/intake",
        { action: "complete-upload", intakeId: view.id, id: upload.id },
      );
      setView({ ...view, version: b.version, fileCount: b.fileCount });
      setNotice(file.name + "을 등록했습니다.");
    } catch (e) {
      if (uploadId && !transferred)
        await workflowApi("/api/intake", {
          action: "cancel-upload",
          intakeId: view.id,
          id: uploadId,
        }).catch(() => {});
      setError(e instanceof Error ? e.message : "등록하지 못했습니다.");
      try {
        const current = await workflowApi<IntakeView>("/api/intake");
        if (current.id === view.id) setView(current);
      } catch {}
    } finally {
      setBusy(false);
      setProgress(null);
      setUploadPhase("");
    }
  }
  const values: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [
        k,
        Array.isArray(v) ? links : String(v),
      ]),
    ),
    files: `${view?.fileCount || 0}개 자료`,
  };
  const uploadField = (
    <div>
      <label>
        파일 선택
        <input
          type="file"
          disabled={busy || locked}
          accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.csv,.txt,.md,.mp4"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      <p>등록된 자료 {view?.fileCount || 0}개</p>
      {uploadPhase && <p role="status">{uploadPhase}</p>}
      {progress !== null && (
        <label>
          파일 전송 {progress}%<progress value={progress} max={100} />
        </label>
      )}
      {view?.pendingUploads?.map((u) => (
        <p key={u.id}>
          전송 미완료: {u.name}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await workflowApi<{
                  version: number;
                  fileCount: number;
                }>("/api/intake", {
                  action: "complete-upload",
                  intakeId: view.id,
                  id: u.id,
                });
                setView({
                  ...view,
                  version: r.version,
                  fileCount: r.fileCount,
                  pendingUploads: view.pendingUploads?.filter(
                    (x) => x.id !== u.id,
                  ),
                });
                setNotice(u.name + "을 등록했습니다.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            등록 마무리
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await workflowApi("/api/intake", {
                  action: "cancel-upload",
                  intakeId: view.id,
                  id: u.id,
                });
                setView({
                  ...view,
                  pendingUploads: view.pendingUploads?.filter(
                    (x) => x.id !== u.id,
                  ),
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            요청 취소
          </button>
        </p>
      ))}
    </div>
  );
  return (
    <main className={styles.root}>
      <div className={styles.wrap}>
        <a href="/" className={styles.brand}>
          원마케팅
        </a>
        {!view && busy && (
          <p role="status">자료 요청 내용을 불러오고 있어요…</p>
        )}
        {!view && error && (
          <div role="alert">
            <p>{error}</p>
            <button type="button" disabled={busy} onClick={() => void load()}>
              다시 불러오기
            </button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {view && (
          <>
            {view.note && <p className={styles.note}>{view.note}</p>}
            {locked ? (
              <section>
                <h1>
                  {view.status === "accepted"
                    ? "자료 확인을 마쳤어요."
                    : "자료를 잘 전달했어요."}
                </h1>
                <p>
                  담당자가 제출한 내용을 확인하고 다음 과정을 안내해드릴게요.
                </p>
                <dl>
                  {intakeQuestions(view.requested)
                    .filter((q) => !q.visible || q.visible(values))
                    .map((q) => (
                      <div key={q.key}>
                        <dt>{q.title}</dt>
                        <dd>
                          {q.key === "files"
                            ? `${view.fileCount}개 자료`
                            : q.options?.find((o) => o.value === values[q.key])
                                ?.label ||
                              values[q.key] ||
                              "미입력"}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ) : (
              <QuestionFlow
                title="캠페인 자료 전달"
                questions={intakeQuestions(view.requested).map((q) =>
                  q.key === "files" ? { ...q, render: uploadField } : q,
                )}
                values={values}
                onChange={(key, value) => {
                  if (key === "links") setLinks(value);
                  else setFields((f) => ({ ...f, [key]: value }));
                }}
                busy={busy}
                error={error}
                onSave={() => save(false)}
                onAdvance={() => save(false, true)}
                onComplete={() => save(true)}
                completeLabel="자료 전달하기"
              />
            )}
            <p className={styles.privacy}>
              이번 캠페인 전용 링크예요. 외부에 공유하지 말아주세요. 작성 내용은
              임시 저장 후 이어서 입력할 수 있어요.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
