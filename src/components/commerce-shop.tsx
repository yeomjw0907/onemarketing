"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import PublicShell from "./public-shell";
import { marketFetch } from "./market-public";
import {
  campaignQuote,
  money,
  policyVersion,
  productNames,
  type CampaignInput,
} from "@/lib/commerce-policy";
import s from "./platform.module.css";
const key = "om_campaign_cart_v1";
const future = (days: number) =>
  new Date(Date.now() + days * 86400000 + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
export default function CommerceShop() {
  const [cart, setCart] = useState<CampaignInput[]>([]),
    [loaded, setLoaded] = useState(false),
    [payment, setPayment] = useState<any>(null),
    [account, setAccount] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<any>(null),
    [kind, setKind] = useState<CampaignInput["kind"]>("self_cash");
  const request = useRef("");
  useEffect(() => {
    try {
      const old = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(old))
        setCart(old.map((x: unknown) => campaignQuote(x).input));
    } catch {}
    setLoaded(true);
    Promise.all([
      marketFetch("/api/commerce?mode=catalog"),
      marketFetch("/api/advertiser-auth"),
    ])
      .then(([p, a]) => {
        setPayment(p.payment);
        setAccount(a.account);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(key, JSON.stringify(cart));
      request.current = "";
    }
  }, [cart, loaded]);
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const row = campaignQuote({
        title: f.get("title"),
        brand: f.get("brand"),
        product: f.get("product"),
        guide: f.get("guide"),
        kind,
        channel: kind === "package" ? "bundle" : f.get("channel"),
        quantity: kind === "package" ? 5 : Number(f.get("quantity")),
        reward: kind === "self_cash" ? Number(f.get("reward")) : 0,
        benefit: f.get("benefit") || "",
        managed: f.get("managed") === "on",
        deadline: f.get("deadline"),
        submissionDeadline: f.get("submissionDeadline"),
      }).input;
      if (
        cart.some(
          (x) =>
            x.title.toLowerCase() === row.title.toLowerCase() &&
            x.brand.toLowerCase() === row.brand.toLowerCase(),
        )
      )
        throw new Error(
          "같은 캠페인이 이미 담겨 있습니다. 기존 구성을 삭제하고 수량·옵션을 합쳐 담아주세요.",
        );
      if (cart.length >= 10)
        throw new Error("한 주문에는 캠페인 10개까지 담을 수 있습니다.");
      setCart([...cart, row]);
      setReceipt(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const quotes = cart.map(campaignQuote),
    total = quotes.reduce((n, q) => n + q.total, 0);
  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    request.current ||= crypto.randomUUID();
    try {
      const r = await marketFetch("/api/commerce", {
        action: "checkout",
        data: {
          id: request.current,
          campaigns: cart,
          expectedTotal: total,
          policyVersion,
          consent: true,
        },
      });
      setReceipt(r);
      setCart([]);
      localStorage.removeItem(key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell>
      <section className={s.section}>
        <span className={s.eyebrow}>CAMPAIGN BUILDER</span>
        <h1>브랜드에 맞는 구성을 담으세요.</h1>
        <p>캠페인별로 모집과 제작·대행을 선택하고 한 번에 주문하세요.</p>
        <div className={s.columns}>
          <article className={s.offer}>
            <h2>현금 리워드 모집</h2>
            <strong>리워드의 10%</strong>
            <p>
              최소 운영비 5,000원. 콘텐츠는 광고주가 준비하고 직접
              선정·검수합니다.
            </p>
          </article>
          <article className={s.offer}>
            <h2>제품 제공형 모집</h2>
            <strong>완료 인당 3,000원</strong>
            <p>
              최소 운영비 5,000원. 제품·배송·매장 제공 비용은 광고주 부담입니다.
            </p>
          </article>
          <article className={s.offer}>
            <h2>제작·게시 패키지</h2>
            <strong>220,000원</strong>
            <p>
              공급가 200,000원 + VAT 20,000원. 5명에게 블로그 이미지 15장·원고
              5개·클립 5개 제작 및 게시. 최소 2주.
            </p>
          </article>
        </div>
        <p className={s.muted}>
          셀프 운영비와 대행비는 VAT 포함. 패키지에는 기본 게시 보수가 포함되며
          추가 셀프 운영비를 중복 청구하지 않습니다. 대행은 5명까지 60,000원,
          추가 인당 10,000원입니다.
        </p>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <section className={s.panel}>
          <h2>캠페인 구성</h2>
          <form className={s.form} onSubmit={add}>
            <label>
              상품
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as CampaignInput["kind"])
                }
              >
                {(["self_cash", "self_product", "package"] as const).map(
                  (x) => (
                    <option key={x} value={x}>
                      {productNames[x]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              캠페인 이름
              <input
                name="title"
                required
                minLength={2}
                maxLength={120}
                placeholder="성수점 신메뉴 홍보"
              />
            </label>
            <label>
              브랜드·매장
              <input name="brand" required maxLength={120} />
            </label>
            <label>
              제품·서비스
              <input name="product" required maxLength={300} />
            </label>
            {kind !== "package" && (
              <>
                <label>
                  게시 채널
                  <select name="channel">
                    <option value="blog">블로그</option>
                    <option value="clip">클립</option>
                    <option value="bundle">블로그 + 클립</option>
                  </select>
                </label>
                <label>
                  모집 인원
                  <input
                    type="number"
                    name="quantity"
                    min={1}
                    max={100}
                    defaultValue={5}
                    required
                  />
                </label>
              </>
            )}
            {kind === "self_cash" && (
              <label>
                1인당 현금 리워드
                <input
                  type="number"
                  name="reward"
                  min={1000}
                  max={1000000}
                  step={100}
                  defaultValue={20000}
                  required
                />
              </label>
            )}
            <label>
              제품·서비스 제공 혜택
              <input
                name="benefit"
                maxLength={500}
                required={kind === "self_product"}
                placeholder="제공 제품, 방문 혜택·별도 비용"
              />
            </label>
            <label>
              모집 마감
              <input
                type="date"
                name="deadline"
                defaultValue={future(7)}
                min={future(1)}
                required
              />
            </label>
            <label>
              콘텐츠 제출 마감
              <input
                type="date"
                name="submissionDeadline"
                defaultValue={future(21)}
                min={future(4)}
                required
              />
            </label>
            <label className={s.wide}>
              참여 가이드
              <textarea
                name="guide"
                required
                minLength={10}
                maxLength={5000}
                placeholder="제공 콘텐츠·실제 체험 여부·필수 표기·제출 조건·게시 유지 조건을 적어주세요."
              />
            </label>
            <label className={s.wide}>
              <span>
                <input type="checkbox" name="managed" /> 운영 대행 추가
              </span>
              <small>
                가이드 정리·선정·일정 조율·검수. 원래 가이드 내 수정 1회와
                재제출 확인, 참여자별 일정 변경 1회.
              </small>
            </label>
            <button className={s.primary}>장바구니에 담기</button>
          </form>
        </section>
        <section className={s.panel} id="cart">
          <h2>장바구니 · {cart.length}개 캠페인</h2>
          {!loaded ? (
            <p>장바구니를 불러오는 중…</p>
          ) : !cart.length ? (
            <p>위에서 구성한 캠페인을 담아주세요.</p>
          ) : (
            <>
              <p className={s.muted}>
                패키지 안의 모집·소재·배포는 포함 항목입니다. 같은 캠페인을 중복
                담을 수 없으며 대행은 캠페인별 한 번만 적용됩니다.
              </p>
              {quotes.map((q, i) => (
                <article className={s.list} key={i}>
                  <div className={s.row}>
                    <h3>
                      {q.input.brand} · {q.input.title}
                    </h3>
                    <button
                      onClick={() => setCart(cart.filter((_, n) => n !== i))}
                    >
                      구성 삭제
                    </button>
                  </div>
                  <p>
                    {productNames[q.input.kind]} · {q.input.quantity}명 · 모집{" "}
                    {q.input.deadline} / 제출 {q.input.submissionDeadline}
                  </p>
                  {q.lines.map((l) => (
                    <div className={s.row} key={l.key}>
                      <span>{l.label}</span>
                      <strong>{money(l.amount)}</strong>
                    </div>
                  ))}
                  <p>
                    캠페인 합계 <strong>{money(q.total)}</strong>
                  </p>
                </article>
              ))}
              <h3>전체 결제 예정액 {money(total)}</h3>
              {!account ? (
                <p>
                  <Link href="/login">광고주 로그인</Link> 후 주문하세요.
                  장바구니는 이 브라우저에 보관됩니다.
                </p>
              ) : !payment?.enabled ? (
                <p>
                  결제 계좌를 준비 중입니다. 구성은 보관되며 지금은 결제되지
                  않습니다.
                </p>
              ) : (
                <form onSubmit={pay}>
                  <p>
                    계좌이체 · {payment.bank} {payment.account} ·{" "}
                    {payment.holder}
                  </p>
                  <p>
                    주문 접수 후 이체하고 관리자 입금 확인을 기다려주세요.
                    미확인 주문은 모집·제작을 시작하지 않습니다.
                  </p>
                  <label>
                    <input type="checkbox" required /> 상품 구성·가격·일정과{" "}
                    <Link href="/policy" target="_blank">
                      이용·환불 기준
                    </Link>
                    을 확인하고 주문에 동의합니다.
                  </label>
                  <div className={s.actions}>
                    <button className={s.primary} disabled={busy}>
                      {busy ? "접수 중…" : `${money(total)} 계좌이체 주문하기`}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {receipt && (
            <div role="status" className={s.notice}>
              <h3>주문을 접수했습니다. 아직 입금 확인 전입니다.</h3>
              <p>주문번호 {receipt.id}</p>
              <p>
                {receipt.data.bank.bank} {receipt.data.bank.account} ·{" "}
                {receipt.data.bank.holder}
              </p>
              <p>
                이체 금액 {money(receipt.data.total)} · 입금 시 주문번호 끝
                8자리를 함께 알려주세요.
              </p>
              <Link href="/advertisers">주문·입금 현황 보기 →</Link>
            </div>
          )}
        </section>
        <p>
          <Link href="/marketing/legacy">기존 개별 견적 상품 신청</Link> ·{" "}
          <Link href="/policy">구매·환불 안내</Link>
        </p>
      </section>
    </PublicShell>
  );
}
