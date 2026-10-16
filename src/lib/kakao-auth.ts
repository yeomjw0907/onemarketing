import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import {
  create,
  get,
  list,
  update,
  transaction,
  lock,
  audit,
  execute,
} from "./db";
import { portalLinkParticipant } from "./portal-auth";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const live = (r: Record<string, unknown>) =>
  !r.revokedAt && Date.parse(String(r.expiresAt)) > Date.now();
export function kakaoConfigured() {
  return (
    process.env.KAKAO_LOGIN_ENABLED === "true" &&
    !!process.env.KAKAO_CLIENT_ID &&
    !!process.env.KAKAO_CLIENT_SECRET
  );
}
export function kakaoCallback() {
  return new URL("/api/auth/kakao/callback", process.env.APP_URL!).toString();
}
export async function beginKakao(access?: string, reselect = false) {
  if (!kakaoConfigured()) throw new Error("카카오 로그인을 준비 중이에요.");
  const participantId = access
    ? await portalLinkParticipant(access)
    : undefined;
  const state = randomBytes(32).toString("hex");
  await create("portal_links", {
    purpose: "kakao-oauth",
    tokenHash: hash(state),
    candidateId: participantId,
    expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
  });
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.KAKAO_CLIENT_ID!,
    redirect_uri: kakaoCallback(),
    response_type: "code",
    state,
  }).toString();
  if (reselect) url.searchParams.set("prompt", "login");
  return { state, url: url.toString() };
}
async function kakaoRequest(url: string, init: RequestInit) {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("카카오 로그인에 실패했어요. 다시 시도해주세요.");
  return r.json();
}
export async function completeKakao(
  state: string,
  cookieState: string,
  code: string,
) {
  if (
    !kakaoConfigured() ||
    !/^[a-f0-9]{64}$/.test(state) ||
    state.length !== cookieState.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
  )
    throw new Error("로그인 요청을 다시 시작해주세요.");
  const attempt = await transaction(async () => {
    await lock("kakao-state:" + hash(state));
    const r = (await list("portal_links")).find(
      (l) => l.purpose === "kakao-oauth" && l.tokenHash === hash(state),
    );
    if (!r || !live(r) || r.usedAt)
      throw new Error("로그인 요청이 만료되었어요.");
    return update(r.id, { usedAt: new Date().toISOString() });
  });
  const token = await kakaoRequest("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_CLIENT_ID!,
      client_secret: process.env.KAKAO_CLIENT_SECRET!,
      redirect_uri: kakaoCallback(),
      code,
    }),
  });
  if (typeof token.access_token !== "string")
    throw new Error("카카오 로그인 응답을 확인할 수 없어요.");
  const user = await kakaoRequest("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: "Bearer " + token.access_token },
  });
  if (!Number.isSafeInteger(user.id) || user.id <= 0)
    throw new Error("카카오 계정을 확인할 수 없어요.");
  const kakaoId = String(user.id),
    nickname = String(
      user.kakao_account?.profile?.nickname || "카카오 사용자",
    ).slice(0, 100);
  const binding = (await list("portal_links")).find(
    (l) =>
      l.purpose === "kakao-account" && l.kakaoId === kakaoId && !l.revokedAt,
  );
  if (binding)
    return {
      session: await issueKakaoSession(String(binding.participantId)),
      identity: undefined,
    };
  const identity = randomBytes(32).toString("hex");
  await create("portal_links", {
    purpose: "kakao-login",
    kakaoId,
    nickname,
    candidateId: attempt.candidateId,
    tokenHash: hash(identity),
    expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
  });
  return { identity, session: undefined };
}
export async function pendingKakao(identity: string) {
  const r = (await list("portal_links")).find(
    (l) =>
      l.purpose === "kakao-login" && l.tokenHash === hash(identity) && live(l),
  );
  if (!r) throw new Error("카카오 로그인을 다시 진행해주세요.");
  return r;
}
export async function issueKakaoSession(participantId: string) {
  return transaction(async () => {
    await lock("portal:" + participantId);
    const p = await get(participantId);
    if (p?.kind !== "participants" || p.status !== "active" || p.deletedAt)
      throw new Error(
        "현재 참여할 수 없는 계정이에요. 담당자에게 문의해주세요.",
      );
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const parent = await create("portal_links", {
      participantId,
      tokenHash: hash(randomBytes(32).toString("hex")),
      expiresAt,
    });
    const session = randomBytes(32).toString("hex");
    await create("portal_links", {
      purpose: "session",
      provider: "kakao",
      participantId,
      parentId: parent.id,
      tokenHash: hash(session),
      verifiedPhone: String(p.phone || "").replace(/\D/g, ""),
      expiresAt,
    });
    return session;
  });
}
export async function bindKakao(
  kakaoId: string,
  participantId: string,
  actor: string,
  evidence: string,
) {
  if (!/^[1-9]\d*$/.test(kakaoId))
    throw new Error("카카오 계정을 다시 확인해주세요.");
  return transaction(async () => {
    await lock("save:participants");
    await lock("kakao-bind");
    const p = await get(participantId);
    if (p?.kind !== "participants" || p.status !== "active" || p.deletedAt)
      throw new Error("활동 중인 참여자를 선택하세요.");
    const bindings = (await list("portal_links")).filter(
      (l) => l.purpose === "kakao-account" && !l.revokedAt,
    );
    const old = bindings.find((l) => l.kakaoId === kakaoId);
    if (old && old.participantId !== participantId)
      throw new Error("이미 다른 참여자와 연결된 카카오 계정이에요.");
    if (
      bindings.some(
        (l) => l.participantId === participantId && l.kakaoId !== kakaoId,
      )
    )
      throw new Error("이미 다른 카카오 계정이 연결된 참여자예요.");
    if (!old)
      await create("portal_links", {
        purpose: "kakao-account",
        kakaoId,
        participantId,
      });
    await audit(actor, "kakao-account-linked", participantId, { evidence });
  });
}

