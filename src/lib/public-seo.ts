import type { Metadata } from "next";
import { serviceOfferings } from "./service-offerings";
import type { CampaignSummary } from "./campaign-display";

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

export function breadcrumbData(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: new URL(item.path, siteUrl).href,
    })),
  };
}
export function publicBreadcrumbs(
  path: "/about" | "/marketing" | "/campaigns",
) {
  return [
    { name: "홈", path: "/" },
    {
      name:
        path === "/about"
          ? "서비스 소개"
          : path === "/marketing"
            ? "마케팅 상품"
            : "캠페인 찾기",
      path,
    },
  ];
}
export function indexableCampaign(c: CampaignSummary) {
  return c.status === "recruiting" && c.canApply;
}
export function campaignPath(c: Pick<CampaignSummary, "id">) {
  return `/campaigns/${c.id}`;
}
export function campaignDescription(c: CampaignSummary) {
  const state =
    c.status === "recruiting" && c.canApply ? "모집 중" : "모집 종료";
  return `${c.brand} · ${c.title}. ${state} · 모집 마감 ${c.deadline}. 캠페인 공개 요약과 참여 조건을 확인하세요.`;
}
export function campaignMetadata(c: CampaignSummary): Metadata {
  const title = `${c.title} | 원마케팅 캠페인`,
    description = campaignDescription(c),
    url = new URL(campaignPath(c), siteUrl).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: indexableCampaign(c), follow: true },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "원마케팅",
      title,
      description,
      url,
      images: [`${siteUrl}/og-onemarketing-v1.png`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/og-onemarketing-v1.png`],
    },
  };
}
export function publicStructuredData(
  path: PublicPath,
  options: {
    campaigns?: CampaignSummary[];
    services?: boolean;
    campaignList?: boolean;
  } = {},
) {
  const url = new URL(path, siteUrl).href;
  const { title, description } = publicPages[path];
  const graph: Record<string, unknown>[] = [
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
  ];
  const hasBreadcrumb = ["/about", "/marketing", "/campaigns"].includes(path);
  if (hasBreadcrumb)
    graph.push({
      ...breadcrumbData(
        publicBreadcrumbs(path as "/about" | "/marketing" | "/campaigns"),
      ),
      "@id": `${url}#breadcrumb`,
    });
  const services =
    (path === "/about" || path === "/marketing") && options.services !== false;
  if (services) {
    graph.push(
      ...serviceOfferings.map((s) => ({
        "@type": "Service",
        "@id": `${siteUrl}/marketing#${s.id}`,
        url: `${siteUrl}/marketing#${s.id}`,
        name: s.name,
        description: s.description,
        serviceType: s.name,
        provider: { "@id": `${siteUrl}/#organization` },
      })),
    );
    graph.push({
      "@type": "ItemList",
      "@id": `${url}#services`,
      name: "원마케팅 서비스 구성",
      numberOfItems: serviceOfferings.length,
      itemListElement: serviceOfferings.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@id": `${siteUrl}/marketing#${s.id}` },
      })),
    });
  }
  const list = path === "/campaigns" && options.campaignList !== false;
  if (list) {
    // Exactly the default first page shown in the anonymous HTML, in its order.
    const campaigns = (options.campaigns || [])
      .filter(indexableCampaign)
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    graph.push({
      "@type": "ItemList",
      "@id": `${url}#campaigns`,
      name: "모집 중인 캠페인",
      numberOfItems: campaigns.length,
      itemListElement: campaigns
        .slice(0, 9)
        .map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "WebPage",
            "@id": `${siteUrl}${campaignPath(c)}#webpage`,
            url: `${siteUrl}${campaignPath(c)}`,
            name: c.title,
          },
        })),
    });
  }
  graph.push({
    "@type":
      path === "/about"
        ? "AboutPage"
        : path === "/campaigns" || path === "/marketing"
          ? "CollectionPage"
          : "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${siteUrl}/#website` },
    about: { "@id": `${siteUrl}/#organization` },
    ...(hasBreadcrumb ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
    ...(path === "/about"
      ? { mainEntity: { "@id": `${siteUrl}/#organization` } }
      : services
        ? { mainEntity: { "@id": `${url}#services` } }
        : list
          ? { mainEntity: { "@id": `${url}#campaigns` } }
          : {}),
  });
  return { "@context": "https://schema.org", "@graph": graph };
}
export function campaignStructuredData(c: CampaignSummary) {
  const url = `${siteUrl}${campaignPath(c)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...breadcrumbData([
          ...publicBreadcrumbs("/campaigns"),
          { name: c.title, path: campaignPath(c) },
        ]),
        "@id": `${url}#breadcrumb`,
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: c.title,
        description: campaignDescription(c),
        inLanguage: "ko-KR",
        isPartOf: {
          "@type": "WebSite",
          "@id": `${siteUrl}/#website`,
          url: siteUrl,
          name: "원마케팅",
        },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
    ],
  };
}
export function sitemapEntries(campaigns: CampaignSummary[] = []) {
  return [
    ...Object.keys(publicPages).map((path) => ({
      url: new URL(path, siteUrl).href,
    })),
    ...campaigns
      .filter(indexableCampaign)
      .map((c) => ({ url: `${siteUrl}${campaignPath(c)}` })),
  ];
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
