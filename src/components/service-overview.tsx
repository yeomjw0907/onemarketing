import Link from "next/link";
import Image from "next/image";
import PublicShell from "./public-shell";
import "./service-overview.css";

export function ServiceBanner({
  variant = "home",
}: {
  variant?: "home" | "about" | "products";
}) {
  const about = variant === "about";
  const Heading = about ? "h1" : "h2";
  return (
    <section
      className={"service-banner service-banner--" + variant}
      aria-label="원마케팅 서비스 안내"
    >
      <div className="service-banner-copy">
        <span className="service-eyebrow">
          {about ? "원마케팅 소개" : "브랜드와 체험단을 연결하는 곳"}
        </span>
        <Heading>
          브랜드와 체험단을
          <br />
          한곳에서 연결해요.
        </Heading>
        <p>모집부터 콘텐츠 게시 확인까지, 원마케팅에서.</p>
        <Link
          className="service-banner-cta"
          href={about || variant === "products" ? "/campaigns" : "/about"}
        >
          {about || variant === "products"
            ? "캠페인 둘러보기"
            : "서비스 알아보기"}{" "}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="service-art" aria-hidden="true">
        <Image
          src="/images/brand/linked-rings-v1.webp"
          alt=""
          width={960}
          height={960}
          sizes={
            about
              ? "(max-width: 700px) 160px, 380px"
              : "(max-width: 700px) 132px, 260px"
          }
          loading="eager"
          fetchPriority="high"
        />
      </div>
    </section>
  );
}

export default function ProductOverview({
  about = false,
}: {
  about?: boolean;
}) {
  return (
    <PublicShell>
      <div className="service-page">
        {!about && (
          <div className="service-page-heading">
            <span className="service-eyebrow">마케팅 상품</span>
            <h1>
              우리 브랜드에 맞는
              <br />
              마케팅을 골라보세요.
            </h1>
            <p>
              직접 모집하거나, 콘텐츠 제작과 운영을 맡기거나.
              <br />
              목적에 맞는 구성으로 캠페인을 시작하세요.
            </p>
          </div>
        )}
        <ServiceBanner variant={about ? "about" : "products"} />
        <section
          className="service-products"
          aria-labelledby="service-products-title"
        >
          <h2 id="service-products-title">어떤 도움이 필요하세요?</h2>
          <div className="service-product-list">
            <article>
              <span className="service-number">01 / RECRUIT</span>
              <h3>셀프 모집</h3>
              <p>
                캠페인을 직접 만들고,
                <br />
                우리 브랜드에 맞는 체험단을 고르세요.
              </p>
              <ul>
                <li>현금 리워드 또는 제품·서비스 제공</li>
                <li>지원자 비교와 직접 선정</li>
                <li>게시물 확인과 진행 현황 관리</li>
              </ul>
              <span className="service-for">직접 운영하고 싶은 광고주에게</span>
            </article>
            <article>
              <span className="service-number">02 / CONTENTS</span>
              <h3>콘텐츠 제작·게시 패키지</h3>
              <p>
                AI로 소재를 만들고,
                <br />
                체험단의 채널에 게시해요.
              </p>
              <ul>
                <li>블로그 게시용 이미지 3장과 원고 1개 / 1명</li>
                <li>블로그 5건·클립 5건 구성</li>
                <li>제작부터 게시 확인까지 최소 2주</li>
              </ul>
              <span className="service-for">
                소재 제작부터 필요한 광고주에게
              </span>
            </article>
            <article>
              <span className="service-number">03 / MANAGED</span>
              <h3>운영 대행 옵션</h3>
              <p>
                모집 이후의 진행도,
                <br />
                담당자와 함께 챙기세요.
              </p>
              <ul>
                <li>지원자 선정 지원</li>
                <li>참여자 안내와 일정 조율</li>
                <li>약정 범위 내 수정 요청과 게시 확인</li>
              </ul>
              <span className="service-for">
                운영할 시간이 부족한 광고주에게
              </span>
            </article>
          </div>
        </section>
        <section className="service-login">
          <div>
            <h2>구성을 골랐다면, 견적을 확인하세요.</h2>
            <p>
              가격과 견적은 광고주 로그인 후 확인할 수 있어요.
              <br />
              인원과 옵션을 고르고, 결제 전에 항목별 금액을 확인하세요.
            </p>
          </div>
          <Link href="/login?next=%2Fmarketing">
            광고주 로그인 후 견적 보기 →
          </Link>
        </section>
        {about && (
          <>
            <section className="service-process">
              <h2>이렇게 진행돼요</h2>
              <ol>
                <li>
                  <b>01. 캠페인 준비</b>
                  <p>상품, 인원, 모집 기간과 게시 기간을 정해요.</p>
                </li>
                <li>
                  <b>02. 모집과 선정</b>
                  <p>지원자를 확인하고 함께할 체험단을 선정해요.</p>
                </li>
                <li>
                  <b>03. 제작과 게시</b>
                  <p>안내한 조건에 따라 콘텐츠를 준비하고 게시해요.</p>
                </li>
                <li>
                  <b>04. 확인과 정산</b>
                  <p>제출된 게시물을 확인하고 완료 내역을 정리해요.</p>
                </li>
              </ol>
            </section>
            <section className="service-two">
              <div>
                <h2>체험단으로 함께하고 싶다면</h2>
                <p>
                  채널을 등록하고, 관심 있는 캠페인에 지원하세요.
                  <br />
                  리워드와 제공 내역은 캠페인에서 확인할 수 있어요.
                </p>
                <Link href="/campaigns">캠페인 찾아보기 →</Link>
              </div>
              <div>
                <h2>채팅으로 캠페인을 준비한다면</h2>
                <p>
                  사용 중인 AI에 원마케팅을 연결하세요.
                  <br />
                  캠페인을 준비하고 견적을 확인할 수 있어요.
                </p>
                <Link href="/ai">AI·MCP 연결 안내 →</Link>
              </div>
            </section>
          </>
        )}
        <p className="service-note">
          세부 제공 범위와 일정은 주문서에서 확인하세요. 제품·배송, 추가
          리워드와 콘텐츠 사용권은 캠페인 조건에 따라 달라질 수 있어요.{" "}
          <Link href="/policy">이용·환불 안내</Link>
        </p>
      </div>
    </PublicShell>
  );
}
