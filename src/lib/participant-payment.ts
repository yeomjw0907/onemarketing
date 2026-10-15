import { z } from "zod";

export const participantPaymentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("kakaopay") }),
  z.object({
    method: z.literal("bank"),
    bankName: z.string().trim().min(1, "은행을 입력해주세요.").max(100),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9 -]{6,40}$/, "계좌번호를 숫자로 입력해주세요.")
      .transform((v) => v.replace(/[ -]/g, ""))
      .refine((v) => v.length >= 6, "계좌번호를 확인해주세요."),
  }),
]);
export type ParticipantPayment = z.infer<typeof participantPaymentSchema>;

export function formatMobilePhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return digits.slice(0, 3) + "-" + digits.slice(3);
  return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
}
