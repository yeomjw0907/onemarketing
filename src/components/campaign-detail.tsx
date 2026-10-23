"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Lock, Heart, Share2, Check, ArrowLeft } from "lucide-react";
import PublicShell from "./public-shell";
import { CampaignImage } from "./campaign-browser";
import { marketFetch } from "./public-fetch";
import {
  campaignCategories,
  channelNames,
  fulfillmentNames,
  discoveryStates,
  type CampaignSummary,
} from "@/lib/campaign-display";
import { appStates, money } from "@/lib/commerce-policy";
import { accountAssignable } from "@/lib/participant-account-policy";
type Row = Record<string, any>;
export default function CampaignDetail({ id }: { id: string }) {
  const [data, setData] = useState<Row | null>(null),
    [member, setMember] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [applying, setApplying] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [type, setType] = useState("");
  const requestId = useRef(0);
  const returnTo = "/campaigns/" + id,
    login = "/login?next=" + encodeURIComponent(returnTo);
  async function load() {
    const request = ++requestId.current;
    setError("");
    const d = await marketFetch("/api/campaigns?id=" + encodeURIComponent(id));
    if (request !== requestId.current) return;
    setData(d);
    setType(d.summary.channel);
    if (d.viewerRole === "participant") {
      const p = await marketFetch("/api/participant-portal");
      if (request === requestId.current) setMember(p.participant);
    }
  }
  useEffect(() => {
    setData(null);
    setMember(null);
    setApplying(false);
    setNotice("");
    load().catch((e) => setError(e.message));
    try {
      setSaved(
        (
          JSON.parse(
            localStorage.getItem("om_saved_campaigns") || "[]",
          ) as string[]
        ).includes(id),
      );
    } catch {}
    return () => {
      requestId.current++;
    };
  }, [id]);
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice("캠페인 주소를 복사했어요.");
    } catch {
      setNotice("주소창의 캠페인 주소를 복사해주세요.");
    }
  }
  function favorite() {
    if (data?.locked) {
      location.assign(login);
      return;
    }
    try {
      const old = JSON.parse(
        localStorage.getItem("om_saved_campaigns") || "[]",
      ) as string[];
      localStorage.setItem(
        "om_saved_campaigns",
        JSON.stringify(
          saved
            ? old.filter((x) => x !== id)
            : Array.from(new Set([...old, id])),
        ),
      );
      setSaved(!saved);
      setNotice(
        saved
          ? "관심 캠페인에서 해제했어요."
          : "이 브라우저의 관심 캠페인에 저장했어요.",
      );
    } catch {
      setError("브라우저 저장 공간을 사용할 수 없습니다.");
    }
  }
  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !data) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const accounts = {
        blogAccountId: String(f.get("blogAccountId") || ""),
        clipAccountId: String(f.get("clipAccountId") || ""),
      };
      if (data.summary.source === "commerce")
        await marketFetch("/api/commerce", {
          role: "participant",
          action: "apply",
          data: {
            campaignId: id,
            ...accounts,
            message: String(f.get("message") || ""),
            consent: true,
          },
        });
      else
        await marketFetch("/api/market", {
          action: "apply",
          data: {
            campaignId: id,
            type,
            ...Object.fromEntries(
              Object.entries(accounts).filter(([, v]) => v),
            ),
            message: String(f.get("message") || ""),
            consent: true,
          },
        });
      setNotice(
        "지원했어요. 선정 결과와 참여 제안은 ‘나의 활동’에서 확인해주세요.",
      );
      setApplying(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const c = data?.summary as CampaignSummary | undefined;
  const status = c
    ? discoveryStates[c.status as keyof typeof discoveryStates] || "모집 종료"
    : "";
  return (
    <PublicShell>
      <div className="campaign-experience detailbg">
        <div className="wrap">
          <div className="breadcrumb">
            <Link href="/">홈</Link>　›　
            <Link href="/campaigns">캠페인 찾기</Link>
            {c && (
              <>
                　›　
                {campaignCategories[
                  c.category as keyof typeof campaignCategories
                ] || "기타"}
              </>
            )}
          </div>
          {error && (
            <div role="alert" className="feedback">
              <p>{error}</p>
              <button onClick={() => load().catch((e) => setError(e.message))}>
                다시 불러오기
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="feedback success">
              {notice}
            </p>
          )}
          {!c && !error && <p role="status">캠페인을 불러오는 중이에요.</p>}
          {c && (
            <div className="detailgrid">
              <div>
                <section className="panel titlepanel">
                  <div className="tags">
                    <span className="badge">{status}</span>
                    <span>
                      {
                        fulfillmentNames[
                          c.fulfillment as keyof typeof fulfillmentNames
                        ]
                      }
                    </span>
                  </div>
                  <h1>{c.title}</h1>
                  <div className="brandrow">
                    <span className="dotlogo">{c.brand.slice(0, 1)}</span>
                    {c.brand}
                    <span>│</span>
                    {
                      campaignCategories[
                        c.category as keyof typeof campaignCategories
                      ]
                    }
                  </div>
                  <div className="meta">
                    <span>
                      등록일{" "}
                      {new Date(c.createdAt).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })}
                    </span>
                    <span>캠페인 번호 {id.slice(-8)}</span>
                  </div>
                </section>
                <section className="panel metrics">
                  <div>
                    <label>리워드</label>
                    <strong>
                      {c.reward ? money(c.reward) : "제품·서비스 제공"}
                    </strong>
                    <small>
                      {c.reward ? "1인 기준" : "현금 리워드 없음"}
                      {c.source === "legacy" || c.channel === "bundle"
                        ? " · 개인 약정은 수락 시 확인"
                        : ""}
                    </small>
                  </div>
                  <div>
                    <label>모집 인원</label>
                    <strong>{c.quantity}명</strong>
                    <small>
                      {channelNames[c.channel as keyof typeof channelNames]}
                    </small>
                  </div>
                  <div>
                    <label>모집 마감</label>
                    <strong>{c.deadline}</strong>
                    <small>제출 {c.submissionDeadline}</small>
                  </div>
                </section>
                {data?.locked ? (
                  <section className="panel locked">
                    <div className="skeleton" aria-hidden="true">
                      <h2>캠페인 상세 안내</h2>
                      <div className="fakegrid">
                        <div>
                          <i />
                          <i />
                          <i />
                        </div>
                        <div>
                          <i />
                          <i />
                          <i />
                        </div>
                      </div>
                      <h2>캠페인 일정</h2>
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="gate">
                      <div className="lockcircle">
                        <Lock size={20} />
                      </div>
                      <h2>로그인 후 상세 내용을 볼 수 있어요.</h2>
                      <p>참여 조건, 일정, 게시 방법을 확인할 수 있어요.</p>
                      <Link className="btn primary" href={login}>
                        로그인 후 상세 보기
                      </Link>
                      <Link
                        className="link"
                        href={"/signup?next=" + encodeURIComponent(returnTo)}
                      >
                        처음 오셨나요?　<span className="blue">회원가입</span>
                      </Link>
                    </div>
                  </section>
                ) : (
                  <section className="panel bodypanel">
                    <nav className="tabs" aria-label="상세 목차">
                      <a className="active" href="#campaign-intro">
                        캠페인 소개
                      </a>
                      <a href="#campaign-schedule">진행 일정</a>
                      <a href="#campaign-guide">참여 가이드</a>
                    </nav>
                    <div className="bodycontent">
                      <section id="campaign-intro">
                        <h2>캠페인 소개</h2>
                        <p>{data?.details.product}</p>
                        <CampaignImage campaign={c} cover />
                        <dl className="infotable">
                          <dt>진행 방식</dt>
                          <dd>
                            {
                              fulfillmentNames[
                                c.fulfillment as keyof typeof fulfillmentNames
                              ]
                            }
                            {c.region ? " · " + c.region : ""}
                          </dd>
                          <dt>채널</dt>
                          <dd>
                            {
                              channelNames[
                                c.channel as keyof typeof channelNames
                              ]
                            }
                          </dd>
                          <dt>제공 내역</dt>
                          <dd>{c.benefit || "별도 제품·서비스 제공 없음"}</dd>
                          <dt>리워드</dt>
                          <dd>
                            {c.reward
                              ? money(c.reward) + " · 게시물 검수 후 지급"
                              : "제품·서비스 제공, 현금 리워드 없음"}
                          </dd>
                        </dl>
                      </section>
                      <section id="campaign-schedule">
                        <h2>진행 일정</h2>
                        <div className="schedule">
                          <div>
                            01 모집<b>{c.deadline} 마감</b>
                          </div>
                          <div>
                            02 선정·수락<b>개별 안내</b>
                          </div>
                          <div>
                            03 게시물 제출<b>{c.submissionDeadline}까지</b>
                          </div>
                          <div>
                            04 검수·정산<b>검수 후 안내</b>
                          </div>
                        </div>
                        <div className="callout">
                          선정되면 ‘나의 활동’에서 참여 제안을 확인해주세요.
                          안내된 기한 안에 수락해야 참여가 확정돼요. 기한이
                          지나면 제안은 만료돼요.
                        </div>
                      </section>
                      <section id="campaign-guide">
                        <h2>참여 가이드</h2>
                        <p className="guide-text">
                          {data?.details.guide ||
                            "세부 진행 방법은 선정 후 담당자가 안내합니다."}
                        </p>
                      </section>
                      <section>
                        <h3>유의사항</h3>
                        <ul className="checklist">
                          <li>
                            캠페인에 안내된 광고 표기와 게시 유지 조건을
                            확인해주세요.
                          </li>
                          {c.fulfillment === "provided" && (
                            <li>
                              제공된 원고를 게시하는 캠페인은 직접 체험한 것처럼
                              작성하면 안 돼요.
                            </li>
                          )}
                          <li>
                            게시물 주소를 제출한 뒤 검수 결과와 수정 요청을
                            확인해주세요.
                          </li>
                        </ul>
                      </section>
                      {applying && (
                        <section id="application-form">
                          <h2>캠페인 지원</h2>
                          {!member ? (
                            <p>활동 계정 정보를 불러오는 중이에요.</p>
                          ) : (
                            <form className="apply-form" onSubmit={apply}>
                              {c.source === "legacy" && (
                                <label>
                                  참여 채널
                                  <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                  >
                                    {c.types.map((t) => (
                                      <option value={t} key={t}>
                                        {
                                          channelNames[
                                            t as keyof typeof channelNames
                                          ]
                                        }
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              {(type === "bundle" ? ["blog", "clip"] : [type])
                                .filter(Boolean)
                                .map((ch) => (
                                  <label key={ch}>
                                    {
                                      channelNames[
                                        ch as keyof typeof channelNames
                                      ]
                                    }{" "}
                                    활동 계정
                                    <select name={ch + "AccountId"} required>
                                      <option value="">계정 선택</option>
                                      {(member.accounts || [])
                                        .filter(
                                          (a: Row) =>
                                            accountAssignable(
                                              a as any,
                                              ch as any,
                                            ) && a.ownershipVerifiedAt,
                                        )
                                        .map((a: Row) => (
                                          <option key={a.id} value={a.id}>
                                            {a.label || a.url}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                ))}
                              <p className="muted small">
                                승인되고 소유 확인된 활동 계정만 선택할 수
                                있어요. 계정 확인은{" "}
                                <Link href="/participants/portal">
                                  나의 활동
                                </Link>
                                에서 진행해주세요.
                              </p>
                              <label>
                                지원 한마디
                                <textarea name="message" maxLength={1000} />
                              </label>
                              <label className="consent">
                                <input type="checkbox" required />
                                리워드, 일정, 참여 가이드를 확인했어요.
                              </label>
                              <button className="primary" disabled={busy}>
                                지원하기
                              </button>
                            </form>
                          )}
                        </section>
                      )}
                    </div>
                  </section>
                )}
                <div className="detailfoot">
                  <Link href="/campaigns">
                    <ArrowLeft size={14} /> 캠페인 목록으로
                  </Link>
                  {!data?.locked && (
                    <Link href="/participants/portal">나의 활동 →</Link>
                  )}
                </div>
              </div>
              <aside className="aside">
                <section className="panel">
                  <span className="badge">
                    {channelNames[c.channel as keyof typeof channelNames]}
                  </span>
                  <h2 style={{ margin: "13px 0 6px" }}>리워드</h2>
                  <div className="rewardbig">
                    {c.reward ? money(c.reward) : "제품·서비스 제공"}
                  </div>
                  {c.benefit && <p className="small muted">{c.benefit}</p>}
                  <dl>
                    <dt>모집 인원</dt>
                    <dd>{c.quantity}명</dd>
                    <dt>신청 현황</dt>
                    <dd>{c.applicationCount}명 신청</dd>
                    <dt>모집 마감</dt>
                    <dd>{c.deadline}</dd>
                    <dt>게시 기한</dt>
                    <dd>{c.submissionDeadline}</dd>
                  </dl>
                  {data?.locked ? (
                    <>
                      <Link className="btn primary full" href={login}>
                        로그인 후 상세 보기
                      </Link>
                      <p className="smallhelp">
                        로그인하면 상세 조건을 보고 지원할 수 있어요.
                      </p>
                    </>
                  ) : data?.viewerRole === "participant" ? (
                    data.application &&
                    !["withdrawn", "declined", "rejected", "expired"].includes(
                      data.application.status,
                    ) ? (
                      <>
                        <p className="callout">
                          {appStates[data.application.status] ||
                            data.application.status}
                        </p>
                        <Link
                          className="btn primary full"
                          href="/participants/portal"
                        >
                          나의 활동에서 확인
                        </Link>
                      </>
                    ) : c.canApply ? (
                      <button
                        className="primary full"
                        onClick={() => {
                          setApplying(true);
                          setTimeout(
                            () =>
                              document
                                .getElementById("application-form")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                }),
                            50,
                          );
                        }}
                      >
                        지원하기
                      </button>
                    ) : (
                      <button className="full" disabled>
                        모집이 마감됐어요
                      </button>
                    )
                  ) : (
                    <>
                      <p className="smallhelp">
                        체험단 계정으로 지원할 수 있어요.
                      </p>
                      <Link
                        className="btn full"
                        href={
                          data?.viewerRole === "admin"
                            ? "/admin/platform"
                            : data?.isOwner
                              ? "/advertisers"
                              : "/participants/portal"
                        }
                      >
                        {data?.viewerRole === "admin"
                          ? "캠페인 운영"
                          : data?.isOwner
                            ? "내 캠페인 관리"
                            : "체험단 로그인"}
                      </Link>
                    </>
                  )}
                  <div className="side-actions">
                    <button aria-pressed={saved} onClick={favorite}>
                      <Heart size={15} fill={saved ? "currentColor" : "none"} />
                      {saved ? "관심 해제" : "관심 캠페인"}
                    </button>
                    <button onClick={share}>
                      <Share2 size={15} />
                      공유
                    </button>
                  </div>
                  <p className="smallhelp">
                    관심 캠페인은 이 브라우저에 저장돼요.
                  </p>
                </section>
                <section className="panel support">
                  <h3>참여 안내</h3>
                  <p>선정과 제출 방법은 이용 가이드에서 확인할 수 있어요.</p>
                  <Link className="btn full" href="/guide">
                    참여 방법 보기
                  </Link>
                </section>
              </aside>
            </div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
