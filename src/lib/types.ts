export type Kind =
  | "quote_drafts"
  | "work_offers"
  | "referral_credits"
  | "notification_outbox"
  | "portal_links"
  | "customers"
  | "products"
  | "participants"
  | "participant_history"
  | "participant_settlements"
  | "work_slots"
  | "participant_events"
  | "posting_sets"
  | "report_links"
  | "prices"
  | "contracts"
  | "projects"
  | "tasks"
  | "assets"
  | "costs"
  | "deliveries"
  | "exchange_rates"
  | "media_plans"
  | "jobs"
  | "job_logs"
  | "events";
export type RecordData = {
  id: string;
  kind: Kind;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};
export type DatabaseView = Record<Kind, RecordData[]>;
export const kinds: Kind[] = [
  "quote_drafts",
  "work_offers",
  "referral_credits",
  "notification_outbox",
  "portal_links",
  "customers",
  "products",
  "participants",
  "participant_history",
  "participant_settlements",
  "work_slots",
  "participant_events",
  "posting_sets",
  "report_links",
  "prices",
  "contracts",
  "projects",
  "tasks",
  "assets",
  "costs",
  "deliveries",
  "exchange_rates",
  "media_plans",
  "jobs",
  "job_logs",
  "events",
];
export const stageLabels: Record<string, string> = {
  draft: "초안",
  materials: "자료 대기",
  planning: "기획 중",
  brief_review: "기획 검수",
  producing: "제작 중",
  review: "결과물 검수",
  ready: "전달 준비",
  publishing: "게시 진행",
  completed: "운영 완료",
  cancelled: "취소",
  planned: "계획",
  approved: "승인",
  delivered: "전달 완료",
  submitted: "링크 등록",
  verified: "게시 확인",
  changes: "수정 요청",
  pending: "대기",
  running: "실행 중",
  succeeded: "성공",
  failed: "실패",
  uncertain: "상태 확인 필요",
  paid: "지급 완료",
};
export const money = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n)
    ? new Intl.NumberFormat("ko-KR").format(n) + "원"
    : "미정";
