import { z } from "zod";
import { audit, create, get, lock, update, view } from "./db";
import { participantPaymentSchema } from "./participant-payment";
import { settlementItems } from "./participant-settlement-view";
import { payWorkSlot } from "./work-slots";
import { payPostingSet } from "./posting-sets";
import type { RecordData } from "./types";

export async function settleParticipant(
  participant: RecordData,
  input: Record<string, unknown>,
  actor: string,
) {
  if (participant.kind !== "participants")
    throw new Error("정산 담당자를 선택하세요.");
  const body = z
    .object({
      version: z.number().int().positive(),
      items: z
        .array(
          z.object({ id: z.string().uuid(), token: z.string().max(20000) }),
        )
        .min(1)
        .max(100),
      note: z.string().trim().max(2000).default(""),
    })
    .parse(input);
  if (new Set(body.items.map((i) => i.id)).size !== body.items.length)
    throw new Error("정산 항목이 중복되었습니다.");
  await lock("participant-settle:" + participant.id);
  await lock("save:participants");
  await lock("save:participant_history");
  const current = await get(participant.id);
  if (!current || current.version !== body.version)
    throw new Error("담당자 정보가 변경되었습니다. 새로고침하세요.");
  const payment = participantPaymentSchema.parse(current.payment);
  const sources = [];
  for (const item of body.items) sources.push(await get(item.id));
  const projectIds = [
    ...new Set(
      sources
        .map((s) => s?.projectId)
        .filter(Boolean)
        .map(String),
    ),
  ].sort();
  for (const id of projectIds) await lock("project-operations:" + id);
  const data = await view();
  const available = settlementItems(data, participant.id);
  const selected = body.items.map((item) => {
    const row = available.find(
      (a) => a.id === item.id && a.token === item.token,
    );
    if (!row)
      throw new Error(
        "지급 가능 내역이 변경되었습니다. 새로고침 후 다시 확인하세요.",
      );
    return row;
  });
  const total = selected.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isSafeInteger(total))
    throw new Error("합산 정산 금액을 확인하세요.");
  const settlement = await create("participant_settlements", {
    participantId: current.id,
    participantName: current.name,
    teamName: current.teamName || "",
    payment,
    phone: current.phone,
    items: selected,
    total,
    paidAt: new Date().toISOString(),
    paidBy: actor,
    note: body.note,
    status: "paid",
  });
  for (const item of selected) {
    const row = (await get(item.id))!;
    if (item.kind === "work_slots")
      await payWorkSlot(row, { version: row.version, paid: true }, actor);
    else if (item.kind === "posting_sets")
      await payPostingSet(row, { version: row.version, paid: true }, actor);
    else if (item.kind === "tasks")
      await update(
        row.id,
        { payoutStatus: "paid", paidAt: settlement.paidAt, paidBy: actor },
        row.version,
      );
    else
      await update(
        row.id,
        {
          paid: true,
          paidDate: new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Seoul",
          }).format(new Date()),
        },
        row.version,
      );
    await update(row.id, { settlementId: settlement.id });
    if (row.postingSetId)
      await update(String(row.postingSetId), { settlementId: settlement.id });
    for (const taskId of item.taskIds) {
      const task = await get(taskId);
      if (task && task.id !== row.id)
        await update(task.id, { settlementId: settlement.id });
    }
  }
  await audit(actor, "participant-settlement", settlement.id, {
    participantId: participant.id,
    total,
    itemIds: selected.map((i) => i.id),
  });
  return settlement;
}

export async function cancelParticipantSettlement(
  settlement: RecordData,
  input: Record<string, unknown>,
  actor: string,
) {
  if (settlement.kind !== "participant_settlements")
    throw new Error("합산 정산 기록을 선택하세요.");
  await lock("participant-settle:" + settlement.participantId);
  await lock("save:participant_history");
  const current = (await get(settlement.id))!;
  if (
    current.version !== Number(input.version) ||
    current.status === "cancelled"
  )
    throw new Error("정산 기록이 변경되었습니다. 새로고침하세요.");
  const items = current.items as {
    id: string;
    kind: string;
    projectId: string | null;
    taskIds: string[];
  }[];
  for (const projectId of [
    ...new Set(items.map((i) => i.projectId).filter(Boolean) as string[]),
  ].sort()) {
    await lock("project-operations:" + projectId);
    const project = await get(projectId);
    if (!project || project.settled === true)
      throw new Error(
        "정산 마감한 프로젝트가 포함되어 있습니다. 먼저 마감을 취소하세요.",
      );
  }
  for (const item of items) {
    const row = await get(item.id);
    if (
      !row ||
      row.settlementId !== current.id ||
      row.participantId !== current.participantId ||
      (item.kind === "participant_history"
        ? !row.paid
        : row.payoutStatus !== "paid")
    )
      throw new Error("합산 지급 연결을 확인하세요.");
    for (const taskId of item.taskIds) {
      const task = await get(taskId);
      if (
        !task ||
        task.settlementId !== current.id ||
        task.payoutStatus !== "paid"
      )
        throw new Error("작업의 합산 지급 연결이 변경되었습니다.");
    }
    if (item.kind === "work_slots")
      await payWorkSlot(row, { version: row.version, paid: false }, actor);
    else if (item.kind === "posting_sets")
      await payPostingSet(row, { version: row.version, paid: false }, actor);
    else if (item.kind === "tasks")
      await update(
        row.id,
        { payoutStatus: "pending", paidAt: null, paidBy: null },
        row.version,
      );
    else await update(row.id, { paid: false, paidDate: "" }, row.version);
    await update(row.id, { settlementId: null });
    if (row.postingSetId)
      await update(String(row.postingSetId), { settlementId: null });
    for (const taskId of item.taskIds) {
      if (taskId !== row.id) await update(taskId, { settlementId: null });
    }
  }
  const result = await update(
    current.id,
    {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: actor,
    },
    current.version,
  );
  await audit(actor, "participant-settlement-cancel", current.id, {
    participantId: current.participantId,
    total: current.total,
  });
  return result;
}
