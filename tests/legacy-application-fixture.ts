// Pending applications created before automatic approval. New submissions are tested separately.
import { bindKakao } from "../src/lib/kakao-auth";
import { accountIdentity } from "../src/lib/account-identity";
import { list } from "../src/lib/db";
import { z } from "zod";
import { audit, execute, lock, query, transaction, once } from "../src/lib/db";
import { save } from "../src/lib/domain";
import { participantPaymentSchema } from "../src/lib/participant-payment";
import {
  applicationSchema,
  type ParticipantApplication,
} from "../src/lib/participant-application-schema";

export async function submitLegacyApplication(
  input: unknown,
  trustedKakaoId?: string,
) {
  const envelope = z
    .object({
      data: applicationSchema.refine(
        (data) => participantPaymentSchema.safeParse(data.payment).success,
        "정산 방식을 선택하고 계좌 정보를 확인해주세요.",
      ),
      consent: z.literal(true),
      website: z.string().max(0).optional(),
      key: z.string().uuid(),
    })
    .parse(input);
  return transaction(async () => {
    await lock("application-submit:" + envelope.key);
    if (trustedKakaoId) {
      await lock("kakao-application:" + trustedKakaoId);
      if (
        (await list("portal_links")).some(
          (l) =>
            l.purpose === "kakao-account" &&
            l.kakaoId === trustedKakaoId &&
            !l.revokedAt,
        )
      )
        throw new Error(
          "이미 연결된 참여자 계정이에요. 참여자 화면을 이용해주세요.",
        );
      const prior = await query<{ id: string }>(
        "select id from participant_applications where data->>'trustedKakaoId'=$1 and status in ('new','approved') and data->>'deletedAt' is null and id<>$2",
        [trustedKakaoId, envelope.key],
      );
      if (prior.length)
        throw new Error(
          "이미 신청을 접수했어요. 담당자 확인 후 카카오로 다시 로그인해주세요.",
        );
    }
    const existing = await query<{ id: string }>(
      "select id from participant_applications where id=$1",
      [envelope.key],
    );
    if (existing.length) return { id: existing[0].id };
    await lock("save:participants");
    await lock("application-accounts");
    const identities = envelope.data.accounts.map((a) =>
      accountIdentity(a.url),
    );
    for (const p of await list("participants")) {
      if (
        (p.accounts as { url: string }[]).some((a) =>
          identities.includes(accountIdentity(a.url)),
        )
      )
        throw new Error(
          "이미 등록된 활동 계정입니다. 담당자에게 계정 추가·변경을 문의해주세요.",
        );
    }
    const pending = await query<{ data: { accounts: { url: string }[] } }>(
      "select data from participant_applications where status='new' and data->>'deletedAt' is null",
    );
    if (
      pending.some((p) =>
        p.data.accounts.some((a) =>
          identities.includes(accountIdentity(a.url)),
        ),
      )
    )
      throw new Error("검토 중인 신청에 이미 포함된 활동 계정입니다.");
    let referrerId: string | null = null;
    if (envelope.data.referralCode) {
      const referrer = (await list("participants")).find(
        (p) => p.referralCode === envelope.data.referralCode,
      );
      if (!referrer || referrer.status !== "active")
        throw new Error("유효한 추천 코드를 입력해주세요.");
      if (
        String(referrer.phone).replace(/\D/g, "") ===
        envelope.data.phone.replace(/\D/g, "")
      )
        throw new Error("본인을 추천할 수 없습니다.");
      referrerId = referrer.id;
    }
    // Shared database lock keeps simultaneous submissions for one phone within the limit.
    const phone = envelope.data.phone.replace(/\D/g, "");
    await lock("application-phone:" + phone);
    const recent = await query<{ count: string }>(
      "select count(*) from participant_applications where regexp_replace(data->>'phone', '[^0-9]', '', 'g')=$1 and created_at > now() - interval '1 day'",
      [phone],
    );
    if (Number(recent[0].count) >= 3)
      throw new Error(
        "오늘 신청이 이미 접수되었습니다. 추가 문의는 담당자에게 연락해주세요.",
      );
    await execute(
      "insert into participant_applications (id,data) values ($1,$2::jsonb)",
      [
        envelope.key,
        JSON.stringify({
          ...envelope.data,
          trustedKakaoId,
          referrerId,
          accounts: envelope.data.accounts.map((a) => ({
            ...a,
            approvalStatus: "pending",
          })),
          consentAt: new Date().toISOString(),
          consentVersion: "2026-10-15-creator-terms-v3",
        }),
      ],
    );
    return { id: envelope.key };
  });
}
