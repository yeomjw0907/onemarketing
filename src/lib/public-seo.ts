import type { Metadata } from "next";

export const siteUrl = "https://www.onemarketing.kr";
// Only anonymous, public information pages belong in the search index.
export const publicPages = {
  "/": {
    title: "원마케팅 | 체험단 캠페인",
    description: "모집 중인 체험단 캠페인을 확인하고 지원하세요.",
  },
  "/campaigns": {
    title: "캠페인 찾기 | 원마케팅",
    description: "업종, 채널, 지역으로 캠페인을 검색하세요.",
  },
  "/about": {
    title: "서비스 소개 | 원마케팅",
    description:
      "체험단 모집부터 콘텐츠 제작과 게시 확인까지, 원마케팅 서비스를 알아보세요.",
  },
  "/marketing": {
    title: "마케팅 상품 | 원마케팅",
    description: "체험단 모집과 콘텐츠 제작·게시, 필요한 구성으로 시작하세요.",
  },
  "/guide": {
    title: "이용 가이드 | 원마케팅",
    description:
      "캠페인 등록부터 지원, 게시물 제출과 리워드 지급까지 이용 방법을 확인하세요.",
  },
  "/ai": {
    title: "AI·MCP 가이드 | 원마케팅",
    description:
      "사용하던 AI에서 캠페인 견적을 확인하고 주문을 접수할 수 있어요.",
  },
  "/participants/guide": {
    title: "원마케팅 · 참여 가이드",
    description:
      "원마케팅 캠페인 참여부터 콘텐츠 게시와 정산까지, 참여 방법을 확인하세요.",
  },
} as const;
export type PublicPath = keyof typeof publicPages;

export function publicMetadata(path: PublicPath): Metadata {
  const { title, description } = publicPages[path];
  const url = new URL(path, siteUrl).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "원마케팅",
      title,
      description,
      url,
      images: [
        {
          url: `${siteUrl}/og-onemarketing-v1.png`,
          width: 1733,
          height: 907,
          alt: "원마케팅",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/og-onemarketing-v1.png`],
    },
  };
}

export function publicStructuredData(path: PublicPath) {
  const url = new URL(path, siteUrl).href;
  const { title, description } = publicPages[path];
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...(path === "/"
        ? [
            {
              "@type": "Organization",
              "@id": `${siteUrl}/#organization`,
              name: "원마케팅",
              alternateName: "One Marketing",
              url: `${siteUrl}/`,
              logo: `${siteUrl}/brands/onemarketing-logo.svg`,
            },
            {
              "@type": "WebSite",
              "@id": `${siteUrl}/#website`,
              name: "원마케팅",
              alternateName: "One Marketing",
              url: `${siteUrl}/`,
              inLanguage: "ko-KR",
              publisher: { "@id": `${siteUrl}/#organization` },
            },
          ]
        : []),
      {
        "@type":
          path === "/about"
            ? "AboutPage"
            : path === "/campaigns"
              ? "CollectionPage"
              : "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: "ko-KR",
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
