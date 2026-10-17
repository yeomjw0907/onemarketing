import { z } from "zod";
export const productFields = {
  name: "제품명",
  category: "제품 종류",
  features: "확인된 특징·필수 정보",
  target: "주요 타깃",
  salesScope: "판매 방식·지역",
  goal: "캠페인 목표",
  forbidden: "금지 표현·확인되지 않은 주장",
} as const;
const field = z.enum(
  Object.keys(productFields) as [
    keyof typeof productFields,
    ...(keyof typeof productFields)[],
  ],
);
const value = z.string().trim().max(5000);
export const productProfileSchema = z.object({
  name: value,
  category: value,
  features: value,
  target: value,
  salesScope: value,
  goal: value,
  forbidden: value,
});
export type ProductProfile = z.infer<typeof productProfileSchema>;
export const productDraftSchema = z.object({
  profile: productProfileSchema,
  evidence: z
    .array(
      z.object({
        field,
        source: z.string().min(1).max(500),
        detail: z.string().min(1).max(2000),
      }),
    )
    .max(50),
  questions: z
    .array(z.object({ field, question: z.string().min(1).max(1000) }))
    .max(10),
  notes: z.string().max(5000),
});
export type ProductUnderstanding = z.infer<typeof productDraftSchema> & {
  sourceHash: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
};
export function missingProductFields(profile: ProductProfile) {
  return (
    ["name", "category", "features", "salesScope", "goal"] as const
  ).filter((k) => !profile[k].trim());
}
export const productLinksSchema = z
  .array(
    z
      .string()
      .url()
      .refine(
        (u) => /^https?:\/\//i.test(u),
        "제품 링크는 http 또는 https 주소로 입력하세요.",
      ),
  )
  .max(5);
