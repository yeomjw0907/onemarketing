import { syncReferral } from "./referrals";
import { z } from "zod";
import { create, update } from "./db";
import { requireRecord } from "./domain";
import { participantAssignment } from "./participants";
import {
  createPostingSet,
  dissolvePostingSet,
  payPostingSet,
} from "./posting-sets";
import { rewardDefaults } from "./sales-cart";
import type { RecordData } from "./types";
export async function assignWorkSlot(
  slot: RecordData,
  input: Record<string, unknown>,
  actor: string,
) {
  if (
    slot.kind !== "work_slots" ||
    slot.status === "cancelled" ||
    !((slot.taskIds as string[]) || []).length
  )
    throw new Error("유효한 판매 슬롯을 선택하세요.");
  const project = await requireRecord(String(slot.projectId), "projects");
  if (project.commerceCampaignId)
    throw new Error("연결된 공개 캠페인에서 참여자를 선정·지급하세요.");
  if (
    project.hold ||
    project.settled ||
    ["completed", "cancelled"].includes(String(project.status))
  )
    throw new Error("마감·보류 프로젝트는 배정할 수 없습니다.");
  const body = z
    .object({
      participantId: z.union([z.string().uuid(), z.literal("")]),
      blogAccountId: z.string().optional(),
      clipAccountId: z.string().optional(),
    })
    .parse(input);
  let tasks = await Promise.all(
    (slot.taskIds as string[]).map((id) => requireRecord(id, "tasks")),
  );
  if (
    tasks.some(
      (t) =>
        t.projectId !== project.id ||
        t.workSlotId !== slot.id ||
        t.payoutStatus === "paid" ||
        t.payoutCommitted ||
        ["cancelled", "delivered", "submitted", "verified"].includes(
          String(t.status),
        ),
    )
  )
    throw new Error("전달·지급 전 슬롯만 담당자를 변경할 수 있습니다.");
  if (Number(input.version) !== slot.version)
    throw new Error("변경 충돌이 발생했습니다.");
  if (slot.postingSetId) {
    const set = await requireRecord(String(slot.postingSetId), "posting_sets");
    await dissolvePostingSet(set, { version: set.version });
    tasks = await Promise.all(
      (slot.taskIds as string[]).map((id) => requireRecord(id, "tasks")),
    );
  }
  let postingSetId: null | string = null;
  let amount = rewardDefaults[slot.type as keyof typeof rewardDefaults];
  let participant: RecordData | null = null;
  if (body.participantId) {
    participant = await requireRecord(body.participantId, "participants");
    if (participant.status !== "active")
      throw new Error("활동 중인 체험단을 선택하세요.");
    const field =
      slot.type === "bundle"
        ? "bundleRate"
        : slot.type === "blog"
          ? "blogRate"
          : "clipRate";
    amount =
      typeof participant[field] === "number"
        ? Number(participant[field])
        : amount;
  }
  if (slot.type === "bundle" && participant) {
    const blog = tasks.find((t) => t.channel === "blog"),
      clip = tasks.find((t) => t.channel === "clip");
    if (!blog || !clip) throw new Error("묶음 슬롯 작업을 확인하세요.");
    const set = await createPostingSet(
      project,
      {
        participantId: participant.id,
        blogTaskId: blog.id,
        clipTaskId: clip.id,
        blogAccountId: body.blogAccountId,
        clipAccountId: body.clipAccountId,
        amount,
        instructions: "",
        replacePayouts: true,
      },
      { allowMultiple: true, workSlotId: slot.id },
    );
    await update(set.id, { workSlotId: slot.id });
    postingSetId = set.id;
  } else {
    for (const t of tasks) {
      const assignment = await participantAssignment(t, {
        participantId: body.participantId,
        participantAccountId:
          t.channel === "blog" ? body.blogAccountId : body.clipAccountId,
        assignee: "",
      });
      await update(
        t.id,
        {
          ...assignment,
          payout: slot.type === "bundle" && t.channel === "clip" ? 0 : amount,
          postingSetId: null,
          assignedAt: participant ? new Date().toISOString() : null,
        },
        t.version,
      );
    }
  }
  const result = await update(
    slot.id,
    {
      participantId: participant?.id || null,
      referrerSnapshot: participant?.referrerId || null,
      referralRate: slot.type === "bundle" ? 1200 : 500,
      participantName: participant?.nickname || participant?.name || "",
      participantSnapshot: participant
        ? {
            name: participant.name,
            phone: participant.phone || participant.contact,
            email: participant.email,
          }
        : null,
      amount,
      postingSetId,
      status: participant ? "assigned" : "unassigned",
      assignedAt: participant ? new Date().toISOString() : null,
    },
    slot.version,
  );
  if (participant)
    await create("participant_events", {
      participantId: participant.id,
      projectId: project.id,
      slotId: slot.id,
      type: "assignment",
      actor,
      occurredAt: new Date().toISOString(),
      note: `${slot.name} 배정 · ${amount}원`,
    });
  return result;
}
export async function payWorkSlot(
  slot: RecordData,
  input: Record<string, unknown>,
  actor: string,
) {
  if (slot.kind !== "work_slots" || !slot.participantId)
    throw new Error("배정한 슬롯을 선택하세요.");
  const paid = z.boolean().parse(input.paid);
  if (!paid && ((slot.partialPaidTaskIds as string[]) || []).length)
    throw new Error(
      "부분 지급 묶음 취소는 담당자 확인 후 개별 지급 기록을 먼저 정리하세요.",
    );
  const tasks = await Promise.all(
    (slot.taskIds as string[]).map((id) => requireRecord(id, "tasks")),
  );
  if (
    tasks.some(
      (t) =>
        t.workSlotId !== slot.id ||
        t.participantId !== slot.participantId ||
        (paid && t.status !== "verified"),
    )
  )
    throw new Error("슬롯의 모든 게시물을 확인한 뒤 지급하세요.");
  if (slot.postingSetId) {
    const set = await requireRecord(String(slot.postingSetId), "posting_sets");
    await payPostingSet(set, { paid, version: set.version }, actor);
  } else
    for (const t of tasks)
      await update(
        t.id,
        {
          payoutStatus: paid ? "paid" : "pending",
          paidAt: paid ? new Date().toISOString() : null,
        },
        t.version,
      );
  await syncReferral(slot, paid, actor);
  return update(
    slot.id,
    {
      payoutStatus: paid ? "paid" : "pending",
      paidAt: paid ? new Date().toISOString() : null,
    },
    Number(input.version),
  );
}
