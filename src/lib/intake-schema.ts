import { z } from "zod";
const date = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "올바른 날짜를 선택해주세요.",
  )
  .default("");
const text = z.string().trim().max(5000).default("");
export const intakeFields = z.object({
  companyName: text,
  contactName: text,
  contactPhone: z.string().trim().max(40).default(""),
  productName: text,
  category: z.string().trim().max(100).default(""),
  features: text,
  target: text,
  goal: text,
  salesScope: text,
  forbidden: text,
  links: z
    .array(
      z
        .string()
        .url()
        .max(2000)
        .refine(
          (v) => /^https?:\/\//i.test(v),
          "http 또는 https 링크를 입력해주세요.",
        ),
    )
    .max(10)
    .default([]),
  notes: text,
  fulfillment: z.enum(["", "delivery", "visit", "content"]).default(""),
  startDate: date,
  budget: z.string().max(200).default(""),
  visitAddress: text,
  visitTimes: text,
  shippingDate: date,
  providedItems: text,
});
export type IntakeFields = z.infer<typeof intakeFields>;
export const intakeSectionLabels = {
  companyName: "회사·브랜드명",
  contactName: "담당자",
  contactPhone: "연락처",
  productName: "제품·서비스명",
  category: "분류 (모르면 비워두세요)",
  features: "특징·반드시 알려야 할 정보",
  target: "주요 고객",
  goal: "이번 홍보의 목표",
  salesScope: "판매 방식·활동 지역",
  forbidden: "금지 표현·유의사항",
  notes: "추가로 전하고 싶은 내용",
} as const;
