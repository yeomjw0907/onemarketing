import type { DatabaseView, RecordData } from "./types";
export function portalPaymentHistory(
  data: Pick<
    DatabaseView,
    | "participant_settlements"
    | "work_slots"
    | "posting_sets"
    | "tasks"
    | "participant_history"
  >,
  participantId: string,
) {
  const rows = data.participant_settlements
    .filter((s) => s.participantId === participantId)
    .map((s) => ({
      id: s.id,
      total: s.total,
      status: s.status,
      paidAt: s.paidAt,
    }));
  const add = (r: RecordData, total: unknown, paidAt: unknown, id = r.id) => {
    if (
      r.participantId === participantId &&
      typeof total === "number" &&
      Number.isFinite(total) &&
      total >= 0 &&
      paidAt
    )
      rows.push({ id, total, status: "paid", paidAt });
  };
  for (const slot of data.work_slots)
    if (slot.payoutStatus === "paid" && !slot.settlementId)
      add(
        slot,
        Number(slot.amount) - Number(slot.partialPaidAmount || 0),
        slot.paidAt,
      );
  for (const set of data.posting_sets)
    if (!set.workSlotId && set.payoutStatus === "paid" && !set.settlementId)
      add(set, set.amount, set.paidAt);
  for (const task of data.tasks) {
    if (task.payoutStatus !== "paid") continue;
    // Partial payments predate the remaining bundle settlement and must stay visible.
    if (
      typeof task.partialPaidAmount === "number" &&
      task.partialPaidAmount > 0
    )
      add(
        task,
        task.partialPaidAmount,
        task.partialPaidAt || task.paidAt,
        task.id + ":partial",
      );
    else if (!task.workSlotId && !task.postingSetId && !task.settlementId)
      add(task, task.payout, task.paidAt);
  }
  for (const history of data.participant_history)
    if (history.paid && !history.settlementId)
      add(history, history.amount, history.paidDate);
  return rows.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
}
