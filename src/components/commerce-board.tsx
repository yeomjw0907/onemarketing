"use client";
import AdvertiserProducts from "./advertiser-products";
import OperationQueue from "./operation-queue";
import CampaignPresentationFields from "./campaign-presentation-fields";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { marketFetch } from "./market-public";
import PublicShell from "./public-shell";
import { appStates, campaignStates, money } from "@/lib/commerce-policy";
import s from "./platform.module.css";
type Row = Record<string, any>;
const formatDate = (v: string) =>
  v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
export function CommerceBoard({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("overview"),
    [appFilter, setAppFilter] = useState("all"),
    [appQuery, setAppQuery] = useState("");
  const load = useCallback(async () => {
    setData(await marketFetch("/api/commerce" + (admin ? "?role=admin" : "")));
  }, [admin]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function act(body: Row) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await marketFetch("/api/commerce", {
        ...body,
        ...(admin ? { role: "admin" } : {}),
      });
      await load();
      setNotice("처리 내역을 저장했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function operation(c: Row, action: string, extra: Row = {}) {
    return act({
      action: "campaign",
      data: { campaignId: c.id, version: c.version, action, ...extra },
    });
  }
  const openQueue = (item: {
    campaignId?: string;
    orderId?: string;
    kind: string;
  }) => {
    setAppFilter(
      item.kind === "review"
        ? "submitted"
        : item.kind === "selection"
          ? "applied"
          : "all",
    );
    setAppQuery("");
    setTab(item.orderId ? "orders" : "overview");
    setSelected(item.campaignId || "");
    setTimeout(
      () =>
        document
          .getElementById(
            item.orderId
              ? "order-" + item.orderId
              : item.kind === "refund"
                ? "campaign-refunds"
                : "campaign-applicants",
          )
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60,
    );
  };
  const current = data?.campaigns.find((c: Row) => c.id === selected);
  function exportApplicants(c: Row) {
    const cells = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const csv =
      "\uFEFF" +
      [
        ["지원번호", "활동명", "블로그", "클립", "상태", "지원 내용"],
        ...c.applications.map((a: Row) => [
          a.id,
          a.data.name,
          a.data.accounts?.blog,
          a.data.accounts?.clip,
          appStates[a.data.status] || a.data.status,
          a.data.message,
        ]),
      ]
        .map((row) => row.map(cells).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "campaign-applicants.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <PublicShell>
      <section className={s.section}>
        <div className={s.row}>
          <div>
            <span className={s.eyebrow}>
              {admin ? "OPERATIONS" : "MY CAMPAIGNS"}
            </span>
            <h1>{admin ? "주문·캠페인 운영" : "광고주 마이페이지"}</h1>
          </div>
          <div className={s.actions}>
            <Link className={s.cta} href="/marketing">
              새 캠페인
            </Link>
            <button
              disabled={busy}
              onClick={() =>
                load()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              새로고침
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className={s.error}>
            {error}{" "}
            {!data && (
              <Link href={admin ? "/admin" : "/login"}>로그인으로 이동</Link>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className={s.notice}>
            {notice}
          </p>
        )}
        {!data && !error && <p>내역을 불러오는 중…</p>}
        {data && (
          <>
            <nav className={s.tabs} aria-label="마이페이지 메뉴">
              <button
                aria-pressed={tab === "overview"}
                onClick={() => {
                  setSelected("");
                  setTab("overview");
                }}
              >
                캠페인·할 일
              </button>
              <button
                aria-pressed={tab === "orders"}
                onClick={() => {
                  setSelected("");
                  setTab("orders");
                }}
              >
                주문·결제
              </button>
              {!admin && (
                <button
                  aria-pressed={tab === "products"}
                  onClick={() => {
                    setSelected("");
                    setTab("products");
                  }}
                >
                  내 제품·서비스
                </button>
              )}
              {!admin && (
                <Link href="/advertisers/connections">AI 연결 관리</Link>
              )}
              {admin && (
                <>
                  <button
                    aria-pressed={tab === "settings"}
                    onClick={() => {
                      setSelected("");
                      setTab("settings");
                    }}
                  >
                    결제 계좌 설정
                  </button>
                  <Link href="/admin">제작·회원·정산 관리</Link>
                </>
              )}
            </nav>
            {tab === "products" && !admin && <AdvertiserProducts />}
            {tab === "settings" && admin && (
              <section className={s.panel}>
                <h2>계좌이체 결제 설정</h2>
                <p>
                  실제 사업자 수취 계좌를 확인하고 활성화하세요. 입금 확인은
                  관리자만 기록할 수 있습니다.
                </p>
                <form
                  className={s.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act({
                      action: "bank",
                      data: {
                        enabled: f.get("enabled") === "on",
                        bank: f.get("bank"),
                        account: f.get("account"),
                        holder: f.get("holder"),
                      },
                    });
                  }}
                >
                  <label>
                    은행
                    <input
                      name="bank"
                      defaultValue={data.payment?.bank}
                      required
                    />
                  </label>
                  <label>
                    계좌번호
                    <input
                      name="account"
                      defaultValue={data.payment?.account}
                      required
                    />
                  </label>
                  <label>
                    예금주
                    <input
                      name="holder"
                      defaultValue={data.payment?.holder}
                      required
                    />
                  </label>
                  <label>
                    <span>
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={data.payment?.enabled}
                      />{" "}
                      계좌이체 주문 받기
                    </span>
                  </label>
                  <button disabled={busy} className={s.primary}>
                    설정 저장
                  </button>
                </form>
              </section>
            )}
            {tab === "orders" && (
              <section>
                <h2>주문·입금 확인</h2>
                {!data.orders.length && <p>아직 주문이 없습니다.</p>}
                {data.orders.map((o: Row) => (
                  <article className={s.panel} key={o.id} id={"order-" + o.id}>
                    <span className={s.badge}>
                      {o.data.status === "paid"
                        ? "입금 확인 완료"
                        : o.data.status === "cancelled"
                          ? "주문 취소"
                          : "입금 대기"}
                    </span>
                    <h3>주문 {o.id.slice(-8)}</h3>
                    <p>
                      결제액 {money(o.data.total)} · {formatDate(o.created_at)}
                    </p>
                    <p>
                      계좌: {o.data.bank?.bank} {o.data.bank?.account} ·{" "}
                      {o.data.bank?.holder}
                    </p>
                    <p>
                      이체 시 주문번호 끝 8자리를 알려주세요. 입금 확인 후
                      모집을 시작합니다.
                    </p>
                    {o.data.status === "awaiting_payment" && (
                      <p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            act({
                              action: "cancel-order",
                              id: o.id,
                              version: o.version,
                            })
                          }
                        >
                          입금 전 주문 취소
                        </button>
                      </p>
                    )}
                    {admin && o.data.status === "awaiting_payment" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act({
                            action: "payment",
                            id: o.id,
                            version: o.version,
                            reference: f.get("reference"),
                          });
                        }}
                      >
                        <label>
                          실제 입금 확인 근거
                          <input
                            name="reference"
                            required
                            minLength={3}
                            placeholder="은행 거래번호·입금자·입금 시각"
                          />
                        </label>
                        <div className={s.actions}>
                          <button disabled={busy} className={s.primary}>
                            입금 확인 기록
                          </button>
                        </div>
                      </form>
                    )}
                    {o.data.paymentReference && (
                      <p>입금 확인: {o.data.paymentReference}</p>
                    )}
                  </article>
                ))}
              </section>
            )}
            {tab === "overview" && !current && (
              <>
                <OperationQueue data={data} admin={admin} onOpen={openQueue} />
                <h2>전체 캠페인 · {data.campaigns.length}</h2>
                {!data.campaigns.length && (
                  <p>아직 캠페인이 없어요. 새 캠페인을 등록해주세요.</p>
                )}
                <div className={s.columns}>
                  {data.campaigns.map((c: Row) => (
                    <article className={s.offer} key={c.id}>
                      <span className={s.badge}>
                        {campaignStates[c.data.status]}
                      </span>
                      <h3>
                        {c.data.input.brand} · {c.data.input.title}
                      </h3>
                      <p>
                        {c.data.input.managed ? "운영 대행" : "기본형"} · 지원{" "}
                        {c.counts.applied}명 / 참여 {c.counts.accepted}명 / 완료{" "}
                        {c.counts.completed}명
                      </p>
                      <strong>{money(c.data.total)}</strong>
                      <p>
                        <button
                          onClick={() => {
                            setSelected(c.id);
                            setAppFilter("all");
                            setAppQuery("");
                          }}
                        >
                          상세 보기
                        </button>
                      </p>
                    </article>
                  ))}
                </div>
              </>
            )}
            {current && (
              <section>
                <button onClick={() => setSelected("")}>← 전체 캠페인</button>
                <h2>
                  {current.data.input.brand} · {current.data.input.title}
                </h2>
                <span className={s.badge}>
                  {current.data.input.managed ? "운영 대행" : "기본형"} ·{" "}
                  {campaignStates[current.data.status]}
                </span>
                {current.data.status !== "awaiting_payment" && (
                  <details className={s.panel}>
                    <summary>공개 캠페인 정보</summary>
                    <p>
                      분류와 대표 이미지는 목록에 표시돼요. 지원자가 있으면 진행
                      방식과 지역을 바꿀 수 없어요.
                    </p>
                    <form
                      key={current.id + ":" + current.version}
                      className={s.form}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void operation(current, "presentation", {
                          presentation: {
                            ...(admin
                              ? { visibility: f.get("visibility") }
                              : {}),
                            category: f.get("category"),
                            fulfillment: f.get("fulfillment") || "provided",
                            region: f.get("region") || "",
                            imageUrl: f.get("imageUrl") || "",
                          },
                        });
                      }}
                    >
                      <CampaignPresentationFields
                        admin={admin}
                        value={current.data.input}
                        packageOnly={current.data.input.kind === "package"}
                      />
                      <button disabled={busy}>공개 정보 저장</button>
                    </form>
                  </details>
                )}
                <ol className={s.steps}>
                  {[
                    "입금 확인",
                    "모집",
                    "선정·수락",
                    "체험·제작",
                    "검수",
                    "완료·정산",
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                <p>
                  모집 {current.data.input.deadline} · 제출{" "}
                  {current.data.input.submissionDeadline}
                </p>
                {admin && (
                  <details className={s.panel}>
                    <summary>기존 AI 제작 프로젝트 연결</summary>
                    <p>
                      제작 관리에서 고객·제품·프로젝트를 준비한 뒤 연결하세요.
                      연결된 프로젝트의 현재 제작 파일을 참여자별로 전달할 수
                      있습니다. 기존 프로젝트에서는 별도 게시자 배정·지급을
                      진행하지 마세요.
                    </p>
                    <form
                      className={s.form}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void operation(current, "link-production", {
                          projectId: new FormData(e.currentTarget).get(
                            "projectId",
                          ),
                        });
                      }}
                    >
                      <label>
                        제작 프로젝트
                        <select
                          name="projectId"
                          required
                          defaultValue={current.data.projectId || ""}
                        >
                          <option value="">프로젝트 선택</option>
                          {data.productionProjects?.map((p: Row) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button disabled={busy}>프로젝트 연결</button>
                    </form>
                    <Link href="/admin">제작 관리 열기 →</Link>
                  </details>
                )}
                <details className={s.panel}>
                  <summary>담당자 문의·일정 조율</summary>
                  {(current.data.messages || []).map((m: Row, i: number) => (
                    <p key={i}>
                      <strong>
                        {m.role === "admin" ? "담당자" : "광고주"}
                      </strong>{" "}
                      · {formatDate(m.at)}
                      <br />
                      {m.text}
                    </p>
                  ))}
                  <form
                    className={s.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void operation(current, "message", {
                        note: new FormData(e.currentTarget).get("note"),
                      });
                    }}
                  >
                    <label className={s.wide}>
                      문의·요청
                      <textarea
                        name="note"
                        required
                        minLength={3}
                        maxLength={2000}
                      />
                    </label>
                    <button disabled={busy}>문의 기록 남기기</button>
                  </form>
                  {(admin || !current.data.input.managed) && (
                    <form
                      className={s.form}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void operation(current, "schedule", {
                          deadline: f.get("deadline"),
                          submissionDeadline: f.get("submissionDeadline"),
                          note: f.get("note"),
                        });
                      }}
                    >
                      <p className={s.wide}>
                        기존 마감보다 앞당길 수 없습니다. 광고주 직접 변경은
                        1회이며, 추가 조율은 담당자에게 요청하세요.
                      </p>
                      <label>
                        모집 마감
                        <input
                          type="date"
                          name="deadline"
                          defaultValue={current.data.input.deadline}
                          required
                        />
                      </label>
                      <label>
                        제출 마감
                        <input
                          type="date"
                          name="submissionDeadline"
                          defaultValue={current.data.input.submissionDeadline}
                          required
                        />
                      </label>
                      <label>
                        변경 근거
                        <input name="note" required minLength={3} />
                      </label>
                      <button disabled={busy}>일정 연장</button>
                    </form>
                  )}
                </details>
                <details className={s.panel}>
                  <summary>확정 가이드·구매 구성</summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {current.data.input.guide}
                  </p>
                  <p>{current.data.input.benefit}</p>
                  <p>{current.data.terms.managedScope}</p>
                  {current.data.lines.map((l: Row) => (
                    <div className={s.row} key={l.key}>
                      <span>{l.label}</span>
                      <strong>{money(l.amount)}</strong>
                    </div>
                  ))}
                </details>
                {admin && (
                  <form
                    className={s.panel}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void operation(current, "status", {
                        status: f.get("status"),
                        note: f.get("note"),
                      });
                    }}
                  >
                    <h3>진행 단계 변경</h3>
                    <div className={s.form}>
                      <label>
                        단계
                        <select
                          name="status"
                          defaultValue={current.data.status}
                        >
                          {Object.entries(campaignStates)
                            .filter(
                              ([k]) =>
                                !["awaiting_payment", "paused"].includes(k),
                            )
                            .map(([k, v]) => (
                              <option value={k} key={k}>
                                {v}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        처리 근거
                        <input name="note" required minLength={3} />
                      </label>
                    </div>
                    <button disabled={busy}>단계 저장</button>
                  </form>
                )}
                <section className={s.panel}>
                  <div className={s.row}>
                    <h3 id="campaign-applicants">
                      지원자·참여자 {current.applications.length}명
                    </h3>
                    <button onClick={() => exportApplicants(current)}>
                      비교용 CSV 다운로드
                    </button>
                  </div>
                  <p className={s.muted}>
                    연락처·배송지·정산 계좌는 비교용 파일에 포함하지 않습니다.
                  </p>
                  {!current.applications.length && (
                    <p>아직 지원자가 없습니다.</p>
                  )}
                  <div className="applicant-toolbar">
                    <label>
                      지원자 검색
                      <input
                        aria-label="지원자 검색"
                        value={appQuery}
                        onChange={(e) => setAppQuery(e.target.value)}
                        placeholder="활동명 또는 지원 내용"
                      />
                    </label>
                    <label>
                      지원 상태
                      <select
                        aria-label="지원 상태"
                        value={appFilter}
                        onChange={(e) => setAppFilter(e.target.value)}
                      >
                        <option value="all">상태 전체</option>
                        {Object.entries(appStates).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {current.applications.length > 0 &&
                    !current.applications.some(
                      (a: Row) =>
                        (appFilter === "all" || a.data.status === appFilter) &&
                        [a.data.name, a.data.message]
                          .join(" ")
                          .toLowerCase()
                          .includes(appQuery.trim().toLowerCase()),
                    ) && <p>조건에 맞는 지원자가 없어요.</p>}
                  {current.applications
                    .filter(
                      (a: Row) =>
                        (appFilter === "all" || a.data.status === appFilter) &&
                        [a.data.name, a.data.message]
                          .join(" ")
                          .toLowerCase()
                          .includes(appQuery.trim().toLowerCase()),
                    )
                    .map((a: Row) => (
                      <article className={s.list} key={a.id}>
                        <div className={s.row}>
                          <strong>{a.data.name}</strong>
                          <span className={s.badge}>
                            {appStates[a.data.status] || a.data.status}
                          </span>
                        </div>
                        <p>{a.data.message}</p>
                        <div className={s.actions}>
                          {Object.entries(a.data.accounts || {}).map(
                            ([channel, url]) => (
                              <a
                                key={channel}
                                href={String(url)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {channel === "blog" ? "블로그" : "클립"} 활동
                                채널 ↗
                              </a>
                            ),
                          )}
                        </div>
                        {a.data.expiresAt && (
                          <p>수락 기한 {formatDate(a.data.expiresAt)}</p>
                        )}
                        {(admin || !current.data.input.managed) &&
                          a.data.status === "applied" && (
                            <div className={s.actions}>
                              <button
                                className={s.primary}
                                disabled={busy}
                                onClick={() =>
                                  operation(current, "select", {
                                    applicationId: a.id,
                                  })
                                }
                              >
                                선정·참여 제안
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  operation(current, "reject", {
                                    applicationId: a.id,
                                    note: "캠페인 조건에 따른 미선정",
                                  })
                                }
                              >
                                미선정
                              </button>
                            </div>
                          )}
                        {(admin || current.data.input.kind !== "package") &&
                          ["selected", "accepted", "revision"].includes(
                            a.data.status,
                          ) && (
                            <details>
                              <summary>원고·이미지·영상 전달</summary>
                              <form
                                className={s.form}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const f = new FormData(e.currentTarget);
                                  void operation(current, "materials", {
                                    applicationId: a.id,
                                    materials: {
                                      assetIds: f.getAll("assetIds"),
                                      copy: String(f.get("copy") || ""),
                                      urls: String(f.get("urls") || "")
                                        .split(/\r?\n/)
                                        .map((x) => x.trim())
                                        .filter(Boolean),
                                    },
                                  });
                                }}
                              >
                                {admin && current.data.projectId && (
                                  <fieldset className={s.wide}>
                                    <legend>
                                      연결한 프로젝트의 현재 제작 파일
                                    </legend>
                                    {data.productionAssets
                                      ?.filter(
                                        (v: Row) =>
                                          v.projectId ===
                                          current.data.projectId,
                                      )
                                      .map((v: Row) => (
                                        <label key={v.id}>
                                          <span>
                                            <input
                                              type="checkbox"
                                              name="assetIds"
                                              value={v.id}
                                              defaultChecked={a.data.materials?.assetIds?.includes(
                                                v.id,
                                              )}
                                            />
                                            {v.category} · {v.name}{" "}
                                            <a
                                              href={"/api/assets/" + v.id}
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              검토 ↗
                                            </a>
                                          </span>
                                        </label>
                                      ))}
                                  </fieldset>
                                )}
                                <label className={s.wide}>
                                  제공 원고
                                  <textarea
                                    name="copy"
                                    defaultValue={a.data.materials?.copy}
                                    maxLength={30000}
                                  />
                                </label>
                                <label className={s.wide}>
                                  자료 HTTPS 링크 (줄마다 하나)
                                  <textarea
                                    name="urls"
                                    defaultValue={a.data.materials?.urls?.join(
                                      "\n",
                                    )}
                                  />
                                </label>
                                <button disabled={busy}>
                                  이 참여자에게 전달
                                </button>
                              </form>
                            </details>
                          )}
                        {a.data.links && (
                          <>
                            <h4>제출 콘텐츠</h4>
                            {Object.entries(a.data.links).map(
                              ([channel, url]) => (
                                <p key={channel}>
                                  <a
                                    href={String(url)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {channel} 게시물 확인 ↗
                                  </a>
                                </p>
                              ),
                            )}
                            <p>
                              제출 {formatDate(a.data.submittedAt)} · 링크
                              접근과 가이드 준수 여부를 직접 확인하세요.
                            </p>
                          </>
                        )}
                        {(admin || !current.data.input.managed) &&
                          a.data.status === "submitted" && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void operation(current, "review", {
                                  applicationId: a.id,
                                  decision: f.get("decision"),
                                  note: f.get("note"),
                                });
                              }}
                            >
                              <div className={s.form}>
                                <label>
                                  검수 결과
                                  <select name="decision">
                                    <option value="approve">
                                      가이드 충족 · 승인
                                    </option>
                                    <option value="revision">수정 요청</option>
                                  </select>
                                </label>
                                <label>
                                  확인 결과·수정할 항목
                                  <input
                                    name="note"
                                    required
                                    minLength={3}
                                    maxLength={2000}
                                  />
                                </label>
                              </div>
                              <div className={s.actions}>
                                <button className={s.primary} disabled={busy}>
                                  검수 결과 저장
                                </button>
                              </div>
                            </form>
                          )}
                        {a.data.note && <p>안내: {a.data.note}</p>}
                        {admin &&
                          [
                            "selected",
                            "accepted",
                            "submitted",
                            "revision",
                            "verified",
                          ].includes(a.data.status) && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void operation(
                                  current,
                                  a.data.status === "verified"
                                    ? "payout"
                                    : "end-work",
                                  {
                                    applicationId: a.id,
                                    reference: f.get("reference"),
                                  },
                                );
                              }}
                            >
                              <label>
                                {a.data.status === "verified"
                                  ? `보수 ${money(a.data.amount)} 실제 지급 후 증빙`
                                  : "보수 의무가 없는 종료·취소 합의 근거"}
                                <input
                                  name="reference"
                                  required
                                  minLength={3}
                                />
                              </label>
                              <div className={s.actions}>
                                <button disabled={busy}>
                                  {a.data.status === "verified"
                                    ? "실제 리워드 지급 기록"
                                    : "작업 종료 기록"}
                                </button>
                              </div>
                            </form>
                          )}
                      </article>
                    ))}
                </section>
                <section className={s.panel}>
                  <h3 id="campaign-refunds">비용·환불</h3>
                  <p>
                    이 캠페인 결제액{" "}
                    <strong>{money(current.data.total)}</strong>
                  </p>
                  <p>
                    현재 기록된 수행액{" "}
                    {money(
                      Object.values(current.data.used || {}).reduce(
                        (n: number, v) => n + Number(v),
                        0,
                      ),
                    )}{" "}
                    · 승인·송금된 환불{" "}
                    {money(
                      current.data.refunds
                        .filter((r: Row) =>
                          ["approved", "paid"].includes(r.status),
                        )
                        .reduce((n: number, r: Row) => n + Number(r.amount), 0),
                    )}
                  </p>
                  <p className={s.muted}>
                    승인과 송금 완료는 다릅니다. 셀프는 완료 인원, 패키지·대행은
                    항목별 수행 근거로 최종 정산합니다.
                  </p>
                  {admin &&
                    (current.data.input.kind === "package" ||
                      current.data.input.managed) && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const used = Object.fromEntries(
                            current.data.lines.map((l: Row) => [
                              l.key,
                              Number(f.get(l.key)),
                            ]),
                          );
                          void operation(current, "usage", {
                            used,
                            note: f.get("note"),
                          });
                        }}
                      >
                        <h4>항목별 실제 수행액 확정</h4>
                        <div className={s.form}>
                          {current.data.lines.map((l: Row) => (
                            <label key={l.key}>
                              {l.label} · 상한 {money(l.amount)}
                              <input
                                type="number"
                                name={l.key}
                                min={0}
                                max={l.amount}
                                defaultValue={current.data.used[l.key] || 0}
                                required
                              />
                            </label>
                          ))}
                          <label className={s.wide}>
                            수행 내역·증빙
                            <input name="note" required minLength={3} />
                          </label>
                        </div>
                        <button disabled={busy}>수행액 저장</button>
                      </form>
                    )}
                  {admin &&
                    current.data.input.kind !== "package" &&
                    !current.data.input.managed && (
                      <div className={s.actions}>
                        <button
                          disabled={busy}
                          onClick={() => operation(current, "settle-self")}
                        >
                          완료 인원으로 정산·미사용 예산 환불 승인
                        </button>
                      </div>
                    )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void operation(current, "refund-request", {
                        note: f.get("note"),
                      });
                    }}
                  >
                    <label>
                      취소·환불·정산 이의 사유
                      <textarea
                        name="note"
                        required
                        minLength={3}
                        maxLength={2000}
                        placeholder="대상 작업·중단 요청 범위·사유를 적어주세요."
                      />
                    </label>
                    <button
                      disabled={
                        busy ||
                        current.data.refunds.some((r: Row) =>
                          ["requested", "approved", "paid"].includes(r.status),
                        )
                      }
                    >
                      환불 검토 요청 · 신규 진행 보류
                    </button>
                  </form>
                  {current.data.refunds.map((r: Row) => (
                    <article className={s.list} key={r.id}>
                      <h4>
                        {r.status === "requested"
                          ? "환불 검토 중"
                          : r.status === "approved"
                            ? "환불 승인 · 송금 대기"
                            : r.status === "paid"
                              ? "환불 송금 기록 완료"
                              : "환불 요청 반려"}{" "}
                        {r.amount ? money(r.amount) : ""}
                      </h4>
                      <p>
                        {r.reason} {r.response}
                      </p>
                      {r.reference && <p>송금 증빙: {r.reference}</p>}
                      {admin && r.status === "requested" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void operation(current, "refund-decide", {
                              refundId: r.id,
                              decision: f.get("decision"),
                              note: f.get("note"),
                              ...(f.get("decision") === "approve"
                                ? { amount: Number(f.get("amount")) }
                                : {}),
                            });
                          }}
                        >
                          <div className={s.form}>
                            <label>
                              결정
                              <select name="decision">
                                <option value="approve">승인</option>
                                <option value="reject">반려</option>
                              </select>
                            </label>
                            <label>
                              승인 환불액
                              <input
                                type="number"
                                min={1}
                                max={current.data.total}
                                name="amount"
                              />
                            </label>
                            <label className={s.wide}>
                              금액 산정·처리 근거
                              <input name="note" required minLength={3} />
                            </label>
                          </div>
                          <button disabled={busy}>환불 검토 저장</button>
                        </form>
                      )}
                      {admin && r.status === "approved" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void operation(current, "refund-paid", {
                              refundId: r.id,
                              reference: f.get("reference"),
                            });
                          }}
                        >
                          <label>
                            실제 환불 이체 증빙
                            <input name="reference" required minLength={3} />
                          </label>
                          <button disabled={busy}>송금 완료 기록</button>
                        </form>
                      )}
                    </article>
                  ))}
                </section>
                <details className={s.panel}>
                  <summary>활동·처리 기록</summary>
                  {current.data.history.map((h: Row, i: number) => (
                    <p key={i}>
                      {formatDate(h.at)} · {h.action} · {h.note}
                    </p>
                  ))}
                </details>
              </section>
            )}
          </>
        )}
      </section>
    </PublicShell>
  );
}
