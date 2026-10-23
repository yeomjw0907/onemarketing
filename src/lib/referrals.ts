import { participantPaymentSchema } from "./participant-payment";
import { queueNotification } from "./sens";
import { create, get, list, update, lock, audit, transaction } from "./db";
import { referralRates } from "./workflow-policy";
import type { RecordData } from "./types";
export async function syncReferral(
  source: RecordData,
  paid: boolean,
  actor: string,
) {
  await syncCampaignReferral(source, paid, actor);
  if (source.participantId)
    await syncSignupBonus(String(source.participantId), actor);
}

export async function syncSignupBonus(participantId: string, actor: string) {
  await lock("signup-bonus:" + participantId);
  let credits = await list("referral_credits");
  let bonus = credits.find(
    (c) => c.type === "signup" && c.referredParticipantId === participantId,
  );
  if (!bonus || bonus.status === "cancelled" || bonus.excludedAt) return;
  if (bonus.status === "paid" && bonus.eligibility !== "first_campaign_paid")
    return;
  await lock("referral-source:" + bonus.sourceId);
  bonus = await get(bonus.id);
  if (!bonus || bonus.status === "cancelled" || bonus.excludedAt) return;
  credits = await list("referral_credits");
  const participant = await get(participantId);
  const referrer = await get(String(bonus.participantId));
  if (!participant || participant.deletedAt || !referrer || referrer.deletedAt)
    return;
  const qualifying = [];
  for (const credit of credits) {
    if (
      credit.type === "signup" ||
      credit.referredParticipantId !== participantId ||
      !["available", "paid"].includes(String(credit.status))
    )
      continue;
    const source = await get(String(credit.sourceId));
    // A task payment inside a slot can be a partial bundle payment. The complete
    // slot earns its own credit after every post has been verified and paid.
    if (
      !source ||
      (source.kind === "tasks" && source.workSlotId) ||
      (source.kind === "posting_sets" && source.workSlotId)
    )
      continue;
    if (!["tasks", "posting_sets", "work_slots"].includes(source.kind))
      continue;
    qualifying.push(credit);
  }
  const source =
    qualifying.find((c) => c.sourceId === bonus.qualifyingSourceId) ||
    qualifying[0];
  const status = source
    ? bonus.status === "paid" || bonus.status === "recovery_required"
      ? "paid"
      : "available"
    : bonus.status === "paid" || bonus.status === "recovery_required"
      ? "recovery_required"
      : "pending_campaign";
  if (
    bonus.status === status &&
    bonus.qualifyingSourceId === (source?.sourceId || null)
  )
    return;
  await update(bonus.id, {
    status,
    qualifyingSourceId: source?.sourceId || null,
    eligibility: "first_campaign_paid",
    earnedBy: actor,
  });
  await audit(actor, "signup-bonus-eligibility", bonus.id, {
    status,
    qualifyingSourceId: source?.sourceId || null,
  });
}

async function syncCampaignReferral(
  source: RecordData,
  paid: boolean,
  actor: string,
) {
  if (!source.participantId) return;
  if (paid)
    await queueNotification(
      String(source.participantId),
      "payment",
      source.id + ":paid",
      { name: String(source.name || "게시 작업") },
    );
  await lock("referral-source:" + source.id);
  const previous = (await list("referral_credits")).find(
    (c) => c.sourceId === source.id,
  );
  if (!paid) {
    if (previous && previous.status !== "cancelled")
      await update(previous.id, {
        status: previous.status === "paid" ? "recovery_required" : "cancelled",
        cancelledAt: new Date().toISOString(),
      });
    return;
  }
  if (previous && previous.status !== "cancelled") return;
  const p = await get(String(source.participantId));
  const referrerId =
    source.referrerSnapshot !== undefined
      ? source.referrerSnapshot
      : p?.referrerId;
  if (!p || !referrerId) return;
  const referrer = await get(String(referrerId));
  if (!referrer || referrer.id === p.id)
    throw new Error("추천 관계를 확인하세요.");
  const type =
    source.kind === "posting_sets"
      ? "bundle"
      : String(source.type || source.channel);
  const amount =
    Number(
      source.referralRate ?? referralRates[type as keyof typeof referralRates],
    ) - Number(source.partialReferralAmount || 0);
  if (!amount) return;
  if (previous)
    await update(previous.id, {
      status: "available",
      amount,
      cancelledAt: null,
    });
  else
    await create("referral_credits", {
      sourceId: source.id,
      projectId: source.projectId,
      participantId: referrer.id,
      referredParticipantId: p.id,
      amount,
      type,
      status: "available",
      earnedBy: actor,
    });
}
export async function settleReferrals(participantId: string, actor: string) {
  return transaction(async () => {
    await lock("save:participants");
    await lock("referral-settle:" + participantId);
    const credits = (await list("referral_credits"))
      .filter(
        (c) => c.participantId === participantId && c.status === "available",
      )
      .sort(
        (a, b) =>
          Number(a.type === "signup") - Number(b.type === "signup") ||
          String(a.sourceId).localeCompare(String(b.sourceId)),
      );
    if (!credits.length) throw new Error("지급 가능한 추천료가 없습니다.");
    if (credits.some((c) => c.type === "signup" && !c.qualifyingSourceId))
      throw new Error(
        "친구의 첫 캠페인 완료 및 원고료 지급 후 정산할 수 있습니다.",
      );
    for (const c of credits) await lock("referral-source:" + c.sourceId);
    const fresh = await list("referral_credits");
    const selected = credits.map((c) => fresh.find((f) => f.id === c.id)!);
    if (selected.some((c) => c.status !== "available"))
      throw new Error("추천료 상태가 변경되었습니다.");
    const p = await get(participantId);
    if (!p || p.deletedAt || p.status !== "active")
      throw new Error("이용 중인 참여자만 정산할 수 있습니다.");
    const payment = participantPaymentSchema.parse(p.payment);
    const settlement = await create("participant_settlements", {
      participantId,
      total: selected.reduce((n, c) => n + Number(c.amount), 0),
      items: [],
      referralCreditIds: selected.map((c) => c.id),
      payment,
      status: "paid",
      paidAt: new Date().toISOString(),
      paidBy: actor,
    });
    for (const c of selected)
      await update(c.id, {
        status: "paid",
        settlementId: settlement.id,
        paidAt: settlement.paidAt,
      });
    await audit(actor, "referral-settlement", settlement.id);
    return settlement;
  });
}
export async function changeReferrer(
  participantId: string,
  referrerId: string | null,
  reason: string,
  actor: string,
) {
  return transaction(async () => {
    if (!reason.trim()) throw new Error("변경 사유를 입력하세요.");
    await lock("save:participants");
    const p = await get(participantId);
    if (p?.kind !== "participants") throw new Error("참여자를 선택하세요.");
    let current = referrerId;
    const visited = new Set([participantId]);
    while (current) {
      if (visited.has(current))
        throw new Error("자기·순환 추천은 허용되지 않습니다.");
      visited.add(current);
      const r = await get(current);
      if (r?.kind !== "participants")
        throw new Error("추천인을 찾을 수 없습니다.");
      current = r.referrerId ? String(r.referrerId) : null;
    }
    const result = await update(p.id, { referrerId });
    await audit(actor, "referrer-change", p.id, {
      from: p.referrerId || null,
      to: referrerId,
      reason,
    });
    return result;
  });
}