export async function unlinkKakao(kakaoId: string) {
  await transaction(async () => {
    await lock("save:participants");
    await lock("kakao-bind");
    for (const row of (await list("portal_links")).filter(
      (l) => l.kakaoId === kakaoId,
    ))
      await update(row.id, {
        revokedAt: new Date().toISOString(),
        kakaoId: null,
        nickname: null,
        name: null,
        phone: null,
        status: "cancelled",
      });
    await execute(
      "update participant_applications set data=data-'trustedKakaoId',version=version+1,updated_at=now() where data->>'trustedKakaoId'=$1",
      [kakaoId],
    );
  });
}
export async function requestKakaoLink(
  identity: string,
  name: string,
  phone: string,
) {
  const r = await pendingKakao(identity);
  if (
    !name.trim() ||
    name.length > 100 ||
    !/^01\d{8,9}$/.test(phone.replace(/\D/g, ""))
  )
    throw new Error("등록된 이름과 휴대폰 번호를 확인해주세요.");
  return transaction(async () => {
    await lock("kakao-request:" + String(r.kakaoId));
    const existing = (await list("portal_links")).find(
      (l) =>
        l.purpose === "kakao-link-request" &&
        l.kakaoId === r.kakaoId &&
        l.status === "pending",
    );
    if (existing) return existing;
    return create("portal_links", {
      purpose: "kakao-link-request",
      kakaoId: r.kakaoId,
      nickname: r.nickname,
      candidateId: r.candidateId,
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      status: "pending",
    });
  });
}
export async function reviewKakaoLink(
  id: string,
  participantId: string,
  approve: boolean,
  evidence: string,
  actor: string,
) {
  return transaction(async () => {
    await lock("save:participants");
    await lock("kakao-request-review:" + id);
    const r = await get(id);
    if (r?.purpose !== "kakao-link-request" || r.status !== "pending")
      throw new Error("처리할 연결 요청을 확인하세요.");
    if (!evidence.trim())
      throw new Error("등록 연락처로 확인한 근거를 입력하세요.");
    if (approve)
      await bindKakao(String(r.kakaoId), participantId, actor, evidence);
    await update(id, {
      status: approve ? "approved" : "rejected",
      participantId: approve ? participantId : undefined,
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor,
    });
  });
}
