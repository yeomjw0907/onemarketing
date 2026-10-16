import type { DatabaseView, RecordData } from "./types";
export type SettlementItem = {
  id: string;
  kind: "work_slots" | "posting_sets" | "tasks" | "participant_history";
  token: string;
  name: string;
  amount: number;
  projectId: string | null;
  taskIds: string[];
  accounts: string[];
};
export function settlementItems(
  data: DatabaseView,
  participantId: string,
): SettlementItem[] {
  const items: SettlementItem[] = [];
  const add = (
    source: RecordData,
    tasks: RecordData[],
    projectId: string | null,
  ) => {
    if (
      source.kind === "work_slots" &&
      tasks.length !== (source.taskIds as string[]).length
    )
      return;
    if (source.kind === "posting_sets" && tasks.length !== 2) return;
    const project = data.projects.find((p) => p.id === projectId);
    if (
      projectId &&
      (!project || project.settled === true || project.hold === true)
    )
      return;
    if (
      source.participantId !== participantId ||
      source.status === "cancelled" ||
      source.payoutStatus === "paid"
    )
      return;
    if (source.kind === "participant_history") {
      if (source.paid || typeof source.amount !== "number") return;
    } else if (
      !tasks.length ||
      tasks.some(
        (t) =>
          t.participantId !== participantId ||
          t.status !== "verified" ||
          (t.payoutStatus === "paid" &&
            !((source.partialPaidTaskIds as string[]) || []).includes(t.id)) ||
          typeof t.payout !== "number",
      )
    )
      return;
    const amount =
      source.kind === "participant_history"
        ? Number(source.amount)
        : tasks.reduce((n, t) => n + Number(t.payout), 0) -
          Number(source.partialPaidAmount || 0);
    if (!Number.isSafeInteger(amount) || amount < 0) return;
    const accounts = [
      ...new Set(
        tasks.map((t) => {
          const snapshot = t.participantSnapshot as {
            account?: { label?: string; url?: string };
          } | null;
          return (
            snapshot?.account?.label ||
            snapshot?.account?.url ||
            String(t.participantAccountId || "계정 미지정")
          );
        }),
      ),
    ];
    items.push({
      id: source.id,
      kind: source.kind as SettlementItem["kind"],
      token: JSON.stringify([
        source.version,
        project?.version,
        tasks.map((t) => [t.id, t.version]).sort(),
      ]),
      name: String(source.name),
      amount,
      projectId,
      taskIds: tasks.map((t) => t.id),
      accounts,
    });
  };
  for (const slot of data.work_slots)
    add(
      slot,
      data.tasks.filter(
        (t) =>
          (slot.taskIds as string[]).includes(t.id) && t.workSlotId === slot.id,
      ),
      String(slot.projectId),
    );
  for (const set of data.posting_sets.filter((s) => !s.workSlotId))
    add(
      set,
      data.tasks.filter(
        (t) =>
          [set.blogTaskId, set.clipTaskId].includes(t.id) &&
          t.postingSetId === set.id,
      ),
      String(set.projectId),
    );
  for (const task of data.tasks.filter((t) => !t.workSlotId && !t.postingSetId))
    add(task, [task], String(task.projectId));
  for (const history of data.participant_history) add(history, [], null);
  return items;
}
