import { z } from "zod";
import { get, list } from "./db";
import type { RecordData } from "./types";
const amount = z.number().int().min(0).max(1e12).nullable();
const profileUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(
    (v) => ["https:", "http:"].includes(new URL(v).protocol),
    "웹 계정 링크를 입력하세요.",
  );
export const participantSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nickname: z.string().trim().max(100).default(""),
  contact: z.string().trim().max(1000).default(""),
  status: z.enum(["active", "paused", "closed"]).default("active"),
  specialties: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(10000).default(""),
  blogRate: amount.default(null),
  clipRate: amount.default(null),
  accounts: z
    .array(
      z.object({
        id: z.string().uuid(),
        channel: z.enum([
          "blog",
          "clip",
          "instagram",
          "facebook",
          "linkedin",
          "youtube",
          "other",
        ]),
        url: profileUrl,
        label: z.string().trim().max(100).default(""),
      }),
    )
    .max(20)
    .default([]),
});
export const participantHistorySchema = z
  .object({
    participantId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    channel: z.enum(["blog", "clip", "other"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    link: z.union([profileUrl, z.literal("")]).default(""),
    customer: z.string().max(200).default(""),
    product: z.string().max(200).default(""),
    amount: amount.default(null),
    paid: z.boolean().default(false),
    paidDate: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
      .default(""),
    notes: z.string().max(5000).default(""),
  })
  .superRefine((h, ctx) => {
    if (h.paid && (h.amount === null || !h.paidDate))
      ctx.addIssue({
        code: "custom",
        message: "지급 완료 이력에는 금액과 지급일이 필요합니다.",
      });
  });
export function normalizeProfile(url: string) {
  const u = new URL(url);
  return u.hostname.toLowerCase() + u.pathname.replace(/\/$/, "") + u.search;
}
export async function validateParticipant(
  data: Record<string, unknown>,
  id?: string,
) {
  const accounts = data.accounts as { id: string; url: string }[];
  if (
    new Set(accounts.map((a) => a.id)).size !== accounts.length ||
    new Set(accounts.map((a) => normalizeProfile(a.url))).size !==
      accounts.length
  )
    throw new Error("같은 계정을 중복 등록할 수 없습니다.");
  for (const p of (await list("participants")).filter((p) => p.id !== id))
    if (
      (p.accounts as { url: string }[]).some((a) =>
        accounts.some(
          (b) => normalizeProfile(b.url) === normalizeProfile(a.url),
        ),
      )
    )
      throw new Error("다른 참여자에게 등록된 계정입니다.");
  if (id)
    for (const task of (await list("tasks")).filter(
      (t) =>
        t.participantId === id &&
        !["verified", "cancelled"].includes(String(t.status)),
    ))
      if (!accounts.some((a) => a.id === task.participantAccountId))
        throw new Error(
          "진행 중인 작업에서 사용하는 계정은 삭제할 수 없습니다. 먼저 담당 계정을 변경하세요.",
        );
}
export async function participantAssignment(
  task: RecordData,
  input: Record<string, unknown>,
) {
  const participantId =
    typeof input.participantId === "string"
      ? input.participantId
      : String(task.participantId || "");
  if (!participantId)
    return {
      participantId: null,
      participantAccountId: null,
      participantSnapshot: null,
      assignee: z
        .string()
        .trim()
        .max(1000)
        .parse(input.assignee || ""),
    };
  const p = await get(participantId);
  if (!p || p.kind !== "participants")
    throw new Error("참여자를 찾을 수 없습니다.");
  if (p.status !== "active" && task.participantId !== p.id)
    throw new Error("섭외 보류·협업 종료 참여자에게 새로 배정할 수 없습니다.");
  const accountId =
    typeof input.participantAccountId === "string"
      ? input.participantAccountId
      : String(task.participantAccountId || "");
  const account = (
    p.accounts as { id: string; channel: string; url: string; label: string }[]
  ).find((a) => a.id === accountId);
  if (!account || account.channel !== task.channel)
    throw new Error("게시 채널에 맞는 참여자 계정을 선택하세요.");
  if (
    task.payoutStatus === "paid" &&
    (task.participantId !== p.id || task.participantAccountId !== account.id)
  )
    throw new Error("지급 완료한 작업의 참여자는 변경할 수 없습니다.");
  return {
    participantId: p.id,
    participantAccountId: account.id,
    assignee: p.nickname || p.name,
    participantSnapshot:
      task.participantId === p.id &&
      task.participantAccountId === account.id &&
      task.participantSnapshot
        ? task.participantSnapshot
        : {
            name: p.name,
            nickname: p.nickname,
            account: { ...account },
          },
  };
}
