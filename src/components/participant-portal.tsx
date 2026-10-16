"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Field,
  Form,
  Feedback,
  EmptyState,
  Tabs,
  StatusBadge,
  useDecisionDialog,
} from "./ui/workflow-ui";
type Row = Record<string, any>;
const date = (v: string) =>
  new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export default function ParticipantPortal() {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<string[]>([]),
    [tab, setTab] = useState("offers"),
    [notice, setNotice] = useState("");
  const { ask, dialog } = useDecisionDialog();
  async function load() {
    const r = await fetch("/api/participant-portal");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  async function act(body: Row) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/participant-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setNotice(
        body.action === "submit"
          ? "게시물 링크를 제출했어요. 검수 가능일을 확인해주세요."
          : body.action === "respond"
            ? body.accept
              ? "제안을 수락했어요. 자료가 준비되면 안내해드릴게요."
              : "제안을 거절했어요."
            : "변경 내용을 저장했어요.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "처리하지 못했어요. 다시 시도해주세요.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    async function init() {
      const url = new URL(location.href),
        access = url.searchParams.get("access");
      if (access) {
        history.replaceState(null, "", url.pathname);
        const r = await fetch("/api/participant-portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", access }),
        });
        if (!r.ok)
          throw new Error(
            "접속 링크가 만료되었거나 유효하지 않아요. 담당자에게 새 링크를 요청해주세요.",
          );
      }
      await load();
    }
    void init()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const availableOffers =
    data?.offers.filter(
      (o: Row) =>
        o.status === "proposed" && new Date(o.expiresAt).getTime() > Date.now(),
    ) || [];
  return (
    <main className="participant-portal">
      <header className="pagehead">
        <div>
          <span className="ui-eyebrow">원케이션</span>
          <h1>나의 작업</h1>
          <p>
            {data
              ? `${data.participant.name}님, 진행할 작업을 확인해주세요.`
              : "참여 제안부터 게시·정산까지 확인하세요."}
          </p>
        </div>
        <Link className="ui-text-link" href="/participants/guide">
          참여 가이드
        </Link>
      </header>
      {error && <Feedback tone="error">{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {loading ? (
        <div className="ui-loading" role="status" aria-label="작업 불러오는 중">
          <span />
          <span />
          <span />
          <p>내 작업을 불러오고 있어요.</p>
        </div>
      ) : !data ? (
        <EmptyState
          title="접속 링크를 확인해주세요"
          description="담당자에게 받은 접속 링크로 들어오면 나의 작업을 볼 수 있어요."
        />
      ) : (
        <>
          <div className="portal-summary" aria-label="내 작업 요약">
            <div>
              <span>수락 대기</span>
              <strong>
                {availableOffers.length}
                <small>건</small>
              </strong>
            </div>
            <div>
              <span>게시할 작업</span>
              <strong>
                {data.tasks.filter((t: Row) => t.status === "delivered").length}
                <small>건</small>
              </strong>
            </div>
            <div>
              <span>검수 대기</span>
              <strong>
                {data.tasks.filter((t: Row) => t.status === "submitted").length}
                <small>건</small>
              </strong>
            </div>
          </div>
          <Tabs
            label="나의 작업 메뉴"
            value={tab}
            onChange={setTab}
            items={[
              {
                id: "offers",
                label: "참여 제안",
                count: availableOffers.length,
              },
              { id: "tasks", label: "게시 작업", count: data.tasks.length },
              { id: "availability", label: "참여 설정" },
              { id: "payments", label: "정산·추천" },
            ]}
          />
          <section
            className="ui-pane"
            hidden={tab !== "offers"}
            aria-label="참여 제안"
          >
            <div className="section-title">
              <div>
                <h2>받은 제안</h2>
                <p className="hint">
                  원고료·게시 계정·기한을 확인하고 수락해주세요.
                </p>
              </div>
              {availableOffers.length > 0 && (
                <Button
                  variant="primary"
                  disabled={!selected.length}
                  busy={busy}
                  onClick={async () => {
                    if (await act({ action: "batch-respond", ids: selected }))
                      setSelected([]);
                  }}
                >
                  선택한 제안 수락 ({selected.length})
                </Button>
              )}
            </div>
            {!data.offers.length && (
              <EmptyState
                title="아직 받은 제안이 없어요"
                description="새 제안을 받으면 이곳에서 조건을 확인할 수 있어요."
              />
            )}
            {data.offers.map((o: Row) => (
              <article className="ui-work-item" key={o.id}>
                <div className="ui-item-heading">
                  <h3>
                    {o.status === "proposed" &&
                      new Date(o.expiresAt).getTime() > Date.now() && (
                        <input
                          type="checkbox"
                          className="ui-inline-check"
                          aria-label={o.name + " 선택"}
                          checked={selected.includes(o.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, o.id]
                                : selected.filter((id) => id !== o.id),
                            )
                          }
                        />
                      )}{" "}
                    {o.name}
                  </h3>
                  <StatusBadge
                    value={
                      o.status === "proposed" &&
                      new Date(o.expiresAt).getTime() <= Date.now()
                        ? "expired"
                        : o.status
                    }
                  />
                </div>
                <p className="ui-reward">
                  {Number(o.amount).toLocaleString()}
                  <span>원</span>
                </p>
                <p className="ui-account-url">{o.accountUrls?.join(" / ")}</p>
                <dl className="ui-details">
                  <div>
                    <dt>제안 만료</dt>
                    <dd>{date(o.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt>제출 기한</dt>
                    <dd>자료 전달 후 {o.policy?.submissionDays || 7}일 이내</dd>
                  </div>
                  <div>
                    <dt>마지막 게시일</dt>
                    <dd>{o.lastPostingDate}</dd>
                  </div>
                  <div>
                    <dt>게시 유지</dt>
                    <dd>검수 승인일부터 90일</dd>
                  </div>
                </dl>
                <details>
                  <summary>참여 가이드 · v{o.guideVersion || 1}</summary>
                  <p className="ui-prewrap">{o.guide}</p>
                </details>
                {o.status === "proposed" &&
                  new Date(o.expiresAt).getTime() > Date.now() && (
                    <div className="ui-actions">
                      <Button
                        variant="primary"
                        busy={busy}
                        onClick={() =>
                          void act({
                            action: "respond",
                            id: o.id,
                            accept: true,
                          })
                        }
                      >
                        조건 확인 · 수락
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: "respond",
                            id: o.id,
                            accept: false,
                          })
                        }
                      >
                        거절
                      </Button>
                    </div>
                  )}
              </article>
            ))}
            {!!data.upgrades.length && (
              <>
                <h2>클립도 함께 참여해보세요</h2>
                {data.upgrades.map((u: Row) => (
                  <Form
                    className="ui-work-item"
                    key={u.blogSlotId}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const clipAccountId = new FormData(e.currentTarget).get(
                        "clipAccountId",
                      );
                      const answer = await ask({
                        title: "묶음으로 참여할까요?",
                        description: `클립을 추가하면 원고료는 총 ${Number(u.amount).toLocaleString()}원이에요. 두 작업을 모두 완료하면 묶음 보상이 적용돼요.`,
                        confirmLabel: "묶음으로 참여",
                      });
                      if (answer)
                        void act({ action: "upgrade", ...u, clipAccountId });
                    }}
                  >
                    <p>
                      블로그와 클립을 함께 올리면 총{" "}
                      <strong>{Number(u.amount).toLocaleString()}원</strong>
                    </p>
                    <Field>
                      클립 게시 계정
                      <select name="clipAccountId" required>
                        <option value="">계정 선택</option>
                        {data.participant.accounts
                          .filter(
                            (a: Row) =>
                              ["blog", "clip"].includes(a.channel) &&
                              a.ownershipVerifiedAt &&
                              a.approvalStatus === "approved",
                          )
                          .map((a: Row) => (
                            <option key={a.id} value={a.id}>
                              {a.label || a.url}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Button variant="primary" busy={busy}>
                      묶음 조건 확인
                    </Button>
                  </Form>
                ))}
              </>
            )}
          </section>
          <section
            className="ui-pane"
            hidden={tab !== "tasks"}
            aria-label="게시 작업"
          >
            <div className="section-title">
              <div>
                <h2>나의 게시 작업</h2>
                <p className="hint">
                  제출 후 3일 뒤 검수하며, 승인일부터 90일 동안 게시물을
                  유지해주세요.
                </p>
              </div>
            </div>
            {!data.tasks.length && (
              <EmptyState
                title="아직 배정된 작업이 없어요"
                description="참여 제안을 수락하면 작업이 여기에 표시돼요."
              />
            )}
            {data.tasks.map((t: Row) => {
              const p = data.projects.find((p: Row) => p.id === t.projectId);
              return (
                <article className="ui-work-item" key={t.id}>
                  <div className="ui-item-heading">
                    <div>
                      <p className="hint">{p?.name}</p>
                      <h3>{t.name}</h3>
                    </div>
                    <StatusBadge value={t.status} />
                  </div>
                  <p className="ui-account-url">{t.account?.url}</p>
                  <dl className="ui-details">
                    {t.scheduledFrom && (
                      <div>
                        <dt>게시 예정 기간</dt>
                        <dd>
                          {t.scheduledFrom} ~ {t.scheduledUntil}
                        </dd>
                      </div>
                    )}
                    {t.submissionDue && (
                      <div>
                        <dt>제출 기한</dt>
                        <dd>{date(t.submissionDue)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>지급 상태</dt>
                      <dd>
                        {t.payoutStatus === "paid" ? "지급 완료" : "지급 전"}
                      </dd>
                    </div>
                    {t.reviewEligibleAt && (
                      <div>
                        <dt>검수 가능일</dt>
                        <dd>{date(t.reviewEligibleAt)}</dd>
                      </div>
                    )}
                    {t.retentionUntil && (
                      <div>
                        <dt>게시 유지 종료</dt>
                        <dd>
                          {new Date(t.retentionUntil).toLocaleDateString(
                            "ko-KR",
                            { timeZone: "Asia/Seoul" },
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <details>
                    <summary>
                      캠페인 가이드 · v
                      {t.guideSnapshot?.version || p?.guideVersion}
                    </summary>
                    <p className="ui-prewrap">
                      {t.guideSnapshot?.text || p?.guide}
                    </p>
                  </details>
                  {t.revisionNotes && (
                    <Feedback>
                      <strong>수정 요청</strong>
                      <p>{t.revisionNotes}</p>
                      <span>수정 기한 {date(t.revisionDue)}</span>
                    </Feedback>
                  )}
                  {t.files.map((f: Row) => (
                    <div className="ui-file" key={f.id}>
                      {f.category === "copy" ? (
                        <details>
                          <summary>{f.name}</summary>
                          <pre className="ui-prewrap">{f.text}</pre>
                        </details>
                      ) : (
                        <a href={"/api/participant-portal/files/" + f.id}>
                          {f.name} 다운로드
                        </a>
                      )}
                    </div>
                  ))}
                  {["delivered", "submitted"].includes(t.status) && (
                    <Form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act({
                          action: "submit",
                          id: t.id,
                          link: new FormData(e.currentTarget).get("link"),
                        });
                      }}
                    >
                      <Field help="배정된 계정에 게시한 글 또는 클립의 주소를 입력해주세요.">
                        게시물 링크
                        <input
                          required
                          type="url"
                          name="link"
                          defaultValue={t.link}
                          placeholder="https://"
                        />
                      </Field>
                      <Button variant="primary" busy={busy}>
                        링크 제출
                      </Button>
                    </Form>
                  )}
                </article>
              );
            })}
          </section>
          <section
            className="ui-pane"
            hidden={tab !== "availability"}
            aria-label="참여 설정"
          >
            <h2>참여 가능한 수량</h2>
            <p className="hint">
              계정별 가능 수량을 알려주시면 다음 작업을 제안할 때 참고해요.
            </p>
            <Form
              className="ui-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act({
                  action: "availability",
                  items: data.participant.accounts.map((a: Row) => ({
                    accountId: a.id,
                    quantity: Number(f.get(a.id) || 0),
                    until: new Date(
                      String(f.get("until")) + "T23:59:59+09:00",
                    ).toISOString(),
                  })),
                });
              }}
            >
              {data.participant.accounts.map((a: Row) => (
                <Field key={a.id} help={a.label ? a.url : undefined}>
                  {a.label || a.url}
                  <input
                    name={a.id}
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={
                      data.participant.availability?.find(
                        (v: Row) => v.accountId === a.id,
                      )?.quantity || 0
                    }
                  />
                </Field>
              ))}
              <Field>
                참여 가능한 마지막 날짜
                <input type="date" required name="until" />
              </Field>
              <Button variant="primary" busy={busy}>
                참여 가능 수량 저장
              </Button>
            </Form>
            <div className="ui-divider" />
            <h2>모집 알림 설정</h2>
            <Field
              className="portal-consent"
              help="현재 작업의 진행 안내와 별도이며 언제든 철회할 수 있어요."
            >
              <input
                disabled={busy}
                type="checkbox"
                checked={data.participant.kakaoMarketingConsent === true}
                onChange={(e) =>
                  void act({
                    action: "marketing-consent",
                    consent: e.target.checked,
                  })
                }
              />
              카카오톡 신규 모집 광고 수신 동의 (선택)
            </Field>
          </section>
          <section
            className="ui-pane"
            hidden={tab !== "payments"}
            aria-label="정산·추천"
          >
            <h2>추천 보상</h2>
            <div className="ui-amounts">
              <div>
                <span>지급 가능</span>
                <strong>{data.referral.available.toLocaleString()}원</strong>
              </div>
              <div>
                <span>지급 완료</span>
                <strong>{data.referral.paid.toLocaleString()}원</strong>
              </div>
            </div>
            {data.participant.referralCode && (
              <div className="portal-referral">
                <Field help="링크로 가입하면 추천 코드가 자동으로 적용돼요.">
                  내 추천 링크
                  <input
                    readOnly
                    value={
                      typeof location !== "undefined"
                        ? location.origin +
                          "/participants/apply?ref=" +
                          data.participant.referralCode
                        : ""
                    }
                    onFocus={(e) => e.target.select()}
                  />
                </Field>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        location.origin +
                          "/participants/apply?ref=" +
                          data.participant.referralCode,
                      );
                      setNotice("추천 링크를 복사했어요.");
                    } catch {
                      setError("주소를 선택해 직접 복사해주세요.");
                    }
                  }}
                >
                  추천 링크 복사
                </Button>
              </div>
            )}
            <div className="ui-divider" />
            <h2>지급 내역</h2>
            {!data.settlements.length && (
              <EmptyState
                title="아직 지급 내역이 없어요"
                description="지급이 완료되면 날짜와 금액을 여기서 확인할 수 있어요."
              />
            )}
            {data.settlements.map((s: Row) => (
              <div className="ui-list-row ui-item-heading" key={s.id}>
                <div>
                  <p>
                    {new Date(s.paidAt).toLocaleDateString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                  <strong>{Number(s.total).toLocaleString()}원</strong>
                </div>
                <StatusBadge value={s.status} />
              </div>
            ))}
          </section>
        </>
      )}
      {dialog}
    </main>
  );
}
