import { z } from "zod";
export const policyVersion = "2026-10-23.1";
export const money = (v: number) => v.toLocaleString("ko-KR") + "원";
export const productNames = {
  self_cash: "현금 리워드 셀프 모집",
  self_product: "제품·서비스 제공형 모집",
  package: "블로그 5 + 클립 5 패키지",
  managed: "운영 대행",
} as const;
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "날짜를 확인하세요.");
export const campaignPresentation = z
  .object({
    visibility: z.enum(["public", "preview"]).optional(),
    category: z
      .enum(["food", "cafe", "beauty", "living", "fashion", "travel", "other"])
      .optional(),
    fulfillment: z.enum(["provided", "delivery", "visit"]).optional(),
    region: z.string().trim().max(100).optional(),
    imageUrl: z
      .union([
        z.literal(""),
        z.string().regex(/^\/api\/campaign-media\/[a-f0-9-]{36}$/i),
        z
          .string()
          .url()
          .max(2000)
          .refine(
            (v) => v.startsWith("https://"),
            "HTTPS 이미지 주소를 입력하세요.",
          ),
      ])
      .optional(),
  })
  .strict();
export const campaignInput = z
  .object({
    ...campaignPresentation.shape,
    title: z.string().trim().min(2).max(120),
    brand: z.string().trim().min(1).max(120),
    product: z.string().trim().min(1).max(300),
    guide: z.string().trim().min(10).max(5000),
    kind: z.enum(["self_cash", "self_product", "package"]),
    channel: z.enum(["blog", "clip", "bundle"]),
    quantity: z.number().int().min(1).max(100),
    reward: z.number().int().min(0).max(1000000),
    benefit: z.string().trim().max(500).default(""),
    managed: z.boolean().default(false),
    deadline: day,
    submissionDeadline: day,
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.kind === "package" &&
      (v.quantity !== 5 || v.channel !== "bundle" || v.reward !== 0)
    )
      c.addIssue({
        code: "custom",
        message:
          "패키지는 블로그·클립 5세트이며 기본 게시 리워드가 포함됩니다.",
      });
    if (v.kind === "self_cash" && v.reward < 1000)
      c.addIssue({
        code: "custom",
        message: "현금 리워드는 1인 1,000원 이상 입력하세요.",
      });
    if (v.kind === "self_product" && (v.reward !== 0 || !v.benefit))
      c.addIssue({
        code: "custom",
        message: "제품형은 현금 리워드 0원과 제공 혜택을 입력하세요.",
      });
    if (v.deadline >= v.submissionDeadline)
      c.addIssue({
        code: "custom",
        message: "모집 마감은 제출 마감보다 빨라야 합니다.",
      });
    if (
      Date.parse(v.submissionDeadline + "T23:59:59+09:00") -
        Date.parse(v.deadline + "T23:59:59+09:00") <
      3 * 86400000
    )
      c.addIssue({
        code: "custom",
        message: "선정·수락·제작을 위해 모집 후 최소 3일을 확보하세요.",
      });
  });
export type CampaignInput = z.infer<typeof campaignInput>;
export type Charge = { key: string; label: string; amount: number };
// New self-service/managed fees include VAT. Existing package is 200,000 + VAT.
export function campaignQuote(raw: unknown) {
  const d = campaignInput.parse(raw);
  const lines: Charge[] =
    d.kind === "package"
      ? [
          { key: "recruitment", label: "모집·진행 관리", amount: 33000 },
          { key: "clips", label: "클립 5개", amount: 110000 },
          {
            key: "assets",
            label: "블로그 이미지 15장·원고 5개 제작",
            amount: 44000,
          },
          { key: "distribution", label: "블로그 게시 5회", amount: 33000 },
        ]
      : [
          {
            key: "reward",
            label: "참여자 리워드 예산",
            amount: d.reward * d.quantity,
          },
          {
            key: "operation",
            label:
              d.kind === "self_cash"
                ? "셀프 운영비 10% · 최소 5,000원"
                : "완료 인당 3,000원 · 최소 5,000원",
            amount:
              d.kind === "self_cash"
                ? Math.max(5000, Math.round(d.reward * d.quantity * 0.1))
                : Math.max(5000, d.quantity * 3000),
          },
        ];
  if (d.managed)
    lines.push({
      key: "managed",
      label: "운영 대행 · 가이드·선정·조율·검수",
      amount: 60000 + Math.max(0, d.quantity - 5) * 10000,
    });
  return {
    policyVersion,
    input: d,
    lines,
    total: lines.reduce((n, l) => n + l.amount, 0),
    packageSupply: d.kind === "package" ? 200000 : null,
    terms: {
      payment:
        "계좌이체 입금 확인 후 모집 시작. 주문 접수는 결제 완료가 아닙니다.",
      refund:
        "셀프는 완료 인원에 따른 보수·운영비를 사용액으로 정산하고 잔액을 환불합니다. 0명 완료 시 셀프 운영비는 0원입니다. 패키지·대행은 항목별 실제 수행 금액과 근거를 확정한 뒤 미사용액을 환불합니다. 승인과 실제 송금은 별도로 기록합니다.",
      revisionRounds: 1,
      scheduleChangesPerParticipant: 1,
      campaignScheduleChanges: 1,
      manualFollowups: 2,
      minimumDays: d.kind === "package" ? 14 : 3,
      managedScope:
        "원래 가이드 내 수정 1회·재제출 확인, 최초 일정 및 참여자별 변경 1회. 새 제작·반복 변경은 별도 합의.",
    },
  };
}
export function selfSettlement(d: CampaignInput, completed: number) {
  if (d.kind === "package")
    throw new Error("패키지는 항목별 수행 금액으로 정산합니다.");
  if (!Number.isInteger(completed) || completed < 0 || completed > d.quantity)
    throw new Error("완료 인원을 확인하세요.");
  const reward = d.reward * completed;
  return {
    reward,
    operation:
      completed === 0
        ? 0
        : d.kind === "self_cash"
          ? Math.max(5000, Math.round(reward * 0.1))
          : Math.max(5000, completed * 3000),
  };
}
export const appStates: Record<string, string> = {
  cancelled: "진행 종료",
  applied: "지원 완료",
  selected: "선정 · 수락 대기",
  accepted: "참여 확정",
  submitted: "검수 대기",
  revision: "수정 요청",
  verified: "게시 확인",
  paid: "보수 지급 기록 완료",
  declined: "거절",
  withdrawn: "지원 철회",
  expired: "제안 만료",
  rejected: "미선정",
};
export const campaignStates: Record<string, string> = {
  awaiting_payment: "입금 대기",
  recruiting: "모집 중",
  selecting: "선정 중",
  producing: "체험·제작 중",
  review: "검수 중",
  completed: "완료",
  paused: "중지 · 환불 검토",
  cancelled: "취소",
};
