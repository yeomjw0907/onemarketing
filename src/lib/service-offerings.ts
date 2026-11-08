// The public cards and their structured descriptions share one source. Prices
// and account-only purchase terms deliberately do not belong in this catalog.
export const serviceOfferings = [
  {
    id: "self-recruitment",
    number: "01 / RECRUIT",
    name: "셀프 모집",
    description: "캠페인을 직접 만들고, 우리 브랜드에 맞는 체험단을 고르세요.",
    features: [
      "현금 리워드 또는 제품·서비스 제공",
      "지원자 비교와 직접 선정",
      "게시물 확인과 진행 현황 관리",
    ],
    audience: "직접 운영하고 싶은 광고주에게",
  },
  {
    id: "content-package",
    number: "02 / CONTENTS",
    name: "콘텐츠 제작·게시 패키지",
    description: "AI로 소재를 만들고, 체험단의 채널에 게시해요.",
    features: [
      "블로그 게시용 이미지 3장과 원고 1개 / 1명",
      "블로그 5건·클립 5건 구성",
      "제작부터 게시 확인까지 최소 2주",
    ],
    audience: "소재 제작부터 필요한 광고주에게",
  },
  {
    id: "managed-operation",
    number: "03 / MANAGED",
    name: "운영 대행 옵션",
    description: "모집 이후의 진행도, 담당자와 함께 챙기세요.",
    features: [
      "지원자 선정 지원",
      "참여자 안내와 일정 조율",
      "약정 범위 내 수정 요청과 게시 확인",
    ],
    audience: "운영할 시간이 부족한 광고주에게",
  },
] as const;
