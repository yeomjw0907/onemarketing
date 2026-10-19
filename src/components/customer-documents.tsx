"use client";
import { FolderOpen, Layers3, CircleCheck, ArrowRight } from "lucide-react";
import { workspaceVisualStyles } from "./workspace-visuals";
import { useState } from "react";
import type { RecordData } from "@/lib/types";
const labels: Record<string, string> = {
  business_registration: "사업자등록증",
  reference: "회사·제품 소개서 등 참고자료",
  intake: "고객 작성 Excel",
};
export default function CustomerDocuments({
  customers,
  assets,
  projects,
  customerId,
  onReload,
}: {
  customers: RecordData[];
  assets: RecordData[];
  projects: RecordData[];
  customerId?: string;
  onReload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(customerId || "");
  const [category, setCategory] = useState("intake");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [projectId, setProjectId] = useState("");
  const owner = customerId || selected;
  const files = assets.filter((a) => a.customerId === owner && !a.projectId);
  async function send(body: FormData | { assetId: string; projectId: string }) {
    const response = await fetch(
      "/api/customer-files",
      body instanceof FormData
        ? { method: "POST", body }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "저장 실패");
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    let count = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 4 * 1024 * 1024)
          throw new Error(`${file.name}: 파일당 최대 4MB입니다.`);
        const form = new FormData();
        form.set("file", file);
        form.set("customerId", owner);
        form.set("category", category);
        await send(form);
        count++;
      }
      setMessage(`${count}개 파일을 등록했습니다.`);
    } catch (e) {
      setFailed(true);
      setMessage(
        `${count}개 저장 완료. ${e instanceof Error ? e.message : "업로드 실패"}`,
      );
    } finally {
      try {
        await onReload();
      } catch {
        setFailed(true);
        setMessage(
          "업로드 후 목록을 새로고침하지 못했습니다. 다시 새로고침하세요.",
        );
      }
      setBusy(false);
    }
  }
  async function copy(assetId: string) {
    setBusy(true);
    setFailed(false);
    try {
      await send({ assetId, projectId });
      await onReload();
      setMessage(
        "프로젝트 자료로 복사했습니다. 프로젝트의 자료 탭에서 내용을 확인하세요.",
      );
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "복사 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <div className="section-title">
        <h2>고객 자료 보관함</h2>
        <a href="/api/templates/customer-intake">
          고객 작성용 Excel 다운로드 ↓
        </a>
      </div>
      <div
        className={workspaceVisualStyles.processGuide}
        aria-label="자료 활용 순서"
      >
        <span>
          <FolderOpen size={18} />
          <strong>고객 자료 보관</strong>
          <small>소개서·작성 양식 업로드</small>
        </span>
        <ArrowRight size={15} />
        <span>
          <Layers3 size={18} />
          <strong>프로젝트에 복사</strong>
          <small>필요한 자료만 선택</small>
        </span>
        <ArrowRight size={15} />
        <span>
          <CircleCheck size={18} />
          <strong>제품 정보 확인</strong>
          <small>확정 후 제작에 사용</small>
        </span>
      </div>
      <p className="hint">
        고객 작성 Excel과 회사·제품 소개서 PDF를 보관할 수 있어요. PPT·한글·워드
        자료는 PDF로 변환해주세요. 프로젝트로 복사한 자료를 제품 정보 정리에
        사용하며, 사업자등록증은 AI 제작 자료에 자동으로 포함되지 않아요.
      </p>
      {!customerId && (
        <label>
          자료를 보관할 고객
          <select
            aria-label="자료실 고객"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setProjectId("");
            }}
          >
            <option value="">고객 선택</option>
            {customers
              .filter((c) => !c.deletedAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name)}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="row" style={{ margin: "16px 0", flexWrap: "wrap" }}>
        <label>
          자료 종류
          <select
            aria-label="자료 종류"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          파일 업로드
          <input
            aria-label="고객 자료 업로드"
            type="file"
            multiple
            disabled={!owner || busy}
            accept={
              category === "business_registration"
                ? ".pdf,.jpg,.jpeg,.png,.webp"
                : category === "intake"
                  ? ".xlsx,.csv"
                  : ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.txt,.md"
            }
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="hint">
        파일당 최대 4MB · PDF, 이미지, XLSX/CSV, TXT/MD. 파일은 관리자만 열 수
        있습니다.
      </p>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "error" : "notice"}
        >
          {message}
        </p>
      )}
      {owner && (
        <>
          <label>
            참고자료를 가져올 프로젝트
            <select
              aria-label="자료 복사 대상 프로젝트"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">프로젝트 선택</option>
              {projects
                .filter(
                  (p) =>
                    p.customerId === owner &&
                    !p.settled &&
                    !["completed", "cancelled"].includes(String(p.status)),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.name)}
                  </option>
                ))}
            </select>
          </label>
          {!files.length && (
            <p className="empty">등록된 고객 자료가 없습니다.</p>
          )}
          {files.map((a) => (
            <div key={a.id} className="section" style={{ marginTop: 12 }}>
              <div className="section-title">
                <div>
                  <span className="badge">{labels[String(a.category)]}</span>{" "}
                  <strong>{String(a.name)}</strong>
                  <small>
                    {" "}
                    · {new Date(a.createdAt).toLocaleDateString("ko-KR")} ·{" "}
                    {Math.ceil(Number(a.size) / 1024)}KB
                  </small>
                </div>
                <a
                  href={`/api/assets/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  다운로드 / 열기 ↗
                </a>
              </div>
              {a.extracted ? (
                <details>
                  <summary>작성 내용 미리보기</summary>
                  <pre className="content-preview">{String(a.extracted)}</pre>
                </details>
              ) : null}
              {a.category !== "business_registration" && (
                <button
                  type="button"
                  disabled={!projectId || busy}
                  onClick={() => copy(a.id)}
                >
                  프로젝트 자료로 복사
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
