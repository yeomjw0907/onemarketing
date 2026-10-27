import { z } from "zod";
const required = (label: string) =>
  z.string().trim().min(1, `${label}을 입력해주세요.`).max(200);
export const advertiserProfileSchema = z
  .object({
    companyName: required("업체명"),
    brand: required("브랜드명"),
    industry: required("업종"),
    businessType: z.enum(["individual", "corporation", "preparing"]),
    businessNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/[- ]/g, ""))
      .refine(
        (v) => v === "" || /^\d{10}$/.test(v),
        "사업자번호는 숫자 10자리로 입력해주세요.",
      ),
    address: required("사업장 주소 또는 활동 지역"),
    website: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .url()
          .max(2000)
          .refine((v) => ["http:", "https:"].includes(new URL(v).protocol)),
      ])
      .default(""),
    description: z
      .string()
      .trim()
      .min(5, "제품·서비스 소개를 5자 이상 입력해주세요.")
      .max(2000),
  })
  .refine(
    (v) => v.businessType === "preparing" || !!v.businessNumber,
    "사업자등록번호를 입력해주세요.",
  );
export const customerCompanyFields = {
  industry: z.string().max(200).default(""),
  businessType: z.string().max(100).default(""),
  address: z.string().max(200).default(""),
  website: z.string().max(2000).default(""),
  description: z.string().max(2000).default(""),
  email: z.string().max(254).default(""),
};
