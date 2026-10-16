import { accountIdentity } from "./account-identity";
import { list } from "./db";
import { z } from "zod";
import { audit, execute, lock, query, transaction, once } from "./db";
import { save } from "./domain";
import { participantPaymentSchema } from "./participant-payment";
import {
  applicationSchema,
  type ParticipantApplication,
} from "./participant-application-schema";

export async function submitApplication(input: unknown) {
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
      "select data from participant_applications where status='new'",
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
export function listApplications() {
  return query<ParticipantApplication>(
    "select a.* from participant_applications a where not exists (select 1 from records r where r.id=a.participant_id and r.data->>'deletedAt' is not null) order by a.created_at desc, a.id",
  );
}
export async function reviewApplication(input: unknown, actor: string) {
  const body = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      action: z.enum(["save", "approve", "reject"]),
      data: applicationSchema,
    })
    .parse(input);
  return transaction(async () => {
    await lock("save:participants");
    await lock("application-review:" + body.id);
    const old = (
      await query<ParticipantApplication>(
        "select * from participant_applications where id=$1",
        [body.id],
      )
    )[0];
    if (!old) throw new Error("신청을 찾을 수 없습니다.");
    if (old.status === "approved" && body.action === "approve")
      return { participantId: old.participant_id };
    if (old.status === "approved") throw new Error("이미 승인한 신청입니다.");
    if (old.version !== body.version)
      throw new Error(
        "다른 곳에서 수정되었습니다. 새로고침 후 다시 시도하세요.",
      );
    let participantId: string | null = null;
    if (body.action === "approve") {
      if (!body.data.accounts.some((a) => a.approvalStatus === "approved"))
        throw new Error("계정을 하나 이상 승인한 뒤 담당자를 등록하세요.");
      const p = await save(
        "participants",
        {
          referrerId:
            (old.data as unknown as { referrerId?: string }).referrerId || null,
          kakaoMarketingConsent: body.data.kakaoMarketingConsent === true,
          name: body.data.name,
          operationType: body.data.operationType || "self",
          teamName: body.data.teamName || "",
          nickname: body.data.nickname,
          phone: body.data.phone,
          email: body.data.email,
          payment: body.data.payment,
          contact: [body.data.phone, body.data.email]
            .filter(Boolean)
            .join(" · "),
          specialties: body.data.specialties,
          notes: [
            body.data.region && `활동 지역: ${body.data.region}`,
            body.data.introduction,
          ]
            .filter(Boolean)
            .join("\n"),
          accounts: body.data.accounts.map((a) => ({
            ...a,
            approvalStatus: a.approvalStatus || "pending",
          })),
          status: "active",
        },
        actor,
      );
      participantId = p.id;
    }
    const status =
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : old.status;
    await execute(
      "update participant_applications set data=$1::jsonb,status=$2,participant_id=$3,version=version+1,updated_at=now() where id=$4",
      [
        JSON.stringify({ ...old.data, ...body.data, reviewedBy: actor }),
        status,
        participantId,
        body.id,
      ],
    );
    await audit(actor, "participant-application-" + body.action, body.id, {
      participantId,
    });
    return { participantId };
  });
}

export async function reviewApplicationsBulk(input: unknown, actor: string) {
  const body = z
    .object({
      action: z.enum(["bulk-approve", "bulk-reject", "bulk-reapprove"]),
      key: z.string().uuid(),
      items: z
        .array(
          z.object({
            id: z.string().uuid(),
            version: z.number().int().positive(),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  if (new Set(body.items.map((i) => i.id)).size !== body.items.length)
    throw new Error("신청 선택이 중복되었습니다.");
  return once(actor + ":application-bulk:" + body.key, async () => {
    await lock("save:participants");
    const participantIds: string[] = [];
    for (const item of body.items) {
      const old = (
        await query<ParticipantApplication>(
          "select * from participant_applications where id=$1",
          [item.id],
        )
      )[0];
      if (!old)
        throw new Error(
          "신청을 찾을 수 없습니다. 새로고침 후 다시 선택해주세요.",
        );
      const expectedStatus =
        body.action === "bulk-reapprove" ? "rejected" : "new";
      if (old.status !== expectedStatus || old.version !== item.version)
        throw new Error(
          `${old.data.name}: 신청 상태나 내용이 변경되었습니다. 새로고침 후 다시 선택해주세요.`,
        );
      const approve = body.action !== "bulk-reject";
      const data = approve
        ? {
            ...old.data,
            accounts: old.data.accounts.map((a) => ({
              ...a,
              approvalStatus:
                a.approvalStatus === "rejected"
                  ? ("rejected" as const)
                  : ("approved" as const),
            })),
          }
        : old.data;
      try {
        const result = await reviewApplication(
          {
            id: item.id,
            version: item.version,
            action: approve ? "approve" : "reject",
            data,
          },
          actor,
        );
        if (result.participantId) participantIds.push(result.participantId);
      } catch (e) {
        throw new Error(
          `${old.data.name}: ${e instanceof Error ? e.message : "처리하지 못했습니다."}`,
        );
      }
    }
    return { processedCount: body.items.length, participantIds };
  });
}
