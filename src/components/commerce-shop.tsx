"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import useAccountBuilder from "./use-account-builder";
import type { Dispatch, SetStateAction } from "react";
import PublicShell from "./public-shell";
import { marketFetch } from "./public-fetch";
import {
  campaignQuote,
  money,
  productNames,
  type CampaignInput,
} from "@/lib/commerce-policy";
import { campaignCategories, fulfillmentNames } from "@/lib/campaign-display";
import s from "./platform.module.css";
const future = (days: number) =>
  new Date(Date.now() + days * 86400000 + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
function fresh(): CampaignInput {
  return {
    title: "",
    brand: "",
    product: "",
    guide: "",
    kind: "self_cash",
    channel: "blog",
    quantity: 5,
    reward: 20000,
    benefit: "",
    managed: false,
    deadline: future(7),
    submissionDeadline: future(21),
    category: "other",
    fulfillment: "provided",
    region: "",
    imageUrl: "",
  };
}
function normalized(d: CampaignInput) {
  return {
    ...d,
    channel: d.kind === "package" ? "bundle" : d.channel,
    quantity: d.kind === "package" ? 5 : d.quantity,
    reward: d.kind === "self_cash" ? d.reward : 0,
    fulfillment: d.kind === "package" ? "provided" : d.fulfillment,
  } as CampaignInput;
}
const steps = ["상품 선택", "기본 정보", "인원·일정·가이드", "확인"];
export default function CommerceShop() {
  const workspace = useAccountBuilder(() => ({
    draft: fresh(),
    cart: [],
    step: 0,
    editing: null,
  }));
  const { draft, cart, step, editing } = workspace.value;
  const loaded = workspace.ready,
    saved = ["saved", "local"].includes(workspace.status);
  const setDraft: Dispatch<SetStateAction<CampaignInput>> = (v) =>
    workspace.setValue((p) => ({
      ...p,
      draft: typeof v === "function" ? v(p.draft) : v,
    }));
  const setCart: Dispatch<SetStateAction<CampaignInput[]>> = (v) =>
    workspace.setValue((p) => ({
      ...p,
      cart: typeof v === "function" ? v(p.cart) : v,
    }));
  const setStep: Dispatch<SetStateAction<number>> = (v) =>
    workspace.setValue((p) => ({
      ...p,
      step: typeof v === "function" ? v(p.step) : v,
    }));
  const setEditing: Dispatch<SetStateAction<number | null>> = (v) =>
    workspace.setValue((p) => ({
      ...p,
      editing: typeof v === "function" ? v(p.editing) : v,
    }));
  const [payment, setPayment] = useState<any>(null),
    [account, setAccount] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [receipt, setReceipt] = useState<any>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    setReceipt(null);
    setNotice("");
    setError("");
    setAccount(null);
    setPayment(null);
    Promise.all([
      marketFetch("/api/commerce?mode=catalog"),
      marketFetch("/api/advertiser-auth"),
    ])
      .then(([p, a]) => {
        if (!active) return;
        setPayment(p.payment);
        setAccount(a.account);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [workspace.owner]);
  function update<K extends keyof CampaignInput>(
    key: K,
    value: CampaignInput[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
  }
  function move(n: number) {
    setStep(n);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  let preview: ReturnType<typeof campaignQuote> | null = null;
  try {
    preview = campaignQuote(
      normalized({
        ...draft,
        title: draft.title || "캠페인",
        brand: draft.brand || "브랜드",
        product: draft.product || "제품",
        guide: draft.guide || "캠페인 가이드를 입력해주세요.",
      }),
    );
  } catch {}
  const quotes = cart.map(campaignQuote),
    total = quotes.reduce((n, q) => n + q.total, 0);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      if (step < 2) {
        move(step + 1);
        return;
      }
      const row = campaignQuote(normalized(draft)).input;
      if (row.deadline < future(1))
        throw Error("모집 마감은 내일 이후로 선택해주세요.");
      if (
        row.kind === "package" &&
        Date.parse(row.submissionDeadline + "T23:59:59+09:00") - Date.now() <
          14 * 86400000
      )
        throw Error("패키지는 최소 2주 일정으로 신청해주세요.");
      if (step === 2) {
        move(3);
        return;
      }
      if (
        cart.some(
          (x, i) =>
            i !== editing &&
            x.title.toLowerCase() === row.title.toLowerCase() &&
            x.brand.toLowerCase() === row.brand.toLowerCase(),
        )
      )
        throw Error(
          "같은 캠페인이 이미 있어요. 장바구니에서 기존 구성을 수정해주세요.",
        );
      if (editing === null && cart.length >= 10)
        throw Error("한 주문에는 캠페인 10개까지 담을 수 있어요.");
      setCart(
        editing === null
          ? [...cart, row]
          : cart.map((x, i) => (i === editing ? row : x)),
      );
      setNotice(
        editing === null
          ? "캠페인을 장바구니에 담았어요."
          : "장바구니 구성을 수정했어요.",
      );
      setEditing(null);
      setReceipt(null);
      setDraft(fresh());
      setStep(0);
      document.getElementById("cart")?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError((e as any).issues?.[0]?.message || (e as Error).message);
    }
  }
  async function upload(file: File) {
    if (file.size > 3 * 1024 * 1024) {
      setError("이미지는 3MB 이하로 올려주세요.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const f = new FormData();
      f.set("file", file);
      const r = await fetch("/api/campaign-media", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      update("imageUrl", d.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || editing !== null) return;
    setBusy(true);
    setError("");
    try {
      const r = await workspace.checkout(total);
      setReceipt(r);

      setNotice(
        "주문을 접수했어요. 안내 계좌로 입금한 뒤 확인을 기다려주세요.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const text = (
    key: keyof CampaignInput,
    label: string,
    required = false,
    type = "text",
    maxLength = 120,
  ) => (
    <label>
      {label}
      <input
        name={key}
        type={type}
        value={String(draft[key] ?? "")}
        onChange={(e) => update(key, e.target.value as never)}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
  return (
    <PublicShell>
      <section className={s.section + " campaign-builder"}>
        <div className={s.row}>
          <div>
            <h1>캠페인 등록</h1>
            <p>
              상품을 고르고 캠페인을 구성해주세요. 입금 확인 후 모집이 시작돼요.
            </p>
          </div>
          <a className="builder-cart-link" href="#cart">
            장바구니 {cart.length}
          </a>
        </div>
        <div className="workspace-sync" aria-live="polite">
          <strong>{workspace.owner ? "계정 연동" : "로그인 전 작성"}</strong>
          <p>
            {workspace.owner
              ? "초안과 장바구니를 계정에 저장해 다른 기기에서도 이어서 작성할 수 있어요."
              : "지금은 이 브라우저에 저장돼요. 로그인 후 계정으로 가져올 수 있어요."}
          </p>
          {workspace.legacy && workspace.owner && (
            <div>
              <p>
                이 브라우저에 이전 작성 내용이 있어요. 가져오면 계정의 현재
                초안과 장바구니를 대체해요.
              </p>
              <button onClick={workspace.importLegacy}>
                브라우저 내용을 계정으로 가져오기
              </button>
              <button onClick={workspace.dismissLegacy}>계정 내용 유지</button>
            </div>
          )}
          {workspace.conflict && (
            <div role="alert">
              <p>
                다른 기기에서 변경한 내용이 있어요. 현재 작성 내용은 이
                브라우저에 보관했어요.
              </p>
              <button
                onClick={() =>
                  void workspace.reload().catch((e) => setError(e.message))
                }
              >
                계정 내용 불러오기
              </button>
              <button
                onClick={() =>
                  void workspace.overwrite().catch((e) => setError(e.message))
                }
              >
                현재 내용으로 계정 저장
              </button>
            </div>
          )}
          {workspace.error && !workspace.conflict && (
            <div role="alert">
              <p>{workspace.error}</p>
              <button
                onClick={() =>
                  void workspace.retry().catch((e) => setError(e.message))
                }
              >
                저장 다시 시도
              </button>
              <button
                onClick={() =>
                  void workspace.reload().catch((e) => setError(e.message))
                }
              >
                계정 내용 불러오기
              </button>
            </div>
          )}
        </div>
        <div className="builder-layout">
          <section
            className={s.panel + " builder-main"}
            aria-label="캠페인 작성"
          >
            <ol className="builder-steps">
              {steps.map((label, i) => (
                <li key={label} aria-current={step === i ? "step" : undefined}>
                  <button
                    type="button"
                    disabled={i > step}
                    onClick={() => move(i)}
                  >
                    <span>{i + 1}</span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
            <div className={s.row}>
              <h2 ref={heading} tabIndex={-1}>
                {editing !== null ? "구성 수정 · " : ""}
                {steps[step]}
              </h2>
              <small role="status">
                {!loaded
                  ? "불러오는 중…"
                  : workspace.owner
                    ? saved
                      ? "계정에 저장됨"
                      : workspace.status === "conflict"
                        ? "변경 내용 확인 필요"
                        : workspace.status === "error"
                          ? "저장 실패 · 다시 시도"
                          : "계정에 저장 중…"
                    : saved
                      ? "이 브라우저에 저장됨"
                      : "저장 중…"}
              </small>
            </div>
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className={s.notice} role="status">
                {notice}
              </p>
            )}
            <form onSubmit={submit}>
              {step === 0 && (
                <div className="product-choices">
                  {(["self_cash", "self_product", "package"] as const).map(
                    (kind) => (
                      <button
                        type="button"
                        key={kind}
                        aria-pressed={draft.kind === kind}
                        onClick={() => update("kind", kind)}
                      >
                        <strong>{productNames[kind]}</strong>
                        <b>
                          {kind === "self_cash"
                            ? "리워드의 10%"
                            : kind === "self_product"
                              ? "완료 인당 3,000원"
                              : "220,000원"}
                        </b>
                        <span>
                          {kind === "package"
                            ? "5명 · 블로그 이미지 15장·원고 5개·클립 5개 제작·게시, 최소 2주"
                            : kind === "self_cash"
                              ? "콘텐츠는 광고주가 준비하고 직접 선정·검수해요. 최소 운영비 5,000원"
                              : "제품·배송·매장 제공 비용은 별도예요. 최소 운영비 5,000원"}
                        </span>
                      </button>
                    ),
                  )}
                  <p className={s.muted}>
                    표시 금액은 VAT 포함. 패키지는 공급가 200,000원 + VAT
                    20,000원이며 기본 게시 리워드를 포함해요.
                  </p>
                </div>
              )}
              {step === 1 && (
                <div className={s.form}>
                  {text("title", "캠페인 이름", true)}
                  {text("brand", "브랜드·매장", true)}
                  {text("product", "제품·서비스", true, "text", 300)}
                  <label>
                    업종
                    <select
                      value={draft.category}
                      onChange={(e) =>
                        update("category", e.target.value as any)
                      }
                    >
                      {Object.entries(campaignCategories)
                        .filter(([k]) => k !== "all")
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    진행 방식
                    <select
                      value={
                        draft.kind === "package"
                          ? "provided"
                          : draft.fulfillment
                      }
                      disabled={draft.kind === "package"}
                      onChange={(e) =>
                        update("fulfillment", e.target.value as any)
                      }
                    >
                      {Object.entries(fulfillmentNames).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.fulfillment === "visit" &&
                    draft.kind !== "package" &&
                    text("region", "방문 지역", false, "text", 100)}
                  <div className={s.wide + " image-picker"}>
                    <strong>
                      대표 이미지 <small>선택</small>
                    </strong>
                    <p>
                      사용 권한이 있는 JPG·PNG·WebP 이미지를 올려주세요. 최대
                      3MB.
                    </p>
                    {account ? (
                      <label className="upload-control">
                        {uploading ? "이미지 올리는 중…" : "이미지 선택"}
                        <input
                          aria-label="대표 이미지 파일"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <p>
                        <Link href="/login?role=advertiser&next=%2Fmarketing">
                          광고주 로그인 후 이미지 올리기
                        </Link>{" "}
                        · 초안은 보관되며 로그인 후 가져올 수 있어요.
                      </p>
                    )}
                    <details>
                      <summary>이미지 주소로 등록</summary>
                      {text(
                        "imageUrl",
                        "HTTPS 이미지 주소",
                        false,
                        "text",
                        2000,
                      )}
                    </details>
                    {draft.imageUrl && (
                      <div className="image-preview">
                        <img
                          src={draft.imageUrl}
                          alt="대표 이미지 미리보기"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => update("imageUrl", "")}
                        >
                          이미지 해제
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className={s.form}>
                  {draft.kind !== "package" && (
                    <>
                      <label>
                        게시 채널
                        <select
                          name="channel"
                          value={draft.channel}
                          onChange={(e) =>
                            update("channel", e.target.value as any)
                          }
                        >
                          <option value="blog">블로그</option>
                          <option value="clip">클립</option>
                          <option value="bundle">블로그 + 클립</option>
                        </select>
                      </label>
                      <label>
                        모집 인원
                        <input
                          name="quantity"
                          type="number"
                          required
                          min={1}
                          max={100}
                          value={draft.quantity}
                          onChange={(e) =>
                            update("quantity", Number(e.target.value))
                          }
                        />
                      </label>
                    </>
                  )}
                  {draft.kind === "self_cash" && (
                    <label>
                      1인당 현금 리워드
                      <input
                        name="reward"
                        type="number"
                        min={1000}
                        max={1000000}
                        step={100}
                        required
                        value={draft.reward}
                        onChange={(e) =>
                          update("reward", Number(e.target.value))
                        }
                      />
                    </label>
                  )}
                  {text(
                    "benefit",
                    "제품·서비스 제공 혜택",
                    draft.kind === "self_product",
                    "text",
                    500,
                  )}
                  {text("deadline", "모집 마감", true, "date")}
                  {text("submissionDeadline", "콘텐츠 제출 마감", true, "date")}
                  <label className={s.wide}>
                    참여 가이드
                    <textarea
                      name="guide"
                      required
                      minLength={10}
                      maxLength={5000}
                      value={draft.guide}
                      onChange={(e) => update("guide", e.target.value)}
                      placeholder="제공 자료·체험 여부·광고 표기·제출·게시 유지 조건을 적어주세요."
                    />
                  </label>
                  <label className={s.wide + " builder-consent"}>
                    <input
                      type="checkbox"
                      checked={draft.managed}
                      onChange={(e) => update("managed", e.target.checked)}
                    />
                    운영 대행 추가
                  </label>
                  <p className={s.wide + " " + s.muted}>
                    5명까지 60,000원, 추가 인당 10,000원(VAT 포함). 가이드
                    정리·선정·일정 조율·검수, 가이드 내 수정 1회와 재제출 확인,
                    참여자별 일정 변경 1회.
                  </p>
                </div>
              )}
              {step === 3 && preview && (
                <div className="builder-review">
                  <h3>
                    {draft.brand} · {draft.title}
                  </h3>
                  <p>
                    {productNames[draft.kind]} · {preview.input.quantity}명
                  </p>
                  <p>
                    모집 {draft.deadline} / 제출 {draft.submissionDeadline}
                  </p>
                  <p className="preserve-lines">{draft.guide}</p>
                  <p>
                    장바구니에 담은 후 구성과 결제 예정액을 다시 확인할 수
                    있어요.
                  </p>
                </div>
              )}
              <div className="builder-controls">
                {step > 0 && (
                  <button type="button" onClick={() => move(step - 1)}>
                    이전
                  </button>
                )}
                <button className={s.primary} disabled={!loaded || uploading}>
                  {step === 3
                    ? editing !== null
                      ? "구성 수정 저장"
                      : "장바구니에 담기"
                    : "다음"}
                </button>
                {editing !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setDraft(fresh());
                      move(0);
                    }}
                  >
                    수정 취소
                  </button>
                )}
              </div>
            </form>
          </section>
          <aside className={s.panel + " builder-summary"}>
            <h2>현재 구성 예상 금액</h2>
            <p>{productNames[draft.kind]}</p>
            {preview ? (
              <>
                {preview.lines.map((l) => (
                  <div className={s.row} key={l.key}>
                    <span>{l.label}</span>
                    <strong>{money(l.amount)}</strong>
                  </div>
                ))}
                <div className="builder-total">
                  합계 <strong>{money(preview.total)}</strong>
                </div>
              </>
            ) : (
              <p>인원·리워드·일정과 제공 혜택을 확인하면 금액이 표시돼요.</p>
            )}
            <small>실제 주문액은 장바구니에서 확인해주세요.</small>
          </aside>
        </div>
        <section className={s.panel} id="cart">
          <h2>장바구니 · {cart.length}개 캠페인</h2>
          {!loaded ? (
            <p>장바구니를 불러오는 중…</p>
          ) : !cart.length ? (
            <p>캠페인을 구성한 뒤 장바구니에 담아주세요.</p>
          ) : (
            <>
              <p className={s.muted}>
                패키지의 모집·제작·게시 비용은 포함 항목이에요. 같은 캠페인과
                대행비는 중복 청구하지 않아요.
              </p>
              {quotes.map((q, i) => (
                <article className={s.list} key={i}>
                  <div className={s.row}>
                    <h3>
                      {q.input.brand} · {q.input.title}
                    </h3>
                    <div className={s.actions}>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setDraft(q.input);
                          setEditing(i);
                          move(1);
                        }}
                      >
                        구성 수정
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setCart(cart.filter((_, n) => n !== i));
                          if (editing === i) {
                            setEditing(null);
                            setDraft(fresh());
                            setStep(0);
                          } else if (editing !== null && editing > i)
                            setEditing(editing - 1);
                        }}
                      >
                        구성 삭제
                      </button>
                    </div>
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
              {editing !== null ? (
                <p role="status">
                  구성 수정을 저장하거나 취소한 뒤 주문해주세요.
                </p>
              ) : !account ? (
                <p>
                  <Link href="/login?role=advertiser&next=%2Fmarketing">
                    광고주 로그인 후 주문하기
                  </Link>{" "}
                  · 작성 내용과 장바구니를 로그인 후 계정에 가져올 수 있어요.
                </p>
              ) : !payment?.enabled ? (
                <p>
                  결제 계좌를 준비 중이에요. 구성은 보관되며 지금은 결제되지
                  않아요.
                </p>
              ) : (
                <form onSubmit={pay}>
                  <p>
                    계좌이체 · {payment.bank} {payment.account} ·{" "}
                    {payment.holder}
                  </p>
                  <p>
                    주문 접수 후 이체하고 관리자 입금 확인을 기다려주세요. 확인
                    전에는 모집·제작을 시작하지 않아요.
                  </p>
                  <label className="builder-consent">
                    <input type="checkbox" required />
                    상품 구성·가격·일정과{" "}
                    <Link href="/policy" target="_blank">
                      이용·환불 기준
                    </Link>
                    을 확인하고 주문에 동의합니다.
                  </label>
                  <div className={s.actions}>
                    <button
                      className={s.primary}
                      disabled={busy || !!workspace.conflict}
                    >
                      {busy ? "접수 중…" : `${money(total)} 계좌이체 주문하기`}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {receipt && (
            <div className={s.notice} role="status">
              <h3>주문 접수 완료 · 입금 확인 전</h3>
              <p>주문번호 {receipt.id}</p>
              <p>
                {receipt.data.bank.bank} {receipt.data.bank.account} ·{" "}
                {receipt.data.bank.holder}
              </p>
              <p>
                이체 금액 {money(receipt.data.total)} · 입금 시 주문번호 끝
                8자리를 알려주세요.
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
