"use client";
import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Plus,
  Monitor,
  ArrowUp,
  Check,
  Square,
  Paperclip,
  X,
} from "lucide-react";
import { Button, Feedback } from "./ui/workflow-ui";
import BrandOrb from "./brand-orb";
import AssistantQuestion from "./assistant-question";
import AssistantWorkflowCard from "./assistant-workflow-card";
import styles from "./dashboard-assistant.module.css";
type Row = Record<string, any>;
type State = {
  devices: Row[];
  threads: Row[];
  turns: Row[];
  attachments?: Row[];
};
const titles: Record<string, string> = {
  create_customer: "고객 등록 전 확인",
  create_product: "제품 등록 전 확인",
  create_campaign_draft: "캠페인 초안 저장 전 확인",
};
const fieldLabels: Record<string, string> = {
  name: "이름",
  brand: "브랜드",
  businessNumber: "사업자번호",
  contact: "연락 정보",
  tone: "문체",
  target: "대상",
  forbidden: "사용하지 않을 표현",
  facts: "확인된 제품 정보",
  claims: "표현 근거",
  preserve: "유지할 내용",
  start: "게시 시작일",
  end: "게시 마감일",
  blog: "블로그",
  clip: "클립",
  discount: "할인",
  guide: "참여 가이드",
};
export default function DashboardAssistant({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<State>({
      devices: [],
      threads: [],
      turns: [],
    }),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [connecting, setConnecting] = useState(false),
    [pairCode, setPairCode] = useState(""),
    [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false),
    [pendingFiles, setPendingFiles] = useState<Record<string, string[]>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const usedFiles = new Set(data.turns.flatMap((t) => t.attachment_ids || []));
  const chosenFiles =
    pendingFiles[selected] ??
    (data.attachments || [])
      .filter((f) => !usedFiles.has(f.id))
      .map((f) => f.id);
  const input = useRef<HTMLTextAreaElement>(null),
    end = useRef<HTMLDivElement>(null),
    retry = useRef<{
      threadId: string;
      message: string;
      requestId: string;
      attachmentIds: string[];
    } | null>(null);
  const active = data.turns.find((t) =>
    ["queued", "running"].includes(t.status),
  );
  const device = data.devices.find((d) => d.online && d.status === "ready");
  const needsLogin = data.devices.some(
    (d) => d.online && d.status === "login_required",
  );
  const connectionError = data.devices.some(
    (d) => d.online && d.status === "error",
  );
  async function refresh(thread = selected) {
    const r = await fetch(
      "/api/assistant" +
        (thread ? "?thread=" + encodeURIComponent(thread) : ""),
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    if (!thread && d.threads.length) setSelected(d.threads[0].id);
  }
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch(
          "/api/assistant" +
            (selected ? "?thread=" + encodeURIComponent(selected) : ""),
          { cache: "no-store", signal: controller.signal },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!disposed) {
          setData(d);
          if (!selected && d.threads.length) setSelected(d.threads[0].id);
        }
      } catch (e) {
        if (!disposed && !(e instanceof Error && e.name === "AbortError"))
          setError(
            e instanceof Error ? e.message : "연결 상태를 불러오지 못했어요.",
          );
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [selected]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [data.turns.length, active?.status]);
  async function act(body: Row) {
    const r = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  async function action(body: Row) {
    setBusy(true);
    setError("");
    try {
      const d = await act(body);
      await refresh();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function send(override?: string) {
    const requested = override ?? message;
    if (
      (!requested.trim() && !chosenFiles.length) ||
      busy ||
      uploading ||
      active ||
      !device
    )
      return;
    setBusy(true);
    setError("");
    try {
      let id = selected;
      if (!id) {
        id = (await act({ action: "new" })).id;
        setSelected(id);
      }
      const text =
        requested.trim() ||
        "첨부한 자료를 정리하고 필요한 정보와 다음 단계를 안내해줘.";
      const payload =
        retry.current?.threadId === id &&
        retry.current.message === text &&
        JSON.stringify(retry.current.attachmentIds) ===
          JSON.stringify(chosenFiles)
          ? retry.current
          : {
              threadId: id,
              message: text,
              requestId: crypto.randomUUID(),
              attachmentIds: chosenFiles,
            };
      retry.current = payload;
      await act({ action: "message", ...payload });
      retry.current = null;
      setMessage((current) =>
        current.trim() === requested.trim() ? "" : current,
      );
      setPendingFiles((prev) => ({ ...prev, [id]: [] }));
      await refresh(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadFiles(files: FileList | null) {
    if (!files?.length || uploading || busy) return;
    setUploading(true);
    setError("");
    try {
      let threadId = selected;
      if (!threadId) {
        threadId = (await act({ action: "new" })).id;
        setSelected(threadId);
      }
      const ids = [
        ...(pendingFiles[threadId] ||
          (threadId === selected ? chosenFiles : [])),
      ];
      if (ids.length + files.length > 6)
        throw new Error("한 번에 파일을 최대 6개까지 보낼 수 있어요.");
      for (const file of Array.from(files)) {
        if (file.size > 4 * 1024 * 1024)
          throw new Error("파일은 4MB 이하로 첨부해주세요.");
        const form = new FormData();
        form.set("file", file);
        form.set("threadId", threadId);
        const r = await fetch("/api/assistant/attachments", {
            method: "POST",
            body: form,
          }),
          d = await r.json();
        if (!r.ok) throw new Error(d.error || "파일을 첨부하지 못했어요.");
        ids.push(d.id);
        setPendingFiles((prev) => ({ ...prev, [threadId]: [...ids] }));
      }
      await refresh(threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 첨부하지 못했어요.");
      await refresh().catch(() => {});
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function removePendingFile(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/assistant/attachments/" + id, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPendingFiles((prev) => ({
        ...prev,
        [selected]: chosenFiles.filter((x) => x !== id),
      }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 제외하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  const pairCommand = pairCode
    ? `npm run assistant:pair -- --code ${pairCode}`
    : "";
  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <div>
          <h1>업무 도우미</h1>
          <p>자료를 첨부하고 업무를 준비하세요. 실행 전에는 꼭 확인받아요.</p>
        </div>
        <div className={styles.headerActions}>
          <Button onClick={() => setConnecting(!connecting)}>
            <Monitor size={16} />
            {device ? "PC 연결 관리" : "PC 연결"}
          </Button>
          <Button
            disabled={busy || uploading || !!active}
            onClick={async () => {
              const d = await action({ action: "new" });
              if (d) {
                setData((prev) => ({ ...prev, turns: [], attachments: [] }));
                setSelected(d.id);
              }
            }}
          >
            <Plus size={16} />새 대화
          </Button>
        </div>
      </div>
      <div className={styles.connectionStatus} role="status">
        <span className={device ? styles.online : styles.offline} />
        <strong>
          {device
            ? "PC 연결됨"
            : needsLogin
              ? "ChatGPT 로그인 확인 필요"
              : connectionError
                ? "PC 연결 확인 필요"
                : "PC 연결 필요"}
        </strong>
        <span>
          {device
            ? device.name
            : "PC 연결 프로그램이 실행 중이어야 답변할 수 있어요."}
        </span>
      </div>
      {connecting && (
        <section className={styles.setup} aria-label="PC 연결 설정">
          <h2>
            {device
              ? "연결된 PC를 관리해요"
              : "답변을 준비할 PC를 연결해주세요"}
          </h2>
          <p>
            PC의 Codex 구독 로그인으로 답변을 준비해요. 모바일에서도 같은
            대시보드로 이용할 수 있어요.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              const d = await action({ action: "pair" });
              if (d) {
                setPairCode(d.code);
                setCopied(false);
              }
            }}
          >
            연결 코드 만들기
          </Button>
          {pairCode && (
            <>
              <p>
                10분 안에 이 프로젝트 폴더의 PC 터미널에서 실행해주세요. 이
                코드는 AI API 키가 아닌 일회용 PC 연결 코드예요.
              </p>
              <code className={styles.command}>{pairCommand}</code>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pairCommand);
                    setCopied(true);
                  } catch {
                    setError("명령을 선택해 직접 복사해주세요.");
                  }
                }}
              >
                {copied ? "복사했어요" : "연결 명령 복사"}
              </Button>
            </>
          )}
          <details>
            <summary>연결 프로그램 실행 방법</summary>
            <p>
              처음 연결 후 <code>npm run assistant:worker</code>를 실행해주세요.
              PC가 꺼지거나 프로그램이 종료되면 새 답변은 대기해요. 저장 전 확인
              카드는 대시보드에 남아요.
            </p>
            <p>
              ChatGPT 로그인이 필요하면 PC에서 <code>npx codex login</code>으로
              로그인해주세요. 다른 기기와 연결 코드를 공유하지 마세요.
            </p>
          </details>
          {data.devices.map((d) => (
            <div key={d.id} className={styles.device}>
              <span>
                {d.name} ·{" "}
                {!d.online
                  ? "오프라인"
                  : d.status === "ready"
                    ? "연결됨"
                    : d.status === "login_required"
                      ? "ChatGPT 로그인 필요"
                      : d.status === "error"
                        ? "연결 확인 필요"
                        : "연결 준비 중"}
              </span>
              <Button
                variant="text"
                disabled={busy}
                onClick={() => void action({ action: "disconnect", id: d.id })}
              >
                연결 해제
              </Button>
            </div>
          ))}
        </section>
      )}
      {error && <Feedback tone="error">{error}</Feedback>}
      <div className={styles.threadBar}>
        <label>
          대화
          <select
            aria-label="대화 선택"
            value={selected}
            onChange={(e) => {
              setData((prev) => ({ ...prev, turns: [], attachments: [] }));
              setSelected(e.target.value);
            }}
          >
            <option value="">새 대화</option>
            {data.threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <span>저장·제작·참여자 전달은 확인한 뒤 실행해요.</span>
      </div>
      <section className={styles.conversation} aria-label="업무 대화">
        {!data.turns.length && (
          <div className={styles.empty}>
            <MessageSquare size={27} />
            <h2>어떤 업무를 준비할까요?</h2>
            <p>회사·제품 자료를 첨부하거나, 준비할 캠페인을 알려주세요.</p>
            <div className={styles.suggestions}>
              {[
                "등록된 고객과 제품을 알려줘",
                "새 고객을 등록하고 싶어",
                "공감콜 블로그 30개·클립 30개 캠페인 초안을 준비하자",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setMessage(s);
                    input.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {data.turns.map((t) => (
          <article key={t.id} className={styles.turn}>
            <div className={styles.user}>
              <span>나</span>
              <p>{t.input}</p>
              {!!t.attachment_ids?.length && (
                <div className={styles.fileLinks}>
                  {t.attachment_ids.map((id: string) => {
                    const f = data.attachments?.find((f) => f.id === id);
                    return f ? (
                      <a key={id} href={f.url} target="_blank" rel="noreferrer">
                        <Paperclip size={13} />
                        {f.name}
                      </a>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <div className={styles.assistant}>
              <span>원케이션</span>
              {["queued", "running"].includes(t.status) ? (
                <div className={styles.processing}>
                  <BrandOrb
                    active={!!device}
                    state={t.status === "queued" ? "connecting" : "composing"}
                    size={64}
                  />
                  <div
                    className={styles.processingCopy}
                    role="status"
                    aria-live="polite"
                  >
                    <strong>
                      {!device
                        ? "PC 연결을 기다리고 있어요"
                        : t.status === "queued"
                          ? "요청을 전달하고 있어요"
                          : "내용을 정리하고 있어요"}
                    </strong>
                    <p>
                      {!device
                        ? "PC 연결이 끊겼어요. 다시 연결하거나 요청을 중단해주세요."
                        : t.status === "queued"
                          ? "연결된 PC가 요청을 받으면 답변을 준비해요."
                          : "잠시만 기다려주세요. 저장할 내용은 먼저 보여드릴게요."}
                    </p>
                  </div>
                  <Button
                    variant="text"
                    disabled={busy}
                    onClick={() => void action({ action: "cancel", id: t.id })}
                  >
                    <Square size={12} />
                    중단
                  </Button>
                </div>
              ) : (
                <p>{t.reply}</p>
              )}
              {t.proposal &&
                (t.proposal.tool === "run_workflow" ? (
                  <AssistantWorkflowCard
                    key={t.id}
                    turn={t}
                    busy={busy}
                    onConfirm={async () => {
                      const d = await action({
                        action: "confirm",
                        id: t.id,
                        reviewed: true,
                      });
                      if (d) await onSaved();
                    }}
                    onDismiss={() =>
                      void action({ action: "dismiss", id: t.id })
                    }
                  />
                ) : (
                  <section
                    className={styles.proposal}
                    aria-label={titles[t.proposal.tool]}
                  >
                    <h3>{titles[t.proposal.tool]}</h3>
                    {t.proposal.labels.customerName && (
                      <p className={styles.context}>
                        고객 · {t.proposal.labels.customerName}
                        {t.proposal.labels.targetName
                          ? " / " + t.proposal.labels.targetName
                          : ""}
                      </p>
                    )}
                    <dl>
                      {["blog", "clip"].map(
                        (channel) =>
                          t.proposal.labels[channel + "PriceName"] && (
                            <div key={channel}>
                              <dt>
                                {channel === "blog"
                                  ? "블로그 상품"
                                  : "클립 상품"}
                              </dt>
                              <dd>
                                {t.proposal.labels[channel + "PriceName"]}
                              </dd>
                            </div>
                          ),
                      )}
                      {Object.entries(t.proposal.args as Row)
                        .filter(([k]) => fieldLabels[k])
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{fieldLabels[k]}</dt>
                            <dd>
                              {String(v ?? "—")}
                              {["blog", "clip"].includes(k) ? "개" : ""}
                            </dd>
                          </div>
                        ))}
                      {t.proposal.labels.supply !== undefined && (
                        <>
                          <div>
                            <dt>공급가</dt>
                            <dd>
                              {Number(t.proposal.labels.supply).toLocaleString(
                                "ko-KR",
                              )}
                              원
                            </dd>
                          </div>
                          <div>
                            <dt>합계 · 부가세 포함</dt>
                            <dd>
                              {Number(t.proposal.labels.total).toLocaleString(
                                "ko-KR",
                              )}
                              원
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    {t.proposal.args.policy && (
                      <details>
                        <summary>모집·제출·수정 조건 확인</summary>
                        <p className={styles.context}>
                          제안 유효 {t.proposal.args.policy.offerHours}시간 ·
                          제출 {t.proposal.args.policy.submissionDays}일 · 수정{" "}
                          {t.proposal.args.policy.revisionDays}일 · 준비{" "}
                          {t.proposal.args.policy.preparationDays}일 · 검수 3일
                          후 · 유지 90일
                        </p>
                      </details>
                    )}
                    {t.proposal.labels.timeline && (
                      <details>
                        <summary>주차별 게시 계획 확인</summary>
                        {t.proposal.labels.timeline.map((w: Row) => (
                          <p key={w.start} className={styles.context}>
                            {w.start} ~ {w.end} · 블로그 {w.blog}개 · 클립{" "}
                            {w.clip}개
                          </p>
                        ))}
                      </details>
                    )}
                    {t.proposal.labels.warnings?.map((w: string) => (
                      <p className={styles.warning} key={w}>
                        {w}
                      </p>
                    ))}
                    {t.proposal_status === "pending" ? (
                      <>
                        <p className={styles.confirmHint}>
                          아직 저장되지 않았어요. 내용을 확인하고 저장해주세요.
                          수정할 내용은 대화로 알려주세요.
                        </p>
                        <div className={styles.proposalActions}>
                          <Button
                            variant="primary"
                            busy={busy}
                            onClick={async () => {
                              const result = await action({
                                action: "confirm",
                                id: t.id,
                              });
                              if (result) await onSaved();
                            }}
                          >
                            확인하고 저장
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void action({ action: "dismiss", id: t.id })
                            }
                          >
                            취소
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.saved}>
                        {t.proposal_status === "saved" ? (
                          <>
                            <Check size={15} />
                            {t.save_result?.existing
                              ? "기존 항목이 있어 추가 등록하지 않았어요."
                              : "저장했어요. " +
                                (t.proposal.tool === "create_campaign_draft"
                                  ? "캠페인 운영에서 초안을 확인해주세요."
                                  : "고객·제품 목록에서 확인할 수 있어요.")}
                          </>
                        ) : t.proposal_status === "superseded" ? (
                          "새 요청으로 대체된 확인 카드예요."
                        ) : (
                          "저장하지 않은 확인 카드예요."
                        )}
                      </p>
                    )}
                  </section>
                ))}
              {t.question &&
                t.status === "completed" &&
                (t.id === data.turns.at(-1)?.id ? (
                  <AssistantQuestion
                    key={t.id}
                    id={t.id}
                    question={t.question}
                    disabled={busy || !!active || !device}
                    onAnswer={action}
                    onCustom={() => {
                      input.current?.focus();
                      input.current?.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    }}
                  />
                ) : (
                  <p className={styles.questionHint}>
                    이전 질문 · {t.question.title}
                  </p>
                ))}
            </div>
          </article>
        ))}
        <div ref={end} />
      </section>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className={styles.attachmentBar}>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp"
            hidden
            aria-label="대화에 파일 첨부"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="text"
            disabled={busy || uploading || !!active}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={16} />
            {uploading ? "파일을 읽고 있어요" : "파일 첨부"}
          </Button>
          <span>PDF·엑셀·텍스트·이미지 · 파일당 4MB</span>
          <BrandOrb active={uploading} state="weaving" size={20} />
        </div>
        {!!chosenFiles.length && (
          <div className={styles.pendingFiles}>
            {chosenFiles.map((id) => {
              const f = data.attachments?.find((f) => f.id === id);
              return (
                <div key={id}>
                  <span>
                    <Paperclip size={14} />
                    {f?.name || "첨부한 자료"}
                  </span>
                  <button
                    type="button"
                    aria-label={(f?.name || "첨부파일") + " 제외"}
                    disabled={busy || uploading}
                    onClick={() => void removePendingFile(id)}
                  >
                    <X size={14} />
                  </button>
                  {f?.note && <p>{f.note}</p>}
                </div>
              );
            })}
          </div>
        )}
        {data.turns.some((t) => t.proposal_status === "saved") && (
          <div className={styles.questionActions}>
            <Button
              disabled={busy || uploading || !!active || !device}
              onClick={() =>
                void send(
                  "방금 처리한 결과와 현재 작업 상태를 확인해서 다음에 필요한 단계 하나를 준비해줘. 실행은 하지 말고 확인 카드나 필요한 질문을 보여줘.",
                )
              }
            >
              다음 단계 준비하기
            </Button>
          </div>
        )}
        <label className={styles.composerLabel} htmlFor="assistant-message">
          직접 입력하거나 추가로 요청하기
        </label>
        <div className={styles.inputRow}>
          <textarea
            id="assistant-message"
            ref={input}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={6000}
            rows={3}
            placeholder={
              device
                ? "선택 대신 직접 답하거나, 원하는 내용을 자유롭게 적어주세요"
                : "PC 연결 후 요청을 보낼 수 있어요"
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            variant="primary"
            type="submit"
            disabled={
              busy ||
              uploading ||
              !!active ||
              !device ||
              (!message.trim() && !chosenFiles.length)
            }
            aria-label="요청 보내기"
          >
            <ArrowUp size={19} />
          </Button>
        </div>
        <p>
          첨부자료는 대화에만 보관해요. 등록·유료 제작·참여자 전달은 내용을
          확인한 뒤 실행해요.
        </p>
      </form>
    </div>
  );
}
