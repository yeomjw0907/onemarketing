export const socialProviders = ["kakao", "google", "naver"] as const;
export type SocialProvider = (typeof socialProviders)[number];
export const socialProviderLabels = {
  kakao: "카카오",
  google: "구글",
  naver: "네이버",
} as const;
export function identityProvider(key: unknown): SocialProvider {
  return String(key).startsWith("google:")
    ? "google"
    : String(key).startsWith("naver:")
      ? "naver"
      : "kakao";
}
// Existing portal links and applications use kakaoId/trustedKakaoId. Keep those
// storage keys compatible; non-Kakao subjects are provider-qualified, never raw IDs.
export function socialIdentityKey(provider: SocialProvider, subject: string) {
  if (provider === "kakao") {
    if (!/^[1-9]\d*$/.test(subject))
      throw new Error("로그인 계정을 확인해주세요.");
    return subject;
  }
  if (
    !subject ||
    subject.length > 255 ||
    /[\s\u0000-\u001f\u007f]/u.test(subject)
  )
    throw new Error("로그인 계정을 확인해주세요.");
  return provider + ":" + Buffer.from(subject).toString("base64url");
}
export function validIdentityKey(key: string) {
  return (
    /^[1-9]\d*$/.test(key) || /^(google|naver):[A-Za-z0-9_-]{2,340}$/.test(key)
  );
}
