import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { create, get, list, update, transaction, lock } from "./db";
import { sensRequest } from "./sens";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const phoneOf = (v: unknown) => String(v || "").replace(/\D/g, "");
const valid = (r: Record<string, unknown>) =>
  !r.revokedAt && Date.parse(String(r.expiresAt)) > Date.now();
export function smsAuthConfigured() {
  return (
    process.env.SENS_SMS_ENABLED === "true" &&
    [
      "NCP_ACCESS_KEY",
      "NCP_SECRET_KEY",
      "SENS_SMS_SERVICE_ID",
      "SENS_SMS_FROM",
    ].every((k) => !!process.env[k])
  );
}
export async function requestPortalCode(input: {
  access?: string;
  phone?: string;
  ip: string;
}) {
  if (!smsAuthConfigured())
    throw new Error("휴대폰 인증을 준비 중이에요. 담당자에게 문의해주세요.");
  const challenge = randomBytes(32).toString("hex"),
    code = String(randomInt(100000, 1000000));
  const ipHash = hash(input.ip);
  const claimed = await transaction(async () => {
    await lock("portal-auth-ip:" + ipHash);
    const links = await list("portal_links");
    const recent = links.filter(
      (l) =>
        l.purpose === "challenge" &&
        Date.parse(l.createdAt) > Date.now() - 3600000,
    );
    if (recent.filter((l) => l.ipHash === ipHash).length >= 20)
      throw new Error("인증 요청이 많아요. 잠시 후 다시 시도해주세요.");
    let parent = input.access
      ? links.find(
          (l) => !l.purpose && l.tokenHash === hash(input.access!) && valid(l),
        )
      : undefined;
    let p = parent ? await get(String(parent.participantId)) : undefined;
    if (!input.access) {
      const phone = phoneOf(input.phone);
      if (!/^01\d{8,9}$/.test(phone))
        throw new Error("휴대폰 번호를 확인해주세요.");
      const matches = (await list("participants")).filter(
        (p) => p.status === "active" && phoneOf(p.phone) === phone,
      );
      if (matches.length === 1) p = matches[0];
    }
    if (input.access && !parent)
      throw new Error(
        "접속 링크가 만료되었어요. 담당자에게 새 링크를 요청해주세요.",
      );
    if (p?.status !== "active") p = undefined;
    const phone = phoneOf(p?.phone);
    if (p) {
      await lock("portal:" + p.id);
      const attempts = (await list("portal_links")).filter(
        (l) =>
          l.purpose === "challenge" &&
          l.participantId === p!.id &&
          Date.parse(l.createdAt) > Date.now() - 3600000,
      );
      if (
        attempts.length >= 5 ||
        attempts.some((l) => Date.parse(l.createdAt) > Date.now() - 60000)
      )
        throw new Error(
          "재전송은 1분 뒤 가능하며, 1시간에 최대 5회 요청할 수 있어요.",
        );
      if (!/^01\d{8,9}$/.test(phone))
        throw new Error("등록된 휴대폰 번호를 담당자에게 확인해주세요.");
      if (!parent)
        parent = await create("portal_links", {
          participantId: p.id,
          tokenHash: hash(randomBytes(32).toString("hex")),
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      for (const old of (await list("portal_links")).filter(
        (l) =>
          l.purpose === "challenge" && l.participantId === p!.id && !l.usedAt,
      ))
        await update(old.id, { revokedAt: new Date().toISOString() });
    }
    return create("portal_links", {
      purpose: "challenge",
      participantId: p?.id,
      parentId: parent?.id,
      ipHash,
      tokenHash: hash(challenge),
      codeHash: hash(challenge + code),
      verifiedPhone: phone,
      expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
      attempts: 0,
      status: "pending",
    });
  });
  try {
    if (claimed.participantId) {
      const response = await sensRequest(
        "POST",
        "/sms/v2/services/" + process.env.SENS_SMS_SERVICE_ID + "/messages",
        {
          type: "SMS",
          contentType: "COMM",
          countryCode: "82",
          from: process.env.SENS_SMS_FROM,
          content: "[원케이션] 인증번호 " + code + " (5분 이내 입력)",
          messages: [{ to: claimed.verifiedPhone }],
        },
      );
      if (String(response.statusCode) !== "202")
        throw new Error("SMS rejected");
    }
    await update(claimed.id, { status: "sent" });
  } catch {
    await update(claimed.id, { status: "failed" });
    throw new Error("인증번호를 보내지 못했어요. 잠시 후 다시 요청해주세요.");
  }
  return { challenge };
}
export async function verifyPortalCode(challenge: string, code: string) {
  const result = await transaction(async () => {
    await lock("portal-auth-challenge:" + hash(challenge));
    const row = (await list("portal_links")).find(
      (l) => l.purpose === "challenge" && l.tokenHash === hash(challenge),
    );
    if (
      !row ||
      !valid(row) ||
      row.usedAt ||
      row.status !== "sent" ||
      Number(row.attempts) >= 5
    )
      return null;
    await lock("portal:" + String(row.participantId));
    const parent = await get(String(row.parentId)),
      p = await get(String(row.participantId));
    if (
      !parent ||
      !valid(parent) ||
      p?.status !== "active" ||
      phoneOf(p.phone) !== row.verifiedPhone
    )
      return null;
    const a = Buffer.from(String(row.codeHash), "hex"),
      b = Buffer.from(hash(challenge + code), "hex");
    if (
      !/^\d{6}$/.test(code) ||
      a.length !== b.length ||
      !timingSafeEqual(a, b)
    ) {
      await update(row.id, { attempts: Number(row.attempts) + 1 });
      return null;
    }
    await update(row.id, { usedAt: new Date().toISOString(), codeHash: null });
    const session = randomBytes(32).toString("hex");
    await create("portal_links", {
      purpose: "session",
      participantId: p.id,
      parentId: parent.id,
      tokenHash: hash(session),
      verifiedPhone: row.verifiedPhone,
      expiresAt: parent.expiresAt,
    });
    return session;
  });
  if (!result)
    throw new Error(
      "인증번호가 틀렸거나 만료되었어요. 5회 오류 시 새 인증번호를 요청해주세요.",
    );
  return result;
}

export async function portalLinkParticipant(access: string) {
  if (!/^[a-f0-9]{64}$/.test(access))
    throw new Error("접속 링크를 확인해주세요.");
  const link = (await list("portal_links")).find(
    (l) => !l.purpose && l.tokenHash === hash(access) && valid(l),
  );
  if (!link)
    throw new Error(
      "접속 링크가 만료되었어요. 담당자에게 새 링크를 요청해주세요.",
    );
  return String(link.participantId);
}
export async function revokePortalSession(session: string) {
  const row = (await list("portal_links")).find(
    (l) => l.purpose === "session" && l.tokenHash === hash(session),
  );
  if (row) await update(row.id, { revokedAt: new Date().toISOString() });
}
