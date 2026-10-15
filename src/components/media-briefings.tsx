"use client";
import { useEffect, useState } from "react";
import type { DatabaseView, RecordData } from "@/lib/types";
import type { MediaBrief } from "@/lib/media-plans";
import { briefingPrompt } from "@/lib/media-guidance";
import { money } from "@/lib/types";

export type BriefingRequest = {
  taskId: string;
  mediaType: "image" | "video";
  replaceAssetId?: string;
  nonce: number;
};
type Props = {
  project: RecordData;
  data: DatabaseView;
  request?: BriefingRequest;
  estimates: Record<string, number>;
  reload: () => Promise<void>;
};
async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "요청 실패");
  return result;
}
function Plan({
  plan,
  data,
  estimates,
  reload,
}: { plan: RecordData } & Pick<Props, "data" | "estimates" | "reload">) {
  const [brief, setBrief] = useState(plan.brief as MediaBrief);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = JSON.stringify(brief) !== JSON.stringify(plan.brief);
  const used = Boolean(plan.consumedJobId),
    approved = plan.status === "approved";
  const estimate = estimates[String(plan.mediaType)] || 1000;
  const source = data.assets.find((a) => a.id === plan.sourceAssetId);
  async function act(action: "edit" | "approve" | "generate") {
    setBusy(true);
    setError("");
    try {
      if (action === "generate")
        await post("/api/jobs", {
          projectId: plan.projectId,
          taskId: plan.taskId,
          type: plan.mediaType,
          replaceAssetId: plan.replaceAssetId || undefined,
          mediaPlanId: plan.id,
          estimate,
          key: crypto.randomUUID(),
        });
      else
        await post("/api/media-plans", {
          id: plan.id,
          version: plan.version,
          action,
          ...(action === "edit" ? { brief } : {}),
        });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="section">
      <div className="section-title">
        <h3>
          {String(data.tasks.find((t) => t.id === plan.taskId)?.name || "작업")}{" "}
          · {plan.mediaType === "image" ? `이미지 ${plan.sceneNumber}` : "영상"}
          {plan.replaceAssetId ? " · 교체 버전" : ""}
        </h3>
        <span className="badge blue">
          {used
            ? "생성 요청 등록됨"
            : approved
              ? "생성 승인됨"
              : "브리핑 검수 대기"}
        </span>
      </div>
      <p className="hint">
        이번 요청: {String(plan.generationRequest || "자료에 맞춰 자동 기획")}
      </p>
      {source && (
        <details>
          <summary>생성에 사용할 참고 사진 · {String(source.name)}</summary>
          <img
            src={`/api/assets/${source.id}`}
            alt="생성에 사용할 참고 사진"
            style={{ maxWidth: 280, maxHeight: 240, objectFit: "contain" }}
          />
        </details>
      )}
      <p className="hint">
        {plan.mediaType === "image"
          ? "1024×1536 · 이미지 1장"
          : `${String((plan.settings as Record<string, unknown>).duration)}초 · 720p · 무음${data.tasks.find((t) => t.id === plan.taskId)?.mode === "hybrid" ? " · 생성 구간 이후 기존 혼합형 편집 적용" : ""}`}{" "}
        · 예상 제작비 {money(estimate)} (실제 청구액과 다를 수 있음)
      </p>
      <details>
        <summary>모델·실행 설정</summary>
        <pre className="content-preview">
          {String(plan.model)}
          {"\n"}
          {JSON.stringify(plan.settings, null, 2)}
        </pre>
      </details>
      <fieldset
        disabled={busy || used}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <label>
          장면 의도
          <textarea
            value={brief.summary}
            onChange={(e) => setBrief({ ...brief, summary: e.target.value })}
          />
        </label>
        {brief.scenes.map((scene, i) => (
          <div className="section" key={i}>
            <strong>
              장면 {i + 1} · {scene.timing}
            </strong>
            <div className="row">
              {(
                [
                  ["people", "인물 등장"],
                  ["hands", "손 등장"],
                  ["eating", "먹는 장면"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={scene[key]}
                    onChange={(e) =>
                      setBrief({
                        ...brief,
                        scenes: brief.scenes.map((s, n) =>
                          n === i ? { ...s, [key]: e.target.checked } : s,
                        ),
                      })
                    }
                  />{" "}
                  {label}
                </label>
              ))}
            </div>
            {(
              [
                ["composition", "구도·빛·대상 위치"],
                ["action", "대상 동작"],
                ["camera", "카메라 연출"],
                ["timing", "장면 시간"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  value={scene[key]}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      scenes: brief.scenes.map((s, n) =>
                        n === i ? { ...s, [key]: e.target.value } : s,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
        ))}
        {brief.warnings.length > 0 && (
          <div className="notice">
            확인할 사항
            <ul>
              {brief.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <label>
          기본 연출 프롬프트
          <textarea
            rows={10}
            value={brief.prompt}
            onChange={(e) => setBrief({ ...brief, prompt: e.target.value })}
          />
        </label>
        <p className="hint">
          장면 설명과 실제 프롬프트가 일치하는지 확인하세요. 직접 수정하면
          양쪽에 반영한 뒤 저장하거나, 위 요청란에 변경 내용을 적고 새 브리핑을
          작성하세요. 저장하면 기존 승인이 해제됩니다.
        </p>
        <details open>
          <summary>실제 전송할 최종 프롬프트</summary>
          <pre className="content-preview">
            {briefingPrompt(brief, String(plan.guidance || ""))}
          </pre>
        </details>
        <div className="row">
          <button disabled={!dirty} onClick={() => act("edit")}>
            수정 저장 · 승인 해제
          </button>
          <button disabled={dirty || approved} onClick={() => act("approve")}>
            브리핑 검수 완료 · 생성 승인
          </button>
          <button
            className="primary"
            disabled={dirty || !approved}
            onClick={() => act("generate")}
          >
            승인한 내용으로 {plan.mediaType === "image" ? "이미지" : "영상"}{" "}
            생성 · 예상 {money(estimate)}
          </button>
        </div>
      </fieldset>
      {used && (
        <p role="status">
          생성 요청이 등록되었습니다. 실행 상태는 아래 로그에서, 완성본은
          제작·검수에서 확인하세요.
        </p>
      )}
      {busy && (
        <p role="status">
          <span className="job-spinner" aria-hidden="true" /> 처리 중
        </p>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </article>
  );
}
export default function MediaBriefings({
  project,
  data,
  request,
  estimates,
  reload,
}: Props) {
  const tasks = data.tasks.filter(
    (t) => t.projectId === project.id && t.status !== "cancelled",
  );
  const [taskId, setTaskId] = useState(request?.taskId || tasks[0]?.id || ""),
    [mediaType, setMediaType] = useState<"image" | "video">(
      request?.mediaType || "image",
    ),
    [replaceAssetId, setReplaceAssetId] = useState(
      request?.replaceAssetId || "",
    ),
    [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (request) {
      setTaskId(request.taskId);
      setMediaType(request.mediaType);
      setReplaceAssetId(request.replaceAssetId || "");
    }
  }, [request]);
  const active = data.jobs.some(
    (j) =>
      j.taskId === taskId &&
      j.type === "media-plan" &&
      ["pending", "running", "uncertain"].includes(String(j.status)),
  );
  const plans = data.media_plans.filter(
    (p) =>
      p.projectId === project.id &&
      p.taskId === taskId &&
      p.mediaType === mediaType,
  );
  const selectedTask = tasks.find((t) => t.id === taskId);
  async function draft() {
    setBusy(true);
    setError("");
    try {
      await post("/api/jobs", {
        projectId: project.id,
        taskId,
        type: "media-plan",
        mediaType,
        replaceAssetId: replaceAssetId || undefined,
        generationRequest: instructions,
        estimate: estimates["media-plan"] || estimates.copy || 1000,
        key: crypto.randomUUID(),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section">
        <h2>생성 전 브리핑 · 승인</h2>
        <p>
          요청 입력 → AI 브리핑·프롬프트 작성 → 장면 검수·수정 → 생성 승인 →
          이미지·영상 생성
        </p>
        <p className="hint">
          브리핑 작성은 Claude만 호출합니다. 소액의 원고 모델 비용이 발생하며
          fal 생성은 아래에서 승인하고 생성 버튼을 누른 뒤 시작합니다. 이미지 한
          장·영상 한 편마다 승인합니다.
        </p>
        <label>
          게시 작업
          <select
            value={taskId}
            onChange={(e) => {
              setTaskId(e.target.value);
              setReplaceAssetId("");
            }}
          >
            <option value="">선택하세요</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {String(t.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          생성 종류
          <select
            value={mediaType}
            onChange={(e) => {
              setMediaType(e.target.value as "image" | "video");
              setReplaceAssetId("");
            }}
          >
            <option value="image">이미지</option>
            <option value="video">영상</option>
          </select>
        </label>
        {replaceAssetId && (
          <p className="notice">
            선택한 이미지의 새 버전을 기획합니다.{" "}
            <button onClick={() => setReplaceAssetId("")}>
              새 이미지로 변경
            </button>
          </p>
        )}
        <label>
          이번 생성 요청 (선택)
          <textarea
            rows={4}
            maxLength={5000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="예: 손이나 먹는 장면 없이 제품을 가까이 보여주세요. 카메라는 천천히 옆으로 이동하면 좋겠어요."
          />
        </label>
        <p className="hint">
          비워두면 프로젝트 자료·촬영 대상·추가 요청·원고에 맞춰 기획합니다.
          자료나 기획이 바뀌면 새 브리핑을 작성해야 합니다.
        </p>
        <button
          className="primary"
          disabled={
            busy ||
            active ||
            !taskId ||
            (mediaType === "video" &&
              (selectedTask?.channel !== "clip" ||
                selectedTask?.mode === "slideshow"))
          }
          onClick={draft}
        >
          브리핑·프롬프트 작성 · 예상{" "}
          {money(estimates["media-plan"] || estimates.copy || 1000)}
        </button>
        {(busy || active) && (
          <p role="status">
            <span className="job-spinner" aria-hidden="true" /> 브리핑 작성 요청
            처리 중 · 진행 상태는 아래 로그를 확인하세요.
          </p>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </div>
      {plans.length ? (
        plans.map((plan) => (
          <Plan
            key={`${plan.id}:${plan.version}`}
            plan={plan}
            data={data}
            estimates={estimates}
            reload={reload}
          />
        ))
      ) : (
        <p className="hint">
          작성된 브리핑이 없습니다. 먼저 요청을 입력하고 브리핑을 작성하세요.
        </p>
      )}
    </section>
  );
}
