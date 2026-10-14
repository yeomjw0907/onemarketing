import { z } from "zod";
import { create, get, list, lock, update } from "./db";
import { participantAssignment } from "./participants";
import type { RecordData } from "./types";

export async function createPostingSet(
  project: RecordData,
  input: Record<string, unknown>,
) {
  const body = z
    .object({
      participantId: z.string().uuid(),
      blogTaskId: z.string().uuid(),
      clipTaskId: z.string().uuid(),
      blogAccountId: z.string().uuid(),
      clipAccountId: z.string().uuid(),
      amount: z.number().int().min(0).max(1e12),
      instructions: z.string().trim().max(5000).default(""),
      replacePayouts: z.literal(true),
    })
    .parse(input);
  await lock("posting-sets:" + project.id);
  if (["completed", "cancelled"].includes(String(project.status)))
    throw new Error("진행 중인 프로젝트에서 세트를 만드세요.");
  const blog = await get(body.blogTaskId),
    clip = await get(body.clipTaskId);
  if (
    !blog ||
    !clip ||
    blog.kind !== "tasks" ||
    clip.kind !== "tasks" ||
    blog.projectId !== project.id ||
    clip.projectId !== project.id ||
    blog.channel !== "blog" ||
    clip.channel !== "clip"
  )
    throw new Error("같은 프로젝트의 블로그와 클립을 선택하세요.");
  if (
    (await list("posting_sets"))
      .filter((s) => s.status !== "cancelled")
      .some((s) =>
        [s.blogTaskId, s.clipTaskId].some(
          (id) => id === blog.id || id === clip.id,
        ),
      )
  )
    throw new Error("이미 세트에 연결된 작업입니다.");
  if (
    (await list("posting_sets")).some(
      (s) =>
        s.projectId === project.id &&
        s.participantId === body.participantId &&
        s.status !== "cancelled",
    )
  )
    throw new Error(
      "이 참여자는 이미 이 프로젝트의 게시 세트를 배정받았습니다.",
    );
  const assignments = [];
  for (const [task, accountId] of [
    [blog, body.blogAccountId],
    [clip, body.clipAccountId],
  ] as const) {
    if (
      task.postingSetId ||
      task.payoutStatus === "paid" ||
      task.payoutCommitted ||
      ["cancelled", "delivered", "submitted", "verified"].includes(
        String(task.status),
      )
    )
      throw new Error("지급·전달 전의 미연결 작업만 묶을 수 있습니다.");
    if (task.participantId && task.participantId !== body.participantId)
      throw new Error(
        "기존 담당자와 다른 참여자에게 묶을 수 없습니다. 먼저 담당자를 변경하세요.",
      );
    assignments.push(
      await participantAssignment(task, {
        participantId: body.participantId,
        participantAccountId: accountId,
      }),
    );
  }
  const set = await create("posting_sets", {
    projectId: project.id,
    customerId: project.customerId,
    ...body,
    payoutStatus: "pending",
    paidAt: null,
    participantName: assignments[0].assignee,
    originalTasks: [blog, clip].map((t) => ({
      id: t.id,
      payout: t.payout ?? null,
      participantId: t.participantId ?? null,
      participantAccountId: t.participantAccountId ?? null,
      participantSnapshot: t.participantSnapshot ?? null,
      assignee: t.assignee || "",
    })),
  });
  // 기존 원가/참여자 집계와 호환: 세트 보수는 블로그에 한 번 배분하고 클립은 0원.
  for (const [i, task] of [blog, clip].entries())
    await update(
      task.id,
      {
        ...assignments[i],
        postingSetId: set.id,
        payout: i === 0 ? body.amount : 0,
        payoutStatus: "pending",
      },
      task.version,
    );
  return set;
}

export async function dissolvePostingSet(
  set: RecordData,
  input: Record<string, unknown>,
) {
  if (
    set.kind !== "posting_sets" ||
    set.status === "cancelled" ||
    set.payoutStatus === "paid"
  )
    throw new Error("미지급 게시 세트만 해제할 수 있습니다.");
  await lock("posting-sets:" + set.projectId);
  const originals = set.originalTasks as {
    id: string;
    [key: string]: unknown;
  }[];
  const tasks = [];
  for (const original of originals) {
    const task = await get(original.id);
    if (
      !task ||
      task.postingSetId !== set.id ||
      ["delivered", "submitted", "verified"].includes(String(task.status))
    )
      throw new Error("실제 전달 전 세트만 해제할 수 있습니다.");
    tasks.push(task);
  }
  const result = await update(
    set.id,
    { status: "cancelled" },
    Number(input.version),
  );
  for (const [index, task] of tasks.entries()) {
    const { id: originalId, ...values } = originals[index];
    await update(task.id, { ...values, postingSetId: null }, task.version);
  }
  return result;
}

export async function payPostingSet(
  set: RecordData,
  input: Record<string, unknown>,
  actor: string,
) {
  if (set.kind !== "posting_sets" || set.status === "cancelled")
    throw new Error("유효한 게시 세트를 선택하세요.");
  await lock("posting-sets:" + set.projectId);
  const tasks = await Promise.all([
    get(String(set.blogTaskId)),
    get(String(set.clipTaskId)),
  ]);
  const paid = z.boolean().parse(input.paid);
  if (
    tasks.some(
      (t) =>
        !t ||
        t.postingSetId !== set.id ||
        t.participantId !== set.participantId,
    )
  )
    throw new Error("게시 세트 연결을 확인하세요.");
  if (paid && tasks.some((t) => t?.status !== "verified"))
    throw new Error("블로그와 클립 게시를 모두 확인한 뒤 지급하세요.");
  const paidAt = paid ? new Date().toISOString() : null;
  const result = await update(
    set.id,
    {
      payoutStatus: paid ? "paid" : "pending",
      paidAt,
      paidBy: paid ? actor : null,
    },
    Number(input.version),
  );
  for (const task of tasks)
    await update(
      task!.id,
      { payoutStatus: paid ? "paid" : "pending", paidAt },
      task!.version,
    );
  return result;
}
