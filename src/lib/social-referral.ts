import { safeReturnPath } from "./campaign-display";
import { safeParticipantPortalReturn } from "./login-entry";
/** Referral input is context, not authentication; submitApplication validates ownership and eligibility. */
export function referralContext(value: unknown) {
  return typeof value === "string" && value.trim().length <= 40
    ? value.trim()
    : "";
}
export function socialSignupPath(
  provider: "kakao" | "google" | "naver",
  referral: unknown,
) {
  const params = new URLSearchParams(
    provider === "kakao" ? { kakao: "1" } : { social: "1" },
  );
  const code = referralContext(referral);
  if (code) params.set("ref", code);
  return "/participants/apply?" + params.toString();
}
export function participantSocialOnboardingPath(
  referral: unknown,
  next?: string,
) {
  const params = new URLSearchParams({ role: "participant", signup: "1" });
  const code = referralContext(referral);
  if (code) params.set("ref", code);
  const target = safeReturnPath(next) || safeParticipantPortalReturn(next);
  if (target) params.set("next", target);
  return "/login?" + params.toString();
}
