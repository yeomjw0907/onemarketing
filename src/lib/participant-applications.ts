import { z } from "zod";
import { audit, execute, lock, query, transaction } from "./db";
import { save } from "./domain";
import {
  applicationSchema,
  type ParticipantApplication,
} from "./participant-application-schema";

export async function submitApplication(input: unknown) {
  const envelope = z
    .object({
      data: applicationSchema,
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
          consentAt: new Date().toISOString(),
          consentVersion: "2026-10-15",
        }),
      ],
    );
    return { id: envelope.key };
  });
}
export function listApplications() {
  return query<ParticipantApplication>(
    "select * from participant_applications order by created_at desc, id",
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
    if (old.status !== "new") throw new Error("이미 처리한 신청입니다.");
    if (old.version !== body.version)
      throw new Error(
        "다른 곳에서 수정되었습니다. 새로고침 후 다시 시도하세요.",
      );
    let participantId: string | null = null;
    if (body.action === "approve") {
      const p = await save(
        "participants",
        {
          name: body.data.name,
          nickname: body.data.nickname,
          phone: body.data.phone,
          email: body.data.email,
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
          accounts: body.data.accounts,
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
          : "new";
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
