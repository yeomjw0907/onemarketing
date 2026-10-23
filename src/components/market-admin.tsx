"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { DatabaseView } from "@/lib/types";
import { marketFetch } from "./market-public";
import styles from "./market.module.css";
type Row = Record<string, any>;
export default function MarketAdmin({
  data,
  reload,
  onQuote,
  onParticipant,
}: {
  data: DatabaseView;
  reload: () => Promise<void>;
  onQuote: () => void;
  onParticipant: (id: string) => void;
}) {
  const [entries, setEntries] = useState<Row[]>([]),
    [advertisers, setAdvertisers] = useState<Row[]>([]),
    [catalog, setCatalog] = useState<Row | null>(null),
    [campaign, setCampaign] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    const d = await marketFetch("/api/market?mode=admin");
    setEntries(d.entries);
    setAdvertisers(d.advertisers);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function action(body: Row) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await marketFetch("/api/market", body);
      await load();
      await reload();
      setNotice("저장했습니다.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const prices = data.prices.filter((p) => !p.deletedAt),
    projects = data.projects.filter((p) => !p.deletedAt),
    customers = data.customers.filter((c) => !c.deletedAt);
  async function saveCatalog(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const d = {
      title: f.get("title"),
      description: f.get("description"),
      details: f.get("details"),
      type: f.get("type"),
      published: f.get("published") === "on",
      ...(f.get("blogPriceId") ? { blogPriceId: f.get("blogPriceId") } : {}),
      ...(f.get("clipPriceId") ? { clipPriceId: f.get("clipPriceId") } : {}),
    };
    if (
      await action({
        action: "catalog",
        id: catalog?.id,
        version: catalog?.version,
        data: d,
      })
    )
      setCatalog(null);
  }
  async function saveCampaign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await action({
        action: "campaign",
        id: campaign?.id,
        version: campaign?.version,
        data: {
          projectId: f.get("projectId"),
          title: f.get("title"),
          description: f.get("description"),
          guide: f.get("guide"),
          deadline: f.get("deadline"),
          published: f.get("published") === "on",
        },
      })
    )
      setCampaign(null);
  }
  return (
    <div className={styles.admin}>
      <p>
        <Link href="/admin/platform">새 주문·입금·선정·검수·환불 운영 →</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1>상품·모집 플랫폼</h1>
          <p>
            광고 신청은 견적으로, 공개 지원자는 기존 제안·배정으로 연결합니다.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            load().catch((e) => setError(e.message));
          }}
        >
          신청 새로고침
        </button>
      </div>
      <div className={styles.row}>
        <Link href="/marketing" target="_blank">
          광고주 상품 화면 ↗
        </Link>
        <Link href="/campaigns" target="_blank">
          체험단 캠페인 화면 ↗
        </Link>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {loading && <p>신청과 공개 설정을 불러오는 중…</p>}
      <section>
        <h2>공개 상품 관리</h2>
        <p className={styles.muted}>
          내부 단가 중 공개할 상품만 등록하세요. 판매가만 공개되며
          원가·보수·마진은 노출하지 않습니다. 단가는 블로그 이미지 3장, 클립
          10초 생성형 기준입니다.
        </p>
        <div className={styles.row}>
          {entries
            .filter((r) => r.kind === "catalog")
            .map((r) => (
              <button key={r.id} disabled={busy} onClick={() => setCatalog(r)}>
                {r.data.title} · {r.data.published ? "공개" : "비공개"}
              </button>
            ))}
          <button
            disabled={busy}
            onClick={() => setCatalog({ data: {}, version: 1 })}
          >
            + 상품 등록
          </button>
        </div>
        {catalog && (
          <form
            key={catalog.id || "new"}
            className={styles.form}
            onSubmit={saveCatalog}
          >
            <label>
              상품명
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={catalog.data.title}
              />
            </label>
            <label>
              상품 유형
              <select name="type" defaultValue={catalog.data.type || "blog"}>
                <option value="blog">블로그</option>
                <option value="clip">클립</option>
                <option value="bundle">블로그 + 클립</option>
              </select>
            </label>
            <label className={styles.wide}>
              한 줄 설명
              <input
                name="description"
                required
                maxLength={500}
                defaultValue={catalog.data.description}
              />
            </label>
            {["blog", "clip"].map((channel) => (
              <label key={channel}>
                {channel === "blog" ? "블로그" : "클립"} 판매 단가
                <select
                  name={channel + "PriceId"}
                  defaultValue={catalog.data[channel + "PriceId"] || ""}
                >
                  <option value="">해당 없음</option>
                  {prices
                    .filter((p) => p.channel === channel)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {String(p.name)} · {Number(p.sale).toLocaleString()}원
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <label className={styles.wide}>
              제공 범위·일정·수정·포함 비용
              <textarea
                name="details"
                required
                maxLength={4000}
                defaultValue={catalog.data.details}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="published"
                defaultChecked={catalog.data.published}
              />
              외부 상품 목록에 공개
            </label>
            <div className={styles.row}>
              <button disabled={busy} className={styles.primary}>
                상품 저장
              </button>
              <button type="button" onClick={() => setCatalog(null)}>
                닫기
              </button>
            </div>
          </form>
        )}
      </section>
      <section>
        <h2>광고 신청 접수함</h2>
        {entries.filter((r) => r.kind === "request").length === 0 && (
          <p>접수된 광고 신청이 없습니다.</p>
        )}
        {entries
          .filter((r) => r.kind === "request")
          .map((r) => {
            const a = advertisers.find((a) => a.id === r.owner_id);
            return (
              <article className={styles.list} key={r.id}>
                <h3>
                  {r.data.brand} · {r.data.productSnapshot.title}
                </h3>
                <p>
                  {r.data.status === "new"
                    ? "접수 대기"
                    : r.data.status === "quoted"
                      ? "견적 전환 완료"
                      : "반려"}{" "}
                  · {a?.name} · {a?.phone} · {a?.email}
                </p>
                <p>
                  제품: {r.data.product} · {r.data.quantity}건 ·{" "}
                  {Number(r.data.total).toLocaleString()}원 (VAT 포함)
                  <br />
                  희망 기간 {r.data.start} ~ {r.data.end}
                </p>
                <p>{r.data.notes}</p>
                <a href={r.data.productUrl} target="_blank" rel="noreferrer">
                  신청 제품·매장 보기 ↗
                </a>
                {r.data.status === "new" && (
                  <form
                    className={styles.form}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await action({
                          action: "convert",
                          id: r.id,
                          version: r.version,
                          data: {
                            customerId: f.get("customerId"),
                            productId: f.get("productId"),
                          },
                        })
                      )
                        setNotice(
                          "기존 계약·견적 메뉴에 초안을 만들었습니다. 문서 검토 후 기존 절차로 확정해주세요.",
                        );
                    }}
                  >
                    <label>
                      고객 연결
                      <select
                        name="customerId"
                        defaultValue={a?.customer_id || ""}
                      >
                        <option value="">신규 고객 생성</option>
                        {customers.map((c) => (
                          <option value={c.id} key={c.id}>
                            {String(c.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      제품 연결
                      <select name="productId">
                        <option value="">신규 제품 생성</option>
                        {data.products
                          .filter((p) => !p.deletedAt)
                          .map((p) => (
                            <option value={p.id} key={p.id}>
                              {String(
                                data.customers.find(
                                  (c) => c.id === p.customerId,
                                )?.name,
                              )}{" "}
                              · {String(p.name)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className={styles.row}>
                      <button disabled={busy} className={styles.primary}>
                        견적 초안으로 전환
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const note =
                            window.prompt("반려 사유를 입력해주세요.");
                          if (note?.trim())
                            void action({
                              action: "reject-order",
                              id: r.id,
                              version: r.version,
                              data: { note },
                            });
                        }}
                      >
                        반려
                      </button>
                    </div>
                  </form>
                )}
                {r.data.quoteId && (
                  <button onClick={onQuote}>계약·견적 확인하기</button>
                )}
                {r.data.adminNote && <p>{r.data.adminNote}</p>}
              </article>
            );
          })}
      </section>
      <section>
        <h2>공개 캠페인 모집</h2>
        <p className={styles.muted}>
          내부 프로젝트는 자동 공개되지 않습니다. 공개용
          제목·설명·가이드·마감일을 확인해 게시하세요. 선정 시 기존 계정 권한
          확인 기준도 적용됩니다.
        </p>
        <div className={styles.row}>
          {entries
            .filter((r) => r.kind === "campaign")
            .map((r) => (
              <button key={r.id} disabled={busy} onClick={() => setCampaign(r)}>
                {r.data.title} · {r.data.published ? "공개" : "비공개"}
              </button>
            ))}
          <button
            disabled={busy}
            onClick={() => setCampaign({ data: {}, version: 1 })}
          >
            + 모집 등록
          </button>
        </div>
        {campaign && (
          <form
            key={campaign.id || "new"}
            className={styles.form}
            onSubmit={saveCampaign}
          >
            <label>
              프로젝트
              <select
                name="projectId"
                defaultValue={campaign.data.projectId || ""}
                required
              >
                <option value="">프로젝트 선택</option>
                {projects
                  .filter(
                    (p) => !campaign.id || p.id === campaign.data.projectId,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.name)} · {String(p.due)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              공개 제목
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={campaign.data.title}
              />
            </label>
            <label className={styles.wide}>
              공개 설명
              <input
                name="description"
                required
                maxLength={500}
                defaultValue={campaign.data.description}
              />
            </label>
            <label>
              모집 마감일
              <input
                type="date"
                name="deadline"
                required
                defaultValue={campaign.data.deadline}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="published"
                defaultChecked={campaign.data.published}
              />
              공개 모집 게시
            </label>
            <label className={styles.wide}>
              수행할 일·제공 자료·약정·유지·지급 조건
              <textarea
                name="guide"
                required
                maxLength={4000}
                defaultValue={campaign.data.guide}
              />
            </label>
            <div className={styles.row}>
              <button disabled={busy} className={styles.primary}>
                모집 저장
              </button>
              <button type="button" onClick={() => setCampaign(null)}>
                닫기
              </button>
            </div>
          </form>
        )}
      </section>
      <section>
        <h2>공개 지원자 · 추천 배정 연결</h2>
        <p className={styles.muted}>
          공개 지원자를 선정하면 남은 슬롯에 기존 제안을 생성합니다. 회원이 최종
          수락해야 배정됩니다. 추천 후보는 캠페인 운영 메뉴에서 기존처럼 제안할
          수 있습니다.
        </p>
        {!entries.some((r) => r.kind === "application") && (
          <p>공개 모집 지원자가 없습니다.</p>
        )}
        {entries
          .filter((r) => r.kind === "application")
          .map((r) => {
            const p = data.participants.find((p) => p.id === r.owner_id),
              o = data.work_offers.find((o) => o.id === r.data.offerId);
            const accounts = (p?.accounts || []) as Row[];
            return (
              <article className={styles.list} key={r.id}>
                <h3>
                  {r.data.title} · {String(p?.name || "회원")}
                </h3>
                <p>
                  유입: 직접 지원 · {r.data.type} · 상태{" "}
                  {String(o?.status || r.data.status)}
                </p>
                <p>{r.data.message}</p>
                {accounts
                  .filter((a) =>
                    [r.data.blogAccountId, r.data.clipAccountId].includes(a.id),
                  )
                  .map((a) => (
                    <p key={a.id}>
                      {a.url} ·{" "}
                      {a.ownershipVerifiedAt
                        ? "권한 확인 완료"
                        : "소유·관리 권한 확인 필요"}
                    </p>
                  ))}
                <div className={styles.row}>
                  <button onClick={() => onParticipant(String(r.owner_id))}>
                    회원·계정 확인
                  </button>
                  {r.data.status === "applied" && (
                    <>
                      <button
                        disabled={busy}
                        className={styles.primary}
                        onClick={() => {
                          if (
                            window.confirm(
                              "이 지원자를 선정하고 최종 참여 제안을 생성할까요?",
                            )
                          )
                            void action({
                              action: "select",
                              id: r.id,
                              version: r.version,
                            });
                        }}
                      >
                        선정·참여 제안
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          const note =
                            window.prompt("미선정 안내 사유를 입력해주세요.");
                          if (note?.trim())
                            void action({
                              action: "reject-application",
                              id: r.id,
                              version: r.version,
                              data: { note },
                            });
                        }}
                      >
                        미선정
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
      </section>
    </div>
  );
}
