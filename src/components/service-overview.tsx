import Link from "next/link";
import { serviceOfferings } from "@/lib/service-offerings";
import PublicBreadcrumbs from "./public-breadcrumbs";
import BrandVisual from "./brand-visual";
import DiscoverButton from "./discover-button";
import PublicShell from "./public-shell";
import "./service-overview.css";

export function ServiceBanner({
  variant = "home",
}: {
  variant?: "home" | "about" | "products";
}) {
  const about = variant === "about";
  const products = variant === "products";
  const Heading = variant === "home" ? "h2" : "h1";
  return (
    <section
      className={"service-banner service-banner--" + variant}
      aria-label="원마케팅 서비스 안내"
    >
      <div className="service-banner-copy">
        <span className="service-eyebrow">
          {about
            ? "원마케팅 소개"
            : products
              ? "마케팅 상품"
              : "브랜드와 체험단을 연결하는 곳"}
        </span>
        <Heading>
          {about ? (
            <>
              캠페인의 시작부터
              <br />
              완료까지 함께해요.
            </>
          ) : products ? (
            <>
              우리 브랜드에 맞는
              <br />
              마케팅을 골라보세요.
            </>
          ) : (
            <>
              브랜드와 체험단을
              <br />
              한곳에서 연결해요.
            </>
          )}
        </Heading>
        <p>
          {products
            ? "직접 모집하거나 제작과 운영을 맡기거나, 필요한 만큼 선택하세요."
            : about
              ? "모집, 콘텐츠 제작, 게시 확인까지 하나의 흐름으로."
              : "모집부터 콘텐츠 게시 확인까지, 원마케팅에서."}
        </p>
        {variant === "home" ? (
          <div className="home-platform-actions">
            <Link className="home-platform-primary" href="/marketing">
              체험단 모집하기 <span aria-hidden="true">→</span>
            </Link>
            <Link className="home-platform-secondary" href="#home-campaigns">
              캠페인 참여하기
            </Link>
            <Link className="home-platform-about" href="/about">
              서비스 알아보기
            </Link>
          </div>
        ) : (
          <DiscoverButton
            href={
              products
                ? "#service-products-title"
                : about
                  ? "/campaigns"
                  : "/about"
            }
            label={
              products
                ? "상품 구성 살펴보기"
                : about
                  ? "캠페인 둘러보기"
                  : "서비스 알아보기"
            }
          />
        )}
      </div>
      <div className="service-art" aria-hidden="true">
        <BrandVisual
          kind={about ? "flow" : products ? "products" : "connection"}
          size="hero"
          sizes={
            about
              ? "(max-width: 700px) 160px, 380px"
              : "(max-width: 700px) 132px, 260px"
          }
          priority
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
        <PublicBreadcrumbs
          items={[
            { name: "홈", path: "/" },
            {
              name: about ? "서비스 소개" : "마케팅 상품",
              path: about ? "/about" : "/marketing",
            },
          ]}
        />
        {about ? (
          <ServiceBanner variant="about" />
        ) : (
          <header className="service-page-heading">
            <span className="service-eyebrow">마케팅 상품</span>
            <h1>
              우리 브랜드에 맞는
              <br />
              마케팅을 골라보세요.
            </h1>
            <p>
              직접 모집하거나 제작과 운영을 맡기거나, 필요한 만큼 선택하세요.
            </p>
          </header>
        )}
        <section
          className="service-products"
          aria-labelledby="service-products-title"
        >
          <div className="service-selection">
            <div>
              <h2 id="service-products-title">어떤 도움이 필요하세요?</h2>
              <p>
                셀프 모집 또는 콘텐츠 패키지를 고르고,
                <br />
                필요한 경우 운영 대행을 추가하세요.
              </p>
            </div>
            <div className="service-selection-art">
              <BrandVisual
                kind="products"
                size="inline"
                sizes="(max-width: 700px) 88px, 144px"
              />
              <span>기본 상품 + 운영 옵션</span>
            </div>
          </div>
          <div className="service-product-list">
            {serviceOfferings.map((service) => (
              <article key={service.id} id={service.id}>
                <div className="service-product-heading">
                  <span className="service-number">{service.number}</span>
                </div>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <ul>
                  {service.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <span className="service-for">{service.audience}</span>
              </article>
            ))}
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
          <DiscoverButton
            href="/login?next=%2Fmarketing"
            label="광고주 로그인 후 견적 보기"
          />
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
