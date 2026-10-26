"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Grid2X2,
  Utensils,
  Coffee,
  FlaskConical,
  House,
  ShoppingBag,
  Plane,
  Ellipsis,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import useAccountFavorites from "./use-account-favorites";
import PublicShell from "./public-shell";
import { marketFetch } from "./public-fetch";
import {
  campaignCategories,
  fulfillmentNames,
  channelNames,
  discoveryStates,
  type CampaignSummary,
} from "@/lib/campaign-display";
import { money } from "@/lib/commerce-policy";
const icons = [
  Grid2X2,
  Utensils,
  Coffee,
  FlaskConical,
  House,
  ShoppingBag,
  Plane,
  Ellipsis,
];
export function CampaignImage({
  campaign,
  cover = false,
}: {
  campaign: CampaignSummary;
  cover?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [campaign.imageUrl]);
  return campaign.imageUrl && !failed ? (
    <img
      className={cover ? "cover" : undefined}
      src={campaign.imageUrl}
      alt={campaign.title}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={cover ? "cover placeholder" : "placeholder"}>
      <span className="brand-initial" aria-hidden="true">
        {campaign.brand.slice(0, 1)}
      </span>
      <span>{campaign.brand}</span>
      <small>
        {campaignCategories[
          campaign.category as keyof typeof campaignCategories
        ] || "캠페인"}
      </small>
    </div>
  );
}
export function CampaignCard({ c }: { c: CampaignSummary }) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const days = Math.round(
    (Date.parse(c.deadline) - Date.parse(today)) / 86400000,
  );
  return (
    <article
      className="campaign"
      onClick={() => {
        try {
          sessionStorage.setItem(
            "om_campaign_scroll",
            JSON.stringify({
              url: location.pathname + location.search,
              y: scrollY,
            }),
          );
        } catch {}
      }}
    >
      <Link className="thumb" href={"/campaigns/" + c.id}>
        <CampaignImage campaign={c} />
        <span className={"badge " + (c.canApply && days <= 3 ? "urgent" : "")}>
          {c.canApply
            ? days <= 0
              ? "오늘 마감"
              : `D-${days}`
            : discoveryStates[c.status as keyof typeof discoveryStates] ||
              "모집 종료"}
        </span>
      </Link>
      <div className="brandname">{c.brand}</div>
      <Link href={"/campaigns/" + c.id}>
        <h3>{c.title}</h3>
      </Link>
      <div className="tags">
        <span>
          {channelNames[c.channel as keyof typeof channelNames] ||
            "블로그·클립"}
        </span>
        <span>
          {fulfillmentNames[c.fulfillment as keyof typeof fulfillmentNames] ||
            "원고 제공형"}
          {c.region ? " · " + c.region : ""}
        </span>
      </div>
      <div className="reward">
        {c.reward > 0 ? (
          <>
            리워드 <em>{money(c.reward)}</em>
            {c.benefit && <small> + 제품·서비스 제공</small>}
          </>
        ) : (
          c.benefit || "제품·서비스 제공"
        )}
      </div>
      <div className="count">
        <span>
          신청 <strong>{c.applicationCount}</strong> / 모집 {c.quantity}명
        </span>
        <span>{discoveryStates[c.status as keyof typeof discoveryStates]}</span>
      </div>
    </article>
  );
}
export default function CampaignBrowser({ home = false }: { home?: boolean }) {
  const [data, setData] = useState<{
      campaigns: CampaignSummary[];
      counts: { recruiting: number; selecting: number; active: number };
    } | null>(null),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [category, setCategory] = useState("all"),
    [channel, setChannel] = useState("all"),
    [fulfillment, setFulfillment] = useState("all"),
    [region, setRegion] = useState(""),
    [reward, setReward] = useState("all"),
    [status, setStatus] = useState("recruiting"),
    [sort, setSort] = useState("deadline"),
    [page, setPage] = useState(1),
    [savedOnly, setSavedOnly] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [ready, setReady] = useState(false);
  const favorites = useAccountFavorites(),
    savedIds = favorites.ids;
  const restored = useRef(false),
    fromHistory = useRef(true),
    previousFilters = useRef("");
  function readLocation() {
    const p = new URLSearchParams(location.search);
    setQ((p.get("q") || "").slice(0, 120));
    setCategory(
      Object.keys(campaignCategories).includes(p.get("category") || "")
        ? p.get("category")!
        : "all",
    );
    setChannel(
      ["all", ...Object.keys(channelNames)].includes(p.get("channel") || "")
        ? p.get("channel")!
        : "all",
    );
    setFulfillment(
      ["all", ...Object.keys(fulfillmentNames)].includes(
        p.get("fulfillment") || "",
      )
        ? p.get("fulfillment")!
        : "all",
    );
    setRegion((p.get("region") || "").slice(0, 100));
    setReward(
      ["all", "cash", "product"].includes(p.get("reward") || "")
        ? p.get("reward")!
        : "all",
    );
    setStatus(
      ["all", "recruiting", "selecting", "active", "completed"].includes(
        p.get("status") || "",
      )
        ? p.get("status")!
        : "recruiting",
    );
    setSort(
      ["deadline", "new", "reward"].includes(p.get("sort") || "")
        ? p.get("sort")!
        : "deadline",
    );
    setSavedOnly(p.get("saved") === "1");
    setPage(
      Math.max(1, Math.min(10000, Math.floor(Number(p.get("page"))) || 1)),
    );
    fromHistory.current = true;
    setReady(true);
  }
  function load() {
    setError("");
    marketFetch("/api/campaigns")
      .then(setData)
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    const old = new URLSearchParams(location.search).get("campaign");
    if (old && /^[a-f0-9-]{36}$/i.test(old)) {
      location.replace("/campaigns/" + old);
      return;
    }
    readLocation();
    load();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const signature = JSON.stringify([
      q,
      category,
      channel,
      fulfillment,
      region,
      reward,
      status,
      sort,
      savedOnly,
    ]);
    if (
      !fromHistory.current &&
      previousFilters.current &&
      previousFilters.current !== signature &&
      page !== 1
    ) {
      setPage(1);
      return;
    }
    previousFilters.current = signature;
    fromHistory.current = false;
    const p = new URLSearchParams();
    Object.entries({
      q,
      category,
      channel,
      fulfillment,
      region,
      reward,
      status,
      sort,
      saved: savedOnly ? "1" : "",
      page: String(page),
    }).forEach(([k, v]) => {
      const defaults: Record<string, string> = {
        category: "all",
        channel: "all",
        fulfillment: "all",
        reward: "all",
        status: "recruiting",
        sort: "deadline",
        page: "1",
      };
      if (v && v !== defaults[k]) p.set(k, v);
    });
    history.replaceState(
      history.state,
      "",
      location.pathname + (p.size ? "?" + p.toString() : ""),
    );
  }, [
    ready,
    q,
    category,
    channel,
    fulfillment,
    region,
    reward,
    status,
    sort,
    savedOnly,
    page,
  ]);
  useEffect(() => {
    if (!data || !ready || restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("om_campaign_scroll") || "null",
      );
      if (saved?.url === location.pathname + location.search)
        requestAnimationFrame(() => scrollTo(0, saved.y));
      sessionStorage.removeItem("om_campaign_scroll");
    } catch {}
  }, [data, ready]);
  const rows = useMemo(() => {
    const text = q.trim().toLocaleLowerCase();
    return (data?.campaigns || [])
      .filter(
        (c) =>
          (!text ||
            [c.title, c.brand, c.region]
              .join(" ")
              .toLocaleLowerCase()
              .includes(text)) &&
          (!savedOnly || savedIds.includes(c.id)) &&
          (category === "all" || c.category === category) &&
          (channel === "all" || c.types.includes(channel)) &&
          (fulfillment === "all" || c.fulfillment === fulfillment) &&
          (!region || c.region === region) &&
          (reward === "all" ||
            (reward === "cash" ? c.reward > 0 : !!c.benefit)) &&
          (status === "all" ||
            (status === "active"
              ? ["producing", "review"].includes(c.status)
              : c.status === status)),
      )
      .sort((a, b) =>
        sort === "new"
          ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
          : sort === "reward"
            ? b.reward - a.reward
            : Date.parse(a.deadline) - Date.parse(b.deadline),
      );
  }, [
    data,
    q,
    category,
    channel,
    fulfillment,
    region,
    reward,
    status,
    sort,
    savedOnly,
    savedIds,
  ]);
  const reset = () => {
    setSavedOnly(false);
    setQ("");
    setCategory("all");
    setChannel("all");
    setFulfillment("all");
    setRegion("");
    setReward("all");
    setStatus("recruiting");
    setSort("deadline");
  };
  const search = (
    <div className="search">
      <Search size={19} />
      <input
        aria-label="캠페인 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="캠페인명 또는 브랜드명 검색"
      />
    </div>
  );
  const categories = Object.entries(campaignCategories);
  const filters = (
    <div
      className={"filters " + (filtersOpen ? "filters-open" : "")}
      id="campaign-filters"
    >
      <div className="mobile-filter-options">
        <label>
          모집 상태
          <select
            aria-label="모집 상태 필터"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {[
              ["all", "상태 전체"],
              ["recruiting", "모집 중"],
              ["selecting", "선정 중"],
              ["active", "활동 중"],
              ["completed", "완료"],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          정렬
          <select
            aria-label="정렬 필터"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="deadline">마감 임박순</option>
            <option value="new">최신순</option>
            <option value="reward">리워드 높은 순</option>
          </select>
        </label>
      </div>
      <label className="saved-filter">
        <input
          type="checkbox"
          checked={savedOnly}
          onChange={(e) => setSavedOnly(e.target.checked)}
        />
        관심 캠페인
      </label>
      <select
        aria-label="진행 방식"
        value={fulfillment}
        onChange={(e) => setFulfillment(e.target.value)}
      >
        <option value="all">진행 방식 전체</option>
        {Object.entries(fulfillmentNames).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select
        aria-label="지역"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
      >
        <option value="">지역 전체</option>
        {Array.from(
          new Set(data?.campaigns.map((c) => c.region).filter(Boolean)),
        )
          .sort()
          .map((r) => (
            <option key={r}>{r}</option>
          ))}
      </select>
      <select
        aria-label="제공 내역"
        value={reward}
        onChange={(e) => setReward(e.target.value)}
      >
        <option value="all">제공 내역 전체</option>
        <option value="cash">현금 리워드</option>
        <option value="product">제품·서비스 제공</option>
      </select>
      <button onClick={reset}>조건 초기화</button>
    </div>
  );
  return (
    <PublicShell>
      <div className="campaign-experience">
        <div className="wrap">
          {home ? (
            <>
              <section className="homelead">
                <div>
                  <h1>모집 중인 캠페인</h1>
                  <p>제품 체험과 원고 게시 캠페인을 확인하세요.</p>
                </div>
                {search}
              </section>
              <div className="summarybar">
                {[
                  ["recruiting", "모집 중"],
                  ["selecting", "선정 중"],
                  ["active", "활동 중"],
                ].map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setStatus(k)}
                    aria-pressed={status === k}
                  >
                    {v}
                    <b>
                      {data ? data.counts[k as keyof typeof data.counts] : "—"}
                    </b>
                  </button>
                ))}
                <Link href="/campaigns">전체 캠페인 보기 →</Link>
              </div>
              <nav className="categories" aria-label="업종 카테고리">
                {categories.map(([k, v], i) => {
                  const Icon = icons[i];
                  return (
                    <button
                      className={"category " + (category === k ? "active" : "")}
                      key={k}
                      onClick={() => setCategory(k)}
                      aria-pressed={category === k}
                    >
                      <span className="circle">
                        <Icon size={20} />
                      </span>
                      {v}
                    </button>
                  );
                })}
              </nav>
            </>
          ) : null}
          <div className={home ? "" : "listing"}>
            {!home && (
              <aside className="rail">
                <h2>카테고리</h2>
                {categories.map(([k, v]) => (
                  <button
                    key={k}
                    className={category === k ? "active" : ""}
                    onClick={() => setCategory(k)}
                    aria-pressed={category === k}
                  >
                    {v}
                    <small>
                      {data?.campaigns.filter(
                        (c) =>
                          (k === "all" || c.category === k) &&
                          (status === "all" ||
                            (status === "active"
                              ? ["producing", "review"].includes(c.status)
                              : c.status === status)),
                      ).length || 0}
                    </small>
                  </button>
                ))}
                <h3>진행 상태</h3>
                {[
                  ["all", "전체"],
                  ["recruiting", "모집 중"],
                  ["selecting", "선정 중"],
                  ["active", "활동 중"],
                  ["completed", "완료"],
                ].map(([k, v]) => (
                  <button
                    key={k}
                    className={status === k ? "active" : ""}
                    onClick={() => setStatus(k)}
                    aria-pressed={status === k}
                  >
                    {v}
                  </button>
                ))}
                <div className="help">
                  <strong>처음 참여하시나요?</strong>가입과 지원 방법을 이용
                  가이드에 정리했어요.
                  <Link href="/guide">이용 가이드 보기 →</Link>
                </div>
              </aside>
            )}
            <section>
              {!home && (
                <>
                  <h1>캠페인 찾기</h1>
                  <p className="intro">
                    업종, 채널, 지역으로 캠페인을 검색할 수 있어요.
                  </p>
                  {search}
                  <div className="mobile-category">
                    <label>
                      카테고리
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {categories.map(([k, v]) => (
                          <option value={k} key={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
              <div className="toolbar">
                <div className="pills">
                  {[["all", "전체"], ...Object.entries(channelNames)].map(
                    ([k, v]) => (
                      <button
                        key={k}
                        className={"pill " + (channel === k ? "active" : "")}
                        onClick={() => setChannel(k)}
                        aria-pressed={channel === k}
                      >
                        {v}
                      </button>
                    ),
                  )}
                </div>
                <div className="right">
                  <select
                    aria-label="모집 상태"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">상태 전체</option>
                    <option value="recruiting">모집 중</option>
                    <option value="selecting">선정 중</option>
                    <option value="active">활동 중</option>
                    <option value="completed">완료</option>
                  </select>
                  <select
                    aria-label="정렬"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="deadline">마감 임박순</option>
                    <option value="new">최신순</option>
                    <option value="reward">리워드 높은 순</option>
                  </select>
                </div>
                <button
                  className="mobile-filter-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="campaign-filters"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <SlidersHorizontal size={17} />
                  필터
                  {[
                    fulfillment !== "all",
                    !!region,
                    reward !== "all",
                    savedOnly,
                  ].filter(Boolean).length
                    ? " · 적용됨"
                    : ""}
                </button>
              </div>
              {filters}
              {favorites.owner && favorites.legacy.length > 0 && (
                <div className="favorite-import">
                  <p>
                    이 브라우저에 이전 관심 캠페인 {favorites.legacy.length}개가
                    있어요.
                  </p>
                  <button
                    disabled={favorites.busy}
                    onClick={() => void favorites.importLegacy()}
                  >
                    계정으로 가져오기
                  </button>
                  <button onClick={favorites.dismissLegacy}>
                    계정 내용 유지
                  </button>
                </div>
              )}
              {favorites.error && (
                <p className="feedback" role="alert">
                  {favorites.error}
                  <button onClick={() => void favorites.refresh()}>
                    다시 확인
                  </button>
                </p>
              )}
              {savedOnly && !favorites.owner && (
                <p className="feedback">
                  관심 캠페인은 로그인 후 다른 기기에서도 확인할 수 있어요.{" "}
                  <Link href="/login">로그인</Link>
                </p>
              )}
              <div className="sectiontitle">
                <h2>
                  {home ? "전체 캠페인" : "검색 결과"}{" "}
                  <span className="blue">{rows.length}</span>
                </h2>
                {home && <Link href="/campaigns">전체 보기 →</Link>}
              </div>
              {error ? (
                <div className="empty" role="alert">
                  <p>{error}</p>
                  <button onClick={load}>다시 불러오기</button>
                </div>
              ) : !data ? (
                <p role="status">캠페인을 불러오는 중이에요.</p>
              ) : !rows.length ? (
                <div className="empty">
                  <Grid2X2 size={28} />
                  <h3>
                    {data.campaigns.length
                      ? "조건에 맞는 캠페인이 없어요."
                      : "아직 공개된 캠페인이 없어요."}
                  </h3>
                  <p>
                    {data.campaigns.length
                      ? "검색어와 필터를 바꾸거나 전체 캠페인을 확인해주세요."
                      : "모집이 시작되면 이곳에서 확인할 수 있어요."}
                  </p>
                  {data.campaigns.length ? (
                    <button onClick={reset}>조건 초기화</button>
                  ) : (
                    <Link className="btn" href="/marketing">
                      캠페인 등록
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid">
                  {rows
                    .slice((page - 1) * (home ? 8 : 9), page * (home ? 8 : 9))
                    .map((c) => (
                      <CampaignCard c={c} key={c.id} />
                    ))}
                </div>
              )}
              {rows.length > (home ? 8 : 9) && (
                <nav className="pagination" aria-label="결과 페이지">
                  {Array.from(
                    { length: Math.ceil(rows.length / (home ? 8 : 9)) },
                    (_, i) => (
                      <button
                        key={i}
                        className={page === i + 1 ? "active" : ""}
                        aria-current={page === i + 1 ? "page" : undefined}
                        onClick={() => setPage(i + 1)}
                      >
                        {i + 1}
                      </button>
                    ),
                  )}
                </nav>
              )}
            </section>
          </div>
          {home && (
            <div className="bottomcallout">
              <div>
                <h3>체험단을 모집하시나요?</h3>
                <p>모집 조건을 직접 정하거나 제작과 운영을 맡길 수 있어요.</p>
              </div>
              <Link className="btn" href="/marketing">
                캠페인 등록 <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
