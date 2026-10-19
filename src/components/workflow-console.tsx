"use client";
import { taskDeadline, taskOverdue } from "@/lib/task-deadline";
import { useState, useEffect } from "react";
import { money, type DatabaseView, type RecordData } from "@/lib/types";
import {
  recommendParticipants,
  type RecommendationOrder,
} from "@/lib/participant-recommendations";
import {
  Button,
  Field,
  Form,
  Feedback,
  EmptyState,
  Tabs,
  StatusBadge,
  statusLabel,
  useDecisionDialog,
} from "./ui/workflow-ui";
import { campaignPriceIssue } from "@/lib/sales-cart";
import { defaultWorkflowPolicy } from "@/lib/workflow-policy";
type Row = Record<string, any>;
export default function WorkflowConsole({
  data,
  onReload,
  initialProjectId = "",
  initialSection = "assignment",
}: {
  initialProjectId?: string;
  initialSection?: string;
  data: DatabaseView;
  onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState(initialProjectId ? initialSection : "quote");
  const [recommendationOrder, setRecommendationOrder] =
    useState<RecommendationOrder>("balanced");
  const { ask, confirm, dialog } = useDecisionDialog();
  const [failed, setFailed] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<Row>({
    name: "",
    customerId: "",
    productId: null,
    start: today,
    end: today,
    blog: 0,
    clip: 0,
    discount: 0,
    policy: defaultWorkflowPolicy,
    guide:
      "제공 원고와 이미지 순서, 광고 표시를 유지하고 게시 후 링크를 제출해주세요.",
  });
  const [selected, setSelected] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [config, setConfig] = useState<Row | null>(null),
    [offer, setOffer] = useState<Row>({ slotId: "", participantId: "" }),
    [projectId, setProjectId] = useState(initialProjectId),
    [offerBatch, setOfferBatch] = useState<Row[]>([]);
  useEffect(() => {
    void fetch("/api/workflow")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ error: true }));
  }, []);
  const current = data.quote_drafts.find((d) => d.id === selected);
  async function act(body: Row) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const r = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await onReload();
      setMessage(result.url ? location.origin + result.url : "처리 완료");
      return result;
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  const set = (key: string, value: unknown) => {
    setDraft({ ...draft, [key]: value });
    setReviewed(false);
  };
  const participant = data.participants.find(
    (p) => p.id === offer.participantId,
  );
  const slots = data.work_slots.filter(
    (s) => s.projectId === projectId && s.status !== "cancelled",
  );
  const project = data.projects.find((p) => p.id === projectId);
  const recommendations = recommendParticipants(
    data,
    slots.find((s) => s.id === offer.slotId),
    recommendationOrder,
  );
  const recommendation = recommendations.find(
    (r) => r.participant.id === offer.participantId,
  );

  return (
    <div className="workflow-console">
      <header className="pagehead">
        <div>
          <h1>캠페인 운영</h1>
          <p>견적 검토부터 참여 제안·게시·추천 정산·알림까지</p>
        </div>
      </header>
      {message && (
        <Feedback tone={failed ? "error" : "success"}>{message}</Feedback>
      )}
      {data.tasks.some((t) => t.retentionMonitorAlert) && (
        <Feedback>
          <strong>
            게시 유지 확인이 필요한 작업{" "}
            {data.tasks.filter((t) => t.retentionMonitorAlert).length}건
          </strong>
          <p>
            삭제·비공개 의심과 접속 제한을 구분해 표시해요. 게시물을 직접 확인한
            뒤 복구 요청을 진행해주세요.
          </p>
          {data.tasks
            .filter((t) => t.retentionMonitorAlert)
            .map((t) => (
              <p key={t.id}>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setProjectId(String(t.projectId));
                    setTab("review");
                  }}
                >
                  {String(t.name)} 확인
                </Button>
                <span>
                  {" "}
                  {String(t.retentionProbeReason || "수동 확인 필요")}
                </span>
              </p>
            ))}
        </Feedback>
      )}
      <Tabs
        label="캠페인 운영 업무"
        value={tab}
        onChange={setTab}
        items={[
          { id: "quote", label: "견적·일정" },
          { id: "assignment", label: "모집·배정" },
          { id: "review", label: "검수·유지" },
          { id: "participants", label: "참여자·정산" },
          { id: "notifications", label: "알림 이력" },
        ]}
      />
      <section
        className="section"
        hidden={tab !== "quote"}
        aria-label="견적·일정"
      >
        <h2>견적·타임라인 초안</h2>
        <Field>
          저장된 초안{" "}
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const d = data.quote_drafts.find((d) => d.id === e.target.value);
              if (d) setDraft(d);
              setReviewed(false);
            }}
          >
            <option value="">새 견적</option>
            {data.quote_drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {String(d.name)} · {statusLabel(d.status)}
              </option>
            ))}
          </select>
        </Field>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              action: "quote-save",
              data: draft,
              id: selected || undefined,
              version: current?.version,
            }).then((r) => {
              if (r) {
                setSelected(r.id);
                setDraft(r);
                setReviewed(false);
              }
            });
          }}
        >
          <div className="form-grid">
            <Field>
              프로젝트명
              <input
                required
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field>
              고객
              <select
                required
                value={draft.customerId}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    customerId: e.target.value,
                    productId: null,
                  });
                  setReviewed(false);
                }}
              >
                <option value="">고객 선택</option>
                {data.customers
                  .filter((c) => !c.deletedAt)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {String(c.name)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field fullWidth>
              홍보 대상
              <select
                value={draft.productId || ""}
                onChange={(e) => set("productId", e.target.value || null)}
              >
                <option value="">브랜드·업체 홍보</option>
                {data.products
                  .filter(
                    (p) => p.customerId === draft.customerId && !p.deletedAt,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.name)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field>
              첫 게시일
              <input
                required
                type="date"
                value={draft.start}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    start: e.target.value,
                    timeline: undefined,
                  });
                  setReviewed(false);
                }}
              />
            </Field>
            <Field>
              마지막 게시일
              <input
                required
                type="date"
                value={draft.end}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    end: e.target.value,
                    timeline: undefined,
                  });
                  setReviewed(false);
                }}
              />
            </Field>
            {(["blog", "clip"] as const).map((channel) => (
              <div key={channel}>
                <Field>
                  {channel === "blog" ? "블로그" : "클립"} 총수량
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draft[channel]}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        [channel]: Number(e.target.value),
                        timeline: undefined,
                      });
                      setReviewed(false);
                    }}
                  />
                </Field>
                <Field>
                  판매 단가
                  <select
                    value={draft[channel + "PriceId"] || ""}
                    onChange={(e) => set(channel + "PriceId", e.target.value)}
                  >
                    <option value="">단가 선택</option>
                    {data.prices
                      .filter((p) => !campaignPriceIssue(p, channel))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.name)} · {money(p.sale)}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
            ))}
            <Field fullWidth>
              할인액
              <input
                type="number"
                min="0"
                value={draft.discount}
                onChange={(e) => set("discount", Number(e.target.value))}
              />
            </Field>
            {[
              ["preparationDays", "준비·모집 기간(일)"],
              ["offerHours", "제안 유효 시간"],
              ["submissionDays", "자료 전달 후 제출 기한(일)"],
              ["revisionDays", "수정 기한(일)"],
            ].map(([k, label]) => (
              <Field key={k}>
                {label}
                <input
                  type="number"
                  min="1"
                  value={draft.policy[k]}
                  onChange={(e) =>
                    set("policy", {
                      ...draft.policy,
                      [k]: Number(e.target.value),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Field>
            캠페인 가이드
            <textarea
              value={draft.guide}
              onChange={(e) => set("guide", e.target.value)}
            />
          </Field>
          {draft.timeline && (
            <>
              <h3>주차별 게시 계획 수정</h3>
              {draft.timeline.map((w: Row, i: number) => (
                <div className="ui-timeline-row" key={i}>
                  <span>
                    {w.start} ~ {w.end}
                  </span>{" "}
                  {(["blog", "clip"] as const).map((ch) => (
                    <Field key={ch}>
                      {ch === "blog" ? "블로그" : "클립"}
                      <input
                        type="number"
                        min="0"
                        value={w[ch]}
                        onChange={(e) =>
                          set(
                            "timeline",
                            draft.timeline.map((v: Row, j: number) =>
                              j === i
                                ? { ...v, [ch]: Number(e.target.value) }
                                : v,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
              ))}
            </>
          )}
          <Button
            variant="primary"
            busy={busy}
            disabled={current?.status === "confirmed"}
          >
            초안 저장·일정 계산
          </Button>
        </Form>
        {current && (
          <>
            <p>
              {((current.warnings as string[]) || []).join(" ")}
              공급가액 {money(current.supply)} · VAT {money(current.vat)} · 준비
              시작 {String(current.preparationStart)}
            </p>
            <p>
              <a
                target="_blank"
                href={`/api/workflow/documents/${current.id}?type=quote`}
              >
                견적서 PDF 검토
              </a>{" "}
              ·{" "}
              <a
                target="_blank"
                href={`/api/workflow/documents/${current.id}?type=proposal`}
              >
                프로젝트 설명서 PDF 검토
              </a>{" "}
              ·{" "}
              <a href={`/api/workflow/documents/${current.id}?type=xlsx`}>
                견적서 엑셀
              </a>
            </p>
            {current.status !== "confirmed" && (
              <>
                <Field>
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  저장된 견적서·설명서의 금액·총수량·모집 및 게시 일정을
                  검토했습니다.
                </Field>
                <Button
                  variant="primary"
                  busy={busy}
                  disabled={!reviewed}
                  onClick={() =>
                    void act({
                      action: "quote-confirm",
                      id: current.id,
                      version: current.version,
                      reviewed,
                    })
                  }
                >
                  최종 확정·프로젝트 생성
                </Button>
              </>
            )}
          </>
        )}
        <p>
          현재 네이버 블로그·클립을 지원합니다. 다른 플랫폼은 단가·제작·검수
          흐름을 추가한 뒤 활성화합니다.
        </p>
      </section>
      <section
        className="section"
        hidden={!["assignment", "review"].includes(tab)}
        aria-label="모집과 검수"
      >
        <h2>
          {tab === "review" ? "게시 검수·유지 관리" : "참여 제안·자료 전달"}
        </h2>
        <Field>
          프로젝트
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setOffer({ slotId: "", participantId: "" });
            }}
          >
            <option value="">프로젝트 선택</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.name)}
              </option>
            ))}
          </select>
        </Field>
        {!projectId && (
          <EmptyState
            title="프로젝트를 선택해주세요"
            description="배정과 게시 현황을 확인할 프로젝트를 먼저 선택하세요."
          />
        )}
        <div hidden={tab !== "assignment"}>
          {project && (
            <details>
              <summary>캠페인별 기한·가이드 변경</summary>
              <Form
                key={project.id + ":" + project.version}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const policy = {
                    ...defaultWorkflowPolicy,
                    ...(project.workflowPolicy as object),
                  };
                  for (const k of [
                    "offerHours",
                    "submissionDays",
                    "revisionDays",
                  ])
                    policy[
                      k as "offerHours" | "submissionDays" | "revisionDays"
                    ] = Number(f.get(k));
                  void act({
                    action: "campaign-settings",
                    id: project.id,
                    version: project.version,
                    policy,
                    guide: f.get("guide"),
                  });
                }}
              >
                {[
                  ["offerHours", "제안 시간"],
                  ["submissionDays", "제출 일수"],
                  ["revisionDays", "수정 일수"],
                ].map(([k, label]) => (
                  <Field key={k}>
                    {label}
                    <input
                      type="number"
                      min="1"
                      name={k}
                      defaultValue={Number(
                        ((project.workflowPolicy as Row) ||
                          defaultWorkflowPolicy)[k],
                      )}
                    />
                  </Field>
                ))}
                <Field>
                  가이드
                  <textarea
                    name="guide"
                    defaultValue={String(
                      project.guide || project.instructions || "",
                    )}
                  />
                </Field>
                <p>
                  새 제안·자료 전달부터 적용됩니다. 이미 수락한 조건과 전달한
                  가이드 기록은 유지합니다.
                </p>
                <Button variant="primary" busy={busy}>
                  설정 저장
                </Button>
              </Form>
            </details>
          )}
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "offer", data: offer });
            }}
          >
            <Field>
              작업
              <select
                required
                value={offer.slotId}
                onChange={(e) =>
                  setOffer({ slotId: e.target.value, participantId: "" })
                }
              >
                <option value="">미배정 작업 선택</option>
                {slots
                  .filter((s) => !s.participantId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.name)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field help="종합: 품질 40% · 제출 속도 25% · 참여 기간 15% · 완료량 20%. 미제출 기한 초과는 감점하며 신규 참여자는 중립 점수로 시작합니다.">
              추천 기준
              <select
                value={recommendationOrder}
                onChange={(e) =>
                  setRecommendationOrder(e.target.value as RecommendationOrder)
                }
              >
                <option value="balanced">종합 추천</option>
                <option value="quality">일 잘하는 순</option>
                <option value="speed">빨리 제출하는 순</option>
                <option value="tenure">오래 참여한 순</option>
                <option value="volume">많이 완료한 순</option>
              </select>
            </Field>
            <Field>
              참여자
              <select
                required
                value={offer.participantId}
                onChange={(e) =>
                  setOffer({
                    slotId: offer.slotId,
                    participantId: e.target.value,
                  })
                }
              >
                <option value="">참여자 선택</option>
                {recommendations.map((r, index) => (
                  <option key={r.participant.id} value={r.participant.id}>
                    {index + 1}위 · {String(r.participant.name)} ·{" "}
                    {r.score.toFixed(1)}점 · 완료 {r.completed}건
                  </option>
                ))}
              </select>
            </Field>
            {!recommendations.length && (
              <EmptyState
                title="제안 가능한 참여자가 없어요"
                description="활동 상태, 승인 계정, 소유·관리 권한 확인과 기존 배정·제안을 확인해주세요."
              />
            )}
            {recommendation && (
              <Feedback>
                {`추천 ${recommendation.score.toFixed(1)}점 · 품질 ${recommendation.quality?.toFixed(1) ?? "미평가"} (${recommendation.samples}건) · 평균 제출 ${recommendation.hours === null ? "기록 없음" : recommendation.hours.toFixed(1) + "시간"} · 참여 ${recommendation.days}일 · 완료 ${recommendation.completed}건 · 기한 초과 미제출 ${recommendation.overdue}건`}
              </Feedback>
            )}
            {["blog", "clip"].map((ch) => (
              <Field key={ch}>
                {ch === "blog" ? "블로그" : "클립"} 계정
                <select
                  value={offer[ch + "AccountId"] || ""}
                  onChange={(e) =>
                    setOffer({
                      ...offer,
                      [ch + "AccountId"]: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">계정 선택</option>
                  {((participant?.accounts as Row[]) || [])
                    .filter(
                      (a) =>
                        a.approvalStatus !== "pending" &&
                        a.approvalStatus !== "rejected" &&
                        (a.channel === ch ||
                          (ch === "clip" && a.channel === "blog")),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label || a.url}
                      </option>
                    ))}
                </select>
              </Field>
            ))}
            <Button variant="primary" busy={busy}>
              제안 등록
            </Button>
            <Button
              type="button"
              disabled={busy || !offer.slotId || !offer.participantId}
              onClick={async () => {
                setOfferBatch([...offerBatch, { ...offer }]);
                setOffer({ slotId: "", participantId: "" });
              }}
            >
              일괄 제안 목록에 추가
            </Button>
          </Form>
          {offerBatch.map((o, i) => (
            <p key={i}>
              {String(data.work_slots.find((s) => s.id === o.slotId)?.name)} →{" "}
              {String(
                data.participants.find((p) => p.id === o.participantId)?.name,
              )}{" "}
              <Button
                onClick={() =>
                  setOfferBatch(offerBatch.filter((_, j) => j !== i))
                }
              >
                목록에서 제거
              </Button>
            </p>
          ))}
          {offerBatch.length > 0 && (
            <Button
              disabled={busy}
              onClick={() =>
                void act({ action: "offer-batch", items: offerBatch }).then(
                  (r) => {
                    if (r) setOfferBatch([]);
                  },
                )
              }
            >
              선택한 {offerBatch.length}건 일괄 제안
            </Button>
          )}
          <p>
            제안 생성 시 모집 알림에 동의한 참여자에게 브랜드 메시지를 준비해요.
            현재 원케이션 채널 친구에게만 발송되며, 한국 시간 08:00~20:50에
            처리해요. 채널 친구가 아닌 참여자에게는 접속 링크를 직접
            공유해주세요.
          </p>
          {slots.map((s) => (
            <div key={s.id} className="ui-list-row">
              <strong>{String(s.name)}</strong> ·{" "}
              {String(s.participantName || "미배정")}{" "}
              {s.type === "bundle" && !s.participantId && (
                <Button
                  disabled={busy}
                  onClick={() => void act({ action: "split", id: s.id })}
                >
                  개별 전환
                </Button>
              )}
              {!!s.participantId && (
                <Button
                  disabled={busy}
                  onClick={() => void act({ action: "release", id: s.id })}
                >
                  내부 승인본 전달·알림 준비
                </Button>
              )}
            </div>
          ))}
          <h3>개별 작업 합치기</h3>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act({
                action: "merge",
                blogSlotId: f.get("blog"),
                clipSlotId: f.get("clip"),
              });
            }}
          >
            {["blog", "clip"].map((ch) => (
              <Field key={ch}>
                {ch === "blog" ? "블로그" : "클립"}
                <select name={ch} required>
                  <option value="">작업 선택</option>
                  {slots
                    .filter((s) => s.type === ch && s.payoutStatus !== "paid")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {String(s.name)} ·{" "}
                        {String(s.participantName || "미배정")}
                      </option>
                    ))}
                </select>
              </Field>
            ))}
            <Button disabled={busy}>묶음 전환·새 조건 제안 준비</Button>
          </Form>
          <h3>제안 현황</h3>
          {projectId &&
            !data.work_offers.some((o) => o.projectId === projectId) && (
              <EmptyState
                title="아직 보낸 제안이 없습니다"
                description="작업과 참여자를 선택해 첫 제안을 등록해주세요."
              />
            )}
          {data.work_offers
            .filter((o) => o.projectId === projectId)
            .map((o) => (
              <p key={o.id}>
                {String(o.name)} ·{" "}
                <StatusBadge
                  value={
                    o.status === "proposed" &&
                    Date.parse(String(o.expiresAt)) <= Date.now()
                      ? "expired"
                      : o.status
                  }
                />{" "}
                · {new Date(String(o.expiresAt)).toLocaleString("ko-KR")}
              </p>
            ))}
        </div>
        <div hidden={tab !== "review"}>
          <h3>부분 완료 지급·재모집</h3>
          {slots
            .filter(
              (s) =>
                s.type === "bundle" &&
                s.participantId &&
                s.payoutStatus !== "paid",
            )
            .map((s) => (
              <div key={s.id}>
                {String(s.name)}
                {data.tasks
                  .filter(
                    (t) =>
                      t.workSlotId === s.id &&
                      t.status === "verified" &&
                      t.payoutStatus !== "paid",
                  )
                  .map((t) => (
                    <Button
                      key={t.id}
                      disabled={
                        busy ||
                        ((s.partialPaidTaskIds as string[]) || []).length > 0
                      }
                      onClick={async () => {
                        if (
                          await confirm(
                            "개별 원고료를 실제 송금했나요? 부분 지급으로 기록합니다.",
                          )
                        )
                          void act({
                            action: "partial-pay",
                            id: s.id,
                            taskId: t.id,
                          });
                      }}
                    >
                      {t.channel === "blog" ? "블로그" : "클립"} 개별 부분 지급
                      기록
                    </Button>
                  ))}
                {((s.partialPaidTaskIds as string[]) || []).length > 0 && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm(
                          "부분 지급 기록을 취소할까요? 실제 송금은 취소되지 않습니다.",
                        )
                      )
                        void act({ action: "partial-pay-cancel", id: s.id });
                    }}
                  >
                    부분 지급 기록 취소
                  </Button>
                )}
                {((s.partialPaidTaskIds as string[]) || []).length > 0 && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm(
                          "미완료 작업 배정을 종료하고 재모집할까요?",
                        )
                      )
                        void act({ action: "partial-recruit", id: s.id });
                    }}
                  >
                    미완료 작업 재모집
                  </Button>
                )}
              </div>
            ))}
          <h3>기한 초과 작업</h3>
          {data.tasks
            .filter((t) => t.projectId === projectId && taskOverdue(t))
            .map((t) => (
              <Feedback key={t.id} tone="error">
                {String(t.name)} ·{" "}
                {String(
                  data.participants.find((p) => p.id === t.participantId)
                    ?.name || "참여자",
                )}{" "}
                · {t.revisionNotes ? "수정" : "제출"} 기한{" "}
                {new Date(taskDeadline(t)!).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </Feedback>
            ))}
          <h3>검수·유지 관리</h3>
          <p>
            자동 확인{" "}
            {config?.retention?.enabled
              ? "켜짐 · 공개 게시물은 하루 1회, 이상 징후는 6시간 뒤 재확인"
              : "꺼짐"}{" "}
            · 관리자 카톡{" "}
            {config?.retention?.admin?.enabled &&
            config?.retention?.admin?.configured
              ? "설정됨 · 승인 템플릿으로 발송"
              : "설정·템플릿 승인 필요"}
          </p>
          {data.events
            .filter((e) => e.type === "retention-monitor-health")
            .map((e) => (
              <p key={e.id}>
                최근 실행{" "}
                {e.lastCompletedAt
                  ? new Date(String(e.lastCompletedAt)).toLocaleString("ko-KR")
                  : "기록 없음"}{" "}
                · 확인 {Number(e.checked || 0)}건{" "}
                {!!e.error && <span> · 오류: {String(e.error)}</span>}
                {e.lastCompletedAt &&
                Date.parse(String(e.lastCompletedAt)) < Date.now() - 3600000
                  ? " · 1시간 이상 실행 기록 없음, 스케줄러 확인 필요"
                  : ""}
              </p>
            ))}
          <Button
            disabled={busy || !config?.retention?.enabled}
            onClick={() => void act({ action: "retention-monitor-tick" })}
          >
            자동 확인 실행
          </Button>
          {projectId &&
            !data.tasks.some(
              (t) =>
                t.projectId === projectId &&
                ["submitted", "verified"].includes(String(t.status)),
            ) && (
              <EmptyState
                title="검수할 게시물이 없습니다"
                description="참여자가 링크를 제출하면 이곳에서 확인할 수 있어요."
              />
            )}
          {data.tasks
            .filter(
              (t) =>
                t.projectId === projectId &&
                ["submitted", "verified"].includes(String(t.status)),
            )
            .map((t) => (
              <div key={t.id}>
                <p>
                  {String(t.name)} ·{" "}
                  <a href={String(t.link)} target="_blank" rel="noreferrer">
                    게시물 확인
                  </a>{" "}
                  · <StatusBadge value={t.status} />
                </p>
                {t.status === "submitted" && (
                  <>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setFailed(false);
                        setMessage("");
                        try {
                          const r = await fetch("/api/data", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              action: "publication",
                              key: crypto.randomUUID(),
                              data: {
                                id: t.id,
                                version: t.version,
                                link: t.link,
                                verified: true,
                              },
                            }),
                          });
                          const d = await r.json();
                          if (!r.ok) throw new Error(d.error);
                          await onReload();
                          setMessage("게시물 검수 승인을 완료했어요.");
                        } catch (e) {
                          setFailed(true);
                          setMessage(e instanceof Error ? e.message : "실패");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      3일 경과 검수 승인
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        const answer = await ask({
                          title: "게시물 수정 요청",
                          description:
                            "수정 내용과 검수 대기 기간을 참여자에게 안내합니다.",
                          inputLabel: "수정할 내용",
                          checkboxLabel:
                            "게시물 교체 등 주요 수정 · 제출 후 3일 재계산",
                          confirmLabel: "수정 요청 보내기",
                        });
                        if (answer)
                          void act({
                            action: "revision",
                            id: t.id,
                            note: answer.value,
                            major: answer.checked,
                          });
                      }}
                    >
                      수정 요청
                    </Button>
                  </>
                )}
                {!!t.retentionUntil && (
                  <>
                    <span>
                      {" "}
                      유지 종료{" "}
                      {new Date(String(t.retentionUntil)).toLocaleDateString(
                        "ko-KR",
                      )}
                    </span>
                    {!!t.retentionProbedAt && (
                      <p>
                        자동 확인:{" "}
                        {t.retentionProbeState === "public"
                          ? "공개 확인"
                          : t.retentionProbeState === "missing"
                            ? "삭제·비공개 의심"
                            : "수동 확인 필요"}{" "}
                        · {String(t.retentionProbeReason)} ·{" "}
                        {new Date(String(t.retentionProbedAt)).toLocaleString(
                          "ko-KR",
                        )}{" "}
                        {!!t.retentionNextProbeAt && (
                          <span>
                            {" "}
                            · 다음 확인{" "}
                            {new Date(
                              String(t.retentionNextProbeAt),
                            ).toLocaleString("ko-KR")}
                          </span>
                        )}
                      </p>
                    )}
                    <p>
                      유지 상태:{" "}
                      {t.retentionStatus === "needs_recovery"
                        ? "복구 요청 중"
                        : t.retentionStatus === "recovery_submitted"
                          ? "복구 완료 접수 · 재확인 필요"
                          : t.retentionStatus === "public"
                            ? "공개 확인"
                            : "확인 대기"}
                      {!!t.retentionNote && (
                        <span> · {String(t.retentionNote)}</span>
                      )}
                      {!!t.retentionCheckedAt && (
                        <span>
                          {" "}
                          · 최근 확인{" "}
                          {new Date(
                            String(t.retentionCheckedAt),
                          ).toLocaleString("ko-KR")}
                        </span>
                      )}
                      {!!t.retentionRecoveryDue &&
                        ["needs_recovery", "recovery_submitted"].includes(
                          String(t.retentionStatus),
                        ) && (
                          <span>
                            {" "}
                            · 복구 기한{" "}
                            {new Date(
                              String(t.retentionRecoveryDue),
                            ).toLocaleString("ko-KR")}
                            {t.retentionStatus === "needs_recovery" &&
                            Date.parse(String(t.retentionRecoveryDue)) <
                              Date.now()
                              ? " · 기한 초과"
                              : ""}
                          </span>
                        )}
                    </p>
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await confirm(
                            "게시 링크를 열어 콘텐츠가 공개되어 있는지 확인했나요?",
                          )
                        )
                          void act({
                            action: "retention-check",
                            id: t.id,
                            version: t.version,
                            ok: true,
                          });
                      }}
                    >
                      공개 유지 확인
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        const answer = await ask({
                          title: "게시물 복구 요청",
                          description:
                            "기존 게시물을 공개 상태로 복구하도록 안내합니다. 지급 기록과 유지 종료일은 그대로 유지됩니다.",
                          inputLabel: "확인 결과와 복구할 내용",
                          confirmLabel: "복구 요청 보내기",
                        });
                        if (answer)
                          void act({
                            action: "retention-check",
                            id: t.id,
                            version: t.version,
                            ok: false,
                            note: answer.value,
                          });
                      }}
                    >
                      복구 요청
                    </Button>
                  </>
                )}
              </div>
            ))}
        </div>
      </section>
      <section
        className="section"
        hidden={tab !== "participants"}
        aria-label="참여자·정산"
      >
        <h2>참여자 접속·추천 정산</h2>
        {!data.participants.length && (
          <EmptyState
            title="등록된 참여자가 없습니다"
            description="체험단 관리에서 참여자를 등록하거나 신청을 승인해주세요."
          />
        )}
        {data.participants.map((p) => {
          const available = data.referral_credits
            .filter((c) => c.participantId === p.id && c.status === "available")
            .reduce((n, c) => n + Number(c.amount), 0);
          return (
            <div key={p.id} className="ui-list-row">
              <strong>{String(p.name)}</strong>
              {((p.accounts as Row[]) || []).map((a) => (
                <span key={a.id}>
                  {" "}
                  · {a.label || a.channel}{" "}
                  {a.ownershipVerifiedAt ? (
                    "권한 확인됨"
                  ) : (
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        const answer = await ask({
                          title: "계정 소유·관리 권한 확인",
                          description:
                            "프로필의 임시 확인 문구 등을 직접 확인한 뒤 근거를 남겨주세요.",
                          inputLabel: "확인 URL·시각·방법",
                          confirmLabel: "확인 기록 저장",
                        });
                        const evidence = answer?.value;
                        if (evidence)
                          void act({
                            action: "ownership-confirm",
                            id: p.id,
                            accountId: a.id,
                            evidence,
                          });
                      }}
                    >
                      소유·관리 권한 확인 기록
                    </Button>
                  )}
                </span>
              ))}{" "}
              · 코드 {String(p.referralCode || "미발급")} · 추천료{" "}
              {money(available)}{" "}
              <Button
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm(
                      "새 접속 링크를 발급하면 기존 링크와 접속 세션이 만료됩니다. 새로 발급할까요?",
                    )
                  )
                    void act({ action: "portal-issue", id: p.id });
                }}
              >
                접속 링크 발급·기존 링크 만료
              </Button>
              {available > 0 && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        "추천료를 실제 송금했나요? 지급 완료로 기록합니다.",
                      )
                    )
                      void act({ action: "referral-pay", id: p.id });
                  }}
                >
                  추천료 지급 완료 기록
                </Button>
              )}
            </div>
          );
        })}
      </section>
      <section
        className="section"
        hidden={tab !== "notifications"}
        aria-label="알림 이력"
      >
        <h2>원케이션 카카오톡 알림</h2>
        <p>
          {config?.error
            ? "알림 설정을 불러오지 못했습니다."
            : !config
              ? "알림 설정 확인 중…"
              : `알림 설정 ${config.sens?.configured ? "완료" : "필요"}`}{" "}
          · 발송 {config?.sens?.enabled ? "활성" : "비활성"} · 문자 대체 사용 안
          함
        </p>
        <p>
          모집 브랜드 메시지 ·{" "}
          {config?.recruitment?.enabled ? "활성" : "비활성"} · 수신 동의자 중
          채널 친구에게 발송 · 야간 발송은 다음 날 대기
        </p>
        <Button
          disabled={busy || !config?.recruitment?.enabled}
          onClick={async () => {
            if (
              await confirm(
                "등록된 본인 테스트 번호로 모집 브랜드 메시지 1건을 보내요. 원케이션 채널 친구이며 테스트 광고 수신에 동의하시나요?",
              )
            )
              void act({ action: "recruitment-test", consent: true });
          }}
        >
          본인 번호로 모집 알림 테스트
        </Button>
        <Button
          disabled={busy}
          onClick={() => void act({ action: "notification-tick" })}
        >
          기한 알림 준비·대기 발송 처리
        </Button>
        {!data.notification_outbox.length && (
          <EmptyState
            title="아직 발송 이력이 없습니다"
            description="자료 전달과 수정 요청 등의 업무 알림이 여기에 쌓입니다."
          />
        )}
        {data.notification_outbox.map((n) => (
          <details key={n.id}>
            <summary>
              {n.setupTest ? "검수 확인·본인 테스트 · " : ""}
              {{
                materials: "자료 전달",
                revision: "수정 요청",
                payment: "지급 완료",
                reminder: "기한 안내",
                retention: "유지 확인",
                retention_admin: "관리자 게시 유지 알림",
                recruitment: "모집 제안 · 브랜드 메시지",
              }[String(n.type)] || String(n.type)}{" "}
              · {String(n.to || "관리자 번호 설정")} ·{" "}
              <StatusBadge context="notification" value={n.status} />
            </summary>
            <p style={{ whiteSpace: "pre-wrap" }}>{String(n.content)}</p>
            {!!n.setupTest && (
              <div>
                <p className="hint">
                  10분 주기로 확인하며 5종 승인·문구·버튼 일치 시 테스트 1건만
                  발송해요. 일반 자동 발송 설정은 변경하지 않아요.
                </p>
                {((n.templateStates || []) as Row[]).map((t) => (
                  <p key={t.code}>
                    {t.code} ·{" "}
                    {(
                      {
                        ACCEPT: "접수",
                        REGISTER: "대기",
                        INSPECT: "처리 중",
                        COMPLETE: "승인",
                        REJECT: "반려",
                        MISSING: "확인 필요",
                      } as Row
                    )[t.inspection] || t.inspection}
                  </p>
                ))}
                {!!n.lastCheckedAt && (
                  <p className="hint">
                    최근 확인{" "}
                    {new Date(String(n.lastCheckedAt)).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                )}
                {!!n.error && (
                  <Feedback tone="error">{String(n.error)}</Feedback>
                )}
              </div>
            )}
            {!n.setupTest && !!n.error && (
              <Feedback tone="error">{String(n.error)}</Feedback>
            )}
            {!n.setupTest &&
              n.type !== "retention_admin" &&
              ["queued", "failed"].includes(String(n.status)) && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    void act({ action: "notification-send", id: n.id })
                  }
                >
                  확인 후 발송·재시도
                </Button>
              )}
            {!!n.messageId && (
              <Button
                disabled={busy}
                onClick={() =>
                  void act({ action: "notification-refresh", id: n.id })
                }
              >
                발송 결과 조회
              </Button>
            )}
            {n.status === "uncertain" && (
              <p>
                수신 여부 불명확. SENS 콘솔에서 확인 후 처리하세요. 중복 방지를
                위해 자동 재발송하지 않습니다.
              </p>
            )}
          </details>
        ))}
      </section>
      {dialog}
    </div>
  );
}
