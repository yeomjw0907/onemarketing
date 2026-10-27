"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import AdvertiserSignup from "./advertiser-signup";
import styles from "./market.module.css";
import PublicShell from "./public-shell";
import { CommerceOpportunities } from "./commerce-participant";
type Row = Record<string, any>;
const money = (n: number) => n.toLocaleString("ko-KR") + "원";
const labels: Record<string, string> = {
  blog: "블로그",
  clip: "클립",
  bundle: "블로그 + 클립",
  new: "접수 완료",
  quoted: "견적 준비",
  rejected: "미선정",
  applied: "지원 완료",
  selected: "선정 · 수락 대기",
  proposed: "선정 · 수락 대기",
  accepted: "참여 확정",
  declined: "제안 거절",
  expired: "제안 만료",
  withdrawn: "지원 철회",
};
const stage: Record<string, string> = {
  materials: "자료 확인",
  planning: "기획",
  brief_review: "기획 검토",
  producing: "콘텐츠 제작",
  review: "콘텐츠 검수",
  ready: "게시 준비",
  publishing: "게시 진행",
  completed: "완료",
  cancelled: "취소",
  verified: "게시 확인 완료",
  delivered: "자료 전달 완료",
  submitted: "게시 확인 중",
  queued: "준비 중",
  pending: "준비 중",
  draft: "초안",
  planned: "일정 준비",
  created: "접수",
};
import { marketFetch } from "./public-fetch";
export { marketFetch } from "./public-fetch";
function Shell({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <div className={styles.body}>{children}</div>
    </PublicShell>
  );
}
function Account({
  account,
  onChange,
  initialRegister = false,
}: {
  account: Row | null;
  onChange: (a: Row | null) => void;
  initialRegister?: boolean;
}) {
  const [register, setRegister] = useState(initialRegister),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [social, setSocial] = useState(false),
    [kakaoEnabled, setKakaoEnabled] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("loginError"))
      setError("카카오 로그인이 취소되었거나 만료됐어요. 다시 시도해주세요.");
    marketFetch("/api/advertiser-auth")
      .then((d) => {
        setSocial(d.kakaoPending);
        setKakaoEnabled(d.kakaoEnabled);
        if (d.kakaoPending) setRegister(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function kakaoLogin() {
    setBusy(true);
    setError("");
    try {
      const d = await marketFetch("/api/auth/kakao/start", {
        role: "advertiser",
      });
      location.assign(d.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (account)
    return (
      <div className={styles.row}>
        <p>
          {account.name}님 · {account.email}
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await marketFetch("/api/advertiser-auth", { action: "logout" });
              onChange(null);
              setSocial(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          로그아웃
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const kakao =
    kakaoEnabled && !social ? (
      <button
        type="button"
        className={styles.kakao}
        disabled={busy}
        onClick={() => void kakaoLogin()}
      >
        카카오로 가입·로그인
      </button>
    ) : null;
  if (register)
    return (
      <AdvertiserSignup
        social={social}
        onComplete={onChange}
        onLogin={() => {
          setError("");
          setRegister(false);
        }}
        kakao={kakao}
        externalError={error}
      />
    );
  return (
    <section className={styles.panel}>
      <h2>{social ? "기존 계정에 카카오 연결" : "광고주 로그인"}</h2>
      <p className={styles.muted}>
        {social
          ? "기존 이메일·비밀번호로 본인 확인 후 연결해요."
          : "신청 내역과 캠페인 진행 상황을 확인하세요."}
      </p>
      {kakao}
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const d = await marketFetch("/api/advertiser-auth", {
              action: social ? "social-link" : "login",
              email: f.get("email"),
              password: f.get("password"),
            });
            onChange(d.account);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          이메일
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={254}
          />
        </label>
        <label>
          비밀번호
          <input
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="current-password"
          />
        </label>
        <div className={`${styles.row} ${styles.wide}`}>
          <button className={styles.primary} disabled={busy}>
            {busy ? "확인 중…" : social ? "카카오 연결하기" : "로그인"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setRegister(true);
            }}
          >
            처음이라면 회원가입
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
export function AdvertiserAccess({
  register = false,
  returnTo = "",
}: {
  register?: boolean;
  returnTo?: string;
}) {
  const [account, setAccount] = useState<Row | null>(null);
  useEffect(() => {
    marketFetch("/api/advertiser-auth")
      .then((d) => setAccount(d.account))
      .catch(() => {});
  }, []);
  return (
    <>
      <Account
        account={account}
        onChange={(a) => {
          setAccount(a);
          window.dispatchEvent(new Event("om-auth-change"));
          if (
            a &&
            (returnTo === "/marketing" ||
              /^\/campaigns\/[a-f0-9-]{36}$/.test(returnTo))
          )
            location.assign(returnTo);
        }}
        initialRegister={register}
      />
      {account && <Link href="/advertisers">광고주 마이페이지로 이동 →</Link>}
    </>
  );
}
export function MarketingShop({
  ordersOnly = false,
}: {
  ordersOnly?: boolean;
}) {
  const [products, setProducts] = useState<Row[]>([]),
    [account, setAccount] = useState<Row | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [orders, setOrders] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [quantity, setQuantity] = useState(1);
  const key = useRef("");
  useEffect(() => {
    Promise.all([
      marketFetch("/api/market?mode=catalog"),
      marketFetch("/api/advertiser-auth"),
    ])
      .then(([p, a]) => {
        setProducts(p);
        setAccount(a.account);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (account)
      marketFetch("/api/market?mode=orders")
        .then(setOrders)
        .catch((e) => setError(e.message));
    else setOrders([]);
  }, [account]);
  async function order(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    key.current ||= crypto.randomUUID();
    try {
      await marketFetch("/api/market", {
        action: "order",
        data: {
          id: key.current,
          catalogId: selected.id,
          catalogVersion: selected.version,
          expectedUnit: selected.unit,
          quantity,
          brand: f.get("brand"),
          product: f.get("product"),
          productUrl: f.get("productUrl"),
          start: f.get("start"),
          end: f.get("end"),
          notes: f.get("notes"),
          consent: f.get("consent") === "on",
        },
      });
      key.current = "";
      setNotice(
        "신청을 접수했습니다. 내 신청 내역에서 진행 상황을 확인해주세요.",
      );
      setSelected(null);
      setOrders(await marketFetch("/api/market?mode=orders"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>
          {ordersOnly ? "MY CAMPAIGNS" : "MARKETING SERVICES"}
        </span>
        <h1>
          {ordersOnly
            ? "신청부터 게시 결과까지,\n한곳에서 확인하세요."
            : "브랜드에 필요한 콘텐츠,\n직접 고르고 신청하세요."}
        </h1>
        <p>
          블로그 원고·이미지와 클립 영상을 원마케팅이 제작하고, 참여자가 안내에
          따라 게시합니다.
        </p>
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
      {!ordersOnly && (
        <>
          {loading ? (
            <p>상품을 불러오는 중…</p>
          ) : !products.length ? (
            <p className={styles.empty}>
              공개된 상품을 준비하고 있어요. 문의: yeomjw0907@onecation.co.kr
            </p>
          ) : (
            <div className={styles.grid}>
              {products.map((p) => (
                <article className={styles.item} key={p.id}>
                  <span className={styles.tag}>{labels[p.type]}</span>
                  <h2>{p.title}</h2>
                  <p>{p.description}</p>
                  <strong>
                    {money(p.unit)}{" "}
                    <small className={styles.muted}>/ 건 · VAT 별도</small>
                  </strong>
                  <button
                    className={styles.primary}
                    onClick={() => {
                      setSelected(p);
                      setQuantity(1);
                      key.current = "";
                      setNotice("");
                      requestAnimationFrame(() =>
                        document
                          .getElementById("product-detail")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      );
                    }}
                  >
                    구성 확인·신청
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {selected && (
        <section
          id="product-detail"
          className={styles.panel}
          aria-label="선택한 상품 상세"
        >
          <h2>{selected.title}</h2>
          <p className={styles.detail}>{selected.details}</p>
          <p>
            상품 내용과 희망 일정을 확인한 후 최종 견적과 진행 조건을
            안내합니다. 신청만으로 결제되거나 제작이 시작되지 않습니다.
          </p>
          {account && (
            <form className={styles.form} onSubmit={order}>
              <label>
                브랜드·업체명
                <input name="brand" required maxLength={200} />
              </label>
              <label>
                홍보할 제품·서비스
                <input name="product" required maxLength={200} />
              </label>
              <label className={styles.wide}>
                제품·매장 웹 주소
                <input
                  name="productUrl"
                  type="url"
                  required
                  maxLength={2000}
                  placeholder="https://"
                />
              </label>
              <label>
                수량 · 묶음은 세트 기준
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
              <p>
                예상 합계{" "}
                <strong>
                  {money(
                    selected.unit * quantity +
                      Math.round(selected.unit * quantity * 0.1),
                  )}
                </strong>
                <br />
                <small>부가세 10% 포함</small>
              </p>
              <label>
                희망 시작일
                <input name="start" type="date" required />
              </label>
              <label>
                희망 종료일
                <input name="end" type="date" required />
              </label>
              <label className={styles.wide}>
                제품 특징·요청사항
                <textarea name="notes" maxLength={3000} />
              </label>
              <label className={`${styles.wide} ${styles.check}`}>
                <input required type="checkbox" name="consent" />
                신청 검토·연락·계약 진행을 위한 업체명, 제품 정보와 요청사항
                수집에 동의합니다. 미계약 신청 정보는 접수일로부터 1년
                보관합니다.
              </label>
              <button disabled={busy} className={styles.primary}>
                {busy ? "접수 중…" : "이 구성으로 신청하기"}
              </button>
            </form>
          )}
        </section>
      )}
      {(ordersOnly || selected) && !loading && (
        <Account account={account} onChange={setAccount} />
      )}
      {account && (
        <section className={styles.panel}>
          <h2>내 신청·진행 내역</h2>
          {!orders.length && (
            <p className={styles.empty}>
              아직 신청한 상품이 없어요.{" "}
              <Link href="/marketing">상품 둘러보기</Link>
            </p>
          )}
          {orders.map((o) => (
            <article className={styles.list} key={o.id}>
              <span className={styles.tag}>
                {o.status === "rejected"
                  ? "신청 반려"
                  : labels[o.status] || "진행 확인 중"}
              </span>
              <h3>
                {o.brand} · {o.title}
              </h3>
              <p>
                {o.product} · {o.quantity}건 · 신청 금액 {money(o.total)} (VAT
                포함)
              </p>
              <p>{o.note}</p>
              {o.quote && (
                <p>
                  견적 {o.quote.status === "confirmed" ? "확정" : "확인 중"} ·{" "}
                  {money(o.quote.total)}
                </p>
              )}
              {o.project && (
                <>
                  <p>
                    진행: {stage[o.project.status] || "진행 확인 중"} · 마감{" "}
                    {o.project.due}
                  </p>
                  {o.project.tasks.map((t: Row, i: number) => (
                    <p key={i}>
                      {labels[t.channel]} · {stage[t.status] || "진행 확인 중"}
                      {t.link && /^https?:\/\//i.test(t.link) && (
                        <>
                          {" "}
                          ·{" "}
                          <a href={t.link} target="_blank" rel="noreferrer">
                            게시 결과 보기
                          </a>
                        </>
                      )}
                    </p>
                  ))}
                </>
              )}
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}
export function CampaignApplications() {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = () => marketFetch("/api/market?mode=applications").then(setRows);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section>
      <h2>내 지원 현황</h2>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>지원 내역을 불러오는 중…</p>
      ) : !rows.length ? (
        <p>
          지원한 캠페인이 없습니다.{" "}
          <Link href="/campaigns">캠페인 둘러보기</Link>
        </p>
      ) : (
        rows.map((r) => (
          <article className={styles.list} key={r.id}>
            <h3>{r.title}</h3>
            <p>
              {labels[r.type]} · {labels[r.status] || r.status}
            </p>
            <p>{r.note}</p>
            {r.status === "applied" && (
              <button
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("지원을 철회할까요?")) return;
                  setBusy(true);
                  try {
                    await marketFetch("/api/market", {
                      action: "withdraw",
                      id: r.id,
                      version: r.version,
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                지원 철회
              </button>
            )}
            {r.offerId && (
              <Link href="/participants/portal">제안 확인·수락하기</Link>
            )}
          </article>
        ))
      )}
    </section>
  );
}
export function CampaignMarket() {
  const [campaigns, setCampaigns] = useState<Row[]>([]),
    [member, setMember] = useState<Row | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    marketFetch("/api/market?mode=campaigns")
      .then((rows) => {
        setCampaigns(rows);
        const id = new URL(location.href).searchParams.get("campaign");
        if (id) setSelected(rows.find((r: Row) => r.id === id) || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    marketFetch("/api/participant-portal")
      .then((d) => setMember(d.participant))
      .catch(() => {});
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await marketFetch("/api/market", {
        action: "apply",
        data: {
          campaignId: selected.id,
          type: f.get("type"),
          ...(f.get("blogAccountId")
            ? { blogAccountId: f.get("blogAccountId") }
            : {}),
          ...(f.get("clipAccountId")
            ? { clipAccountId: f.get("clipAccountId") }
            : {}),
          message: f.get("message"),
          consent: f.get("consent") === "on",
        },
      });
      setNotice(
        "지원했습니다. 선정되면 나의 작업에서 제안을 확인하고 수락해주세요.",
      );
      setSelected(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>CREATOR CAMPAIGNS</span>
        <h1>
          내 채널에 맞는 캠페인을
          <br />
          직접 골라보세요.
        </h1>
        <p>
          추천받은 제안도, 직접 찾은 캠페인도 나의 작업에서 이어갈 수 있어요.
          캠페인마다 제작 방식과 제공 자료를 확인해주세요.
        </p>
      </div>
      <CommerceOpportunities />
      <div className={styles.row}>
        <label>
          채널{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">전체</option>
            <option value="blog">블로그</option>
            <option value="clip">클립</option>
            <option value="bundle">블로그 + 클립</option>
          </select>
        </label>
        <label>
          캠페인 검색{" "}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름·설명으로 찾기"
          />
        </label>
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
      <section className={styles.panel}>
        {loading ? (
          <p>캠페인을 불러오는 중…</p>
        ) : (
          <div className={styles.grid}>
            {campaigns
              .filter(
                (c) =>
                  (filter === "all" || c.types.includes(filter)) &&
                  (c.title + " " + c.description)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((c) => (
                <article className={styles.item} key={c.id}>
                  <span className={styles.tag}>
                    {c.types.map((t: string) => labels[t]).join(" / ") ||
                      "모집 정원 마감"}
                  </span>
                  <h2>{c.title}</h2>
                  <p>{c.description}</p>
                  <p>
                    모집 마감 {c.deadline}
                    <br />
                    게시 마감 {c.due} · 현재 모집 가능 {c.remaining}자리
                  </p>
                  <p>
                    기본 원고료: 블로그·클립 각 {money(c.rewards.blog)}
                    <br />
                    묶음 {money(c.rewards.bundle)} · 최종 약정액은 제안에서 확인
                  </p>
                  <button
                    disabled={!c.remaining}
                    className={styles.primary}
                    onClick={() => {
                      setSelected(c);
                      setNotice("");
                      requestAnimationFrame(() =>
                        document
                          .getElementById("campaign-detail")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      );
                    }}
                  >
                    조건 확인·지원
                  </button>
                </article>
              ))}
          </div>
        )}
        {!loading && !campaigns.length && (
          <p className={styles.empty}>
            현재 공개 모집 중인 캠페인이 없어요. 추천 제안은{" "}
            <Link href="/participants/portal">나의 작업</Link>에서 확인하세요.
          </p>
        )}
      </section>
      {selected && (
        <section id="campaign-detail" className={styles.panel}>
          <h2>{selected.title}</h2>
          <p className={styles.detail}>{selected.guide}</p>
          <p>
            모집 마감 {selected.deadline} · 게시 마감 {selected.due}
          </p>
          <p>
            지원 후 운영자 선정과 조건 수락이 필요합니다. 콘텐츠 확인·게시·링크
            제출 후 검수와 원고료 지급이 진행됩니다. 게시 유지 기간은 90일이며
            상세 약정은 제안에서 확인하세요.
          </p>
          {!member ? (
            <p>
              <Link
                href="/participants/portal"
                onClick={() =>
                  sessionStorage.setItem("om_campaign_return", selected.id)
                }
              >
                로그인하고 지원하기
              </Link>{" "}
              · <Link href="/participants/apply">체험단 회원가입</Link>
            </p>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              <label>
                지원 유형
                <select name="type" required>
                  {selected.types.map((t: string) => (
                    <option key={t} value={t}>
                      {labels[t]}
                    </option>
                  ))}
                </select>
              </label>
              {["blog", "clip"].map((channel) => (
                <label key={channel}>
                  {labels[channel]} 활동 계정
                  <select name={channel + "AccountId"}>
                    <option value="">해당 채널 미지원</option>
                    {member.accounts
                      .filter(
                        (a: Row) =>
                          a.approvalStatus !== "pending" &&
                          a.approvalStatus !== "rejected" &&
                          (a.channel === channel ||
                            (channel === "clip" && a.channel === "blog")),
                      )
                      .map((a: Row) => (
                        <option key={a.id} value={a.id}>
                          {a.label || a.url}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label className={styles.wide}>
                지원 한마디
                <textarea name="message" maxLength={1000} />
              </label>
              <label className={`${styles.wide} ${styles.check}`}>
                <input type="checkbox" required name="consent" />
                모집 조건을 확인했으며 선정 후 최종 약정 조건을 수락해야 참여가
                확정됨을 이해합니다.
              </label>
              <button className={styles.primary} disabled={busy}>
                {busy ? "지원 중…" : "캠페인 지원하기"}
              </button>
            </form>
          )}
        </section>
      )}
      {member && <CampaignApplications key={refresh} />}
    </Shell>
  );
}
