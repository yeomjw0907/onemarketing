import { z } from "zod";
import { participantPaymentSchema } from "./participant-payment";
import { normalizeApplicationAccount } from "./application-accounts";

export const applicationChannels = {
  blog: "네이버 블로그",
  instagram: "인스타그램",
  facebook: "페이스북",
  linkedin: "링크드인",
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
    payment: participantPaymentSchema.optional(),
    accounts: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            channel: z.enum([
              "blog",
              "clip",
              "instagram",
              "facebook",
              "linkedin",
              "youtube",
              "other",
            ]),
            url: z
              .string()
              .trim()
              .min(1, "활동 계정을 입력해주세요.")
              .max(2048),
            label: z.string().trim().max(100).default(""),
          })
          .transform((account, ctx) => {
            try {
              return {
                ...account,
                url: normalizeApplicationAccount(account.channel, account.url),
              };
            } catch (error) {
              ctx.addIssue({
                code: "custom",
                path: ["url"],
                message:
                  error instanceof Error
                    ? error.message
                    : "활동 계정을 확인해주세요.",
              });
              return z.NEVER;
            }
          }),
      )
      .min(1, "활동 계정을 하나 이상 입력하세요.")
      .max(10),
  })
  .superRefine((data, ctx) => {
    const urls = data.accounts.flatMap((a) => {
      try {
        const u = new URL(a.url);
        return [
          u.hostname.toLowerCase() + u.pathname.replace(/\/$/, "") + u.search,
        ];
      } catch {
        return [];
      }
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
