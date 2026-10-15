import {
  applicationSchema,
  type ApplicationDraft,
} from "./participant-application-schema";
import { participantPaymentSchema } from "./participant-payment";
import { accountInputs } from "./application-accounts";

export function applicationReadiness(
  draft: ApplicationDraft | null,
  consent: boolean,
) {
  const missing = new Set<string>(),
    invalid = new Set<string>();
  if (!draft) return { ready: false, message: "신청서를 작성해주세요." };
  function add(path: PropertyKey[]) {
    const field = path[0];
    let label =
      (
        {
          name: "이름",
          phone: "휴대전화",
          email: "이메일",
          region: "활동 지역",
        } as Record<string, string>
      )[String(field)] || "신청 정보";
    if (!path.length) {
      invalid.add("중복 활동 계정");
      return;
    }
    if (field === "accounts") {
      const account = draft!.accounts[Number(path[1])];
      label = account
        ? `${accountInputs[account.channel]?.label || "활동 계정"}${draft!.accounts.length > 1 ? ` ${Number(path[1]) + 1}` : ""}`
        : "활동 계정";
    }
    if (field === "payment")
      label =
        path[1] === "bankName"
          ? "은행"
          : path[1] === "accountNumber"
            ? "계좌번호"
            : "정산 방식";
    const value = path.reduce<unknown>(
      (v, key) =>
        v && typeof v === "object"
          ? (v as Record<PropertyKey, unknown>)[key]
          : undefined,
      draft,
    );
    (!value ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && !value.length)
      ? missing
      : invalid
    ).add(label);
  }
  const parsed = applicationSchema.safeParse(draft);
  if (!parsed.success) parsed.error.issues.forEach((issue) => add(issue.path));
  const payment = participantPaymentSchema.safeParse(draft.payment);
  if (!payment.success)
    payment.error.issues.forEach((issue) => add(["payment", ...issue.path]));
  if (draft.phone.replace(/\D/g, "").length < 10)
    (draft.phone.trim() ? invalid : missing).add("휴대전화");
  if (!consent) missing.add("개인정보 동의");
  const ready = !missing.size && !invalid.size;
  const parts = [
    missing.size && `입력 필요: ${[...missing].join(" · ")}`,
    invalid.size && `확인 필요: ${[...invalid].join(" · ")}`,
  ].filter(Boolean);
  return {
    ready,
    message: ready ? "신청 준비가 완료되었습니다." : parts.join(" / "),
  };
}
