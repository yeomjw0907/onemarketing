import { z } from "zod";

export const applicationChannels = {
  blog: "네이버 블로그",
  clip: "네이버 클립",
  instagram: "인스타그램",
  youtube: "유튜브",
  other: "기타",
} as const;
export const applicationSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력하세요.").max(200),
    nickname: z.string().trim().max(100).default(""),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+()\s-]{8,40}$/, "연락 가능한 전화번호를 입력하세요.")
      .refine(
        (v) => v.replace(/\D/g, "").length >= 8,
        "연락 가능한 전화번호를 입력하세요.",
      ),
    email: z
      .union([z.string().trim().email().max(254), z.literal("")])
      .default(""),
    region: z.string().trim().max(200).default(""),
    specialties: z.string().trim().max(1000).default(""),
    introduction: z.string().trim().max(3000).default(""),
    accounts: z
      .array(
        z.object({
          id: z.string().uuid(),
          channel: z.enum(["blog", "clip", "instagram", "youtube", "other"]),
          url: z
            .string()
            .trim()
            .url()
            .max(2048)
            .refine(
              (v) => ["https:", "http:"].includes(new URL(v).protocol),
              "웹 계정 주소를 입력하세요.",
            ),
          label: z.string().trim().max(100).default(""),
        }),
      )
      .min(1, "활동 계정을 하나 이상 입력하세요.")
      .max(10),
  })
  .superRefine((data, ctx) => {
    const urls = data.accounts.map((a) => {
      const u = new URL(a.url);
      return (
        u.hostname.toLowerCase() + u.pathname.replace(/\/$/, "") + u.search
      );
    });
    if (
      new Set(urls).size !== urls.length ||
      new Set(data.accounts.map((a) => a.id)).size !== data.accounts.length
    )
      ctx.addIssue({
        code: "custom",
        message: "같은 계정을 중복 입력할 수 없습니다.",
      });
  });
export type ApplicationDraft = z.infer<typeof applicationSchema>;
export type ParticipantApplication = {
  id: string;
  version: number;
  status: "new" | "approved" | "rejected";
  data: ApplicationDraft & {
    consentAt: string;
    consentVersion: string;
    reviewedBy?: string;
  };
  participant_id: string | null;
  created_at: string;
  updated_at: string;
};
