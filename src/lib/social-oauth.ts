import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { create, list, lock, transaction, update } from "./db";
import { portalLinkParticipant } from "./portal-auth";
import { completeSocialIdentity } from "./kakao-auth";
import {
  socialIdentityKey,
  socialProviderLabels,
  type SocialProvider,
} from "./social-identity";
export type AdditionalProvider = Exclude<SocialProvider, "kakao">;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function additionalProvider(value: string): AdditionalProvider {
  if (value !== "google" && value !== "naver")
    throw new Error("지원하지 않는 로그인 방식입니다.");
  return value;
}
export function socialConfigured(provider: AdditionalProvider) {
  const prefix = provider.toUpperCase();
  return (
    process.env[prefix + "_LOGIN_ENABLED"] === "true" &&
    !!process.env[prefix + "_CLIENT_ID"] &&
    !!process.env[prefix + "_CLIENT_SECRET"]
  );
}
export function socialCallback(provider: AdditionalProvider) {
  const url = new URL(process.env.APP_URL!);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("로그인 서비스 주소를 확인해주세요.");
  return new URL(`/api/auth/${provider}/callback`, url).toString();
}
export async function beginSocial(
  provider: AdditionalProvider,
  role: "participant" | "advertiser",
  access?: string,
) {
  if (!socialConfigured(provider))
    throw new Error(
      `${socialProviderLabels[provider]} 로그인 연결을 준비 중이에요.`,
    );
  const candidateId = access ? await portalLinkParticipant(access) : undefined;
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(32).toString("base64url");
  const url = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://nid.naver.com/oauth2.0/authorize",
  );
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env[provider.toUpperCase() + "_CLIENT_ID"]!,
    redirect_uri: socialCallback(provider),
    state,
  }).toString();
  if (provider === "google") {
    url.searchParams.set("scope", "openid profile");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set(
      "code_challenge",
      createHash("sha256").update(verifier).digest("base64url"),
    );
    url.searchParams.set("code_challenge_method", "S256");
  }
  await create("portal_links", {
    purpose: "social-oauth",
    provider,
    role,
    candidateId,
    tokenHash: hash(state),
    verifier: provider === "google" ? verifier : undefined,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  return { state, url: url.toString() };
}
async function providerRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("로그인 인증에 실패했어요. 다시 시도해주세요.");
  return response.json();
}
export async function completeSocial(
  provider: AdditionalProvider,
  state: string,
  cookieState: string,
  code: string,
) {
  if (
    !socialConfigured(provider) ||
    !/^[a-f0-9]{64}$/.test(state) ||
    state.length !== cookieState.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState)) ||
    !code ||
    code.length > 4096
  )
    throw new Error("로그인 요청을 다시 시작해주세요.");
  const attempt = await transaction(async () => {
    await lock("social-state:" + hash(state));
    const row = (await list("portal_links")).find(
      (r) =>
        r.purpose === "social-oauth" &&
        r.provider === provider &&
        r.tokenHash === hash(state),
    );
    if (
      !row ||
      row.revokedAt ||
      row.usedAt ||
      !(Date.parse(String(row.expiresAt)) > Date.now())
    )
      throw new Error("로그인 요청이 만료되었어요.");
    const claimed = await update(row.id, {
      usedAt: new Date().toISOString(),
      verifier: null,
    });
    return { ...claimed, verifier: row.verifier };
  });
  const prefix = provider.toUpperCase();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env[prefix + "_CLIENT_ID"]!,
    client_secret: process.env[prefix + "_CLIENT_SECRET"]!,
    code,
    redirect_uri: socialCallback(provider),
  });
  if (provider === "google")
    body.set("code_verifier", String(attempt.verifier));
  else body.set("state", state);
  const token = await providerRequest(
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://nid.naver.com/oauth2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (
    token.error ||
    typeof token.access_token !== "string" ||
    !token.access_token
  )
    throw new Error("로그인 응답을 확인할 수 없어요.");
  // Read identity from the fixed provider endpoint over TLS. Never trust decoded,
  // unverified ID-token claims or merge accounts using a profile email address.
  const payload = await providerRequest(
    provider === "google"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://openapi.naver.com/v1/nid/me",
    { headers: { Authorization: "Bearer " + token.access_token } },
  );
  const profile = provider === "google" ? payload : payload.response;
  if (provider === "naver" && payload.resultcode !== "00")
    throw new Error("네이버 계정을 확인할 수 없어요.");
  const subject = provider === "google" ? profile?.sub : profile?.id;
  if (typeof subject !== "string")
    throw new Error("로그인 계정을 확인할 수 없어요.");
  const nickname =
    typeof profile?.name === "string"
      ? profile.name
      : typeof profile?.nickname === "string"
        ? profile.nickname
        : socialProviderLabels[provider] + " 사용자";
  return completeSocialIdentity(
    socialIdentityKey(provider, subject),
    nickname.slice(0, 100),
    attempt,
  );
}
