export const campaignCategories = {
  all: "전체",
  food: "맛집·식품",
  cafe: "카페·디저트",
  beauty: "뷰티",
  living: "생활·가전",
  fashion: "패션",
  travel: "여행·숙박",
  other: "기타",
} as const;
export const fulfillmentNames = {
  provided: "원고 제공형",
  delivery: "배송형",
  visit: "방문형",
} as const;
export const channelNames = {
  blog: "블로그",
  clip: "클립",
  bundle: "블로그 + 클립",
} as const;
export const discoveryStates = {
  recruiting: "모집 중",
  selecting: "선정 중",
  producing: "활동 중",
  review: "검수 중",
  completed: "완료",
  cancelled: "취소",
} as const;
export type CampaignSummary = {
  id: string;
  source: "commerce" | "legacy";
  title: string;
  brand: string;
  category: string;
  fulfillment: string;
  region: string;
  imageUrl: string;
  channel: string;
  quantity: number;
  applicationCount: number;
  reward: number;
  benefit: string;
  deadline: string;
  submissionDeadline: string;
  status: string;
  createdAt: string;
  canApply: boolean;
  types: string[];
};
export function safeReturnPath(value: unknown) {
  return typeof value === "string" && /^\/campaigns\/[a-f0-9-]{36}$/.test(value)
    ? value
    : "";
}
