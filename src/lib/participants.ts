import { accountIdentity } from "./account-identity";
import { rewardDefaults } from "./sales-cart";
import { z } from "zod";
import { participantPaymentSchema } from "./participant-payment";
import { accountAssignable } from "./participant-account-policy";
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
  referrerId: z.string().uuid().nullable().optional(),
  kakaoMarketingConsent: z.boolean().optional(),
  name: z.string().trim().min(1).max(200),
  operationType: z.enum(["self", "managed"]).default("self"),
  teamName: z.string().trim().max(200).default(""),
  nickname: z.string().trim().max(100).default(""),
  contact: z.string().trim().max(1000).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z
    .union([z.string().trim().email().max(254), z.literal("")])
    .default(""),
  status: z.enum(["active", "paused", "closed"]).default("active"),
  specialties: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(10000).default(""),
  payment: participantPaymentSchema.optional(),
  blogRate: amount.default(rewardDefaults.blog),
  clipRate: amount.default(rewardDefaults.clip),
  bundleRate: amount.default(rewardDefaults.bundle),
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
        ownershipVerifiedAt: z.string().datetime().optional(),
        ownershipEvidence: z.string().max(2000).optional(),
        approvalStatus: z
          .enum(["pending", "approved", "rejected"])
          .default("approved"),
      }),
    )
    .max(100)
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
  return accountIdentity(url);
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
  if (id) {
    const old = await get(id);
    for (const a of accounts) {
      const previous = (
        (old?.accounts as {
          id: string;
          url: string;
          ownershipVerifiedAt?: string;
        }[]) || []
      ).find((x) => x.id === a.id);
      if (
        previous &&
        normalizeProfile(previous.url) !== normalizeProfile(a.url)
      ) {
        delete (a as unknown as Record<string, unknown>).ownershipVerifiedAt;
        delete (a as unknown as Record<string, unknown>).ownershipEvidence;
      }
    }
  }
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
    p.accounts as {
      id: string;
      channel: string;
      url: string;
      label: string;
      approvalStatus?: "pending" | "approved" | "rejected";
    }[]
  ).find((a) => a.id === accountId);
  if (
    !account ||
    (!accountAssignable(account, task.channel) &&
      !(
        task.participantId === p.id && task.participantAccountId === account.id
      ))
  )
    throw new Error("게시 채널에 맞는 참여자 계정을 선택하세요.");
  if (
    task.payoutStatus === "paid" &&
    (task.participantId !== p.id || task.participantAccountId !== account.id)
  )
    throw new Error("지급 완료한 작업의 참여자는 변경할 수 없습니다.");
  if (
    (await list("tasks")).some((t) => {
      if (
        t.id === task.id ||
        t.projectId !== task.projectId ||
        t.channel !== task.channel ||
        (t.status === "cancelled" &&
          t.payoutStatus !== "paid" &&
          !t.payoutCommitted)
      )
        return false;
      const snapshot = (
        t.participantSnapshot as { account?: { url?: string } } | null
      )?.account?.url;
      return (
        (t.participantId === p.id && t.participantAccountId === account.id) ||
        !!(
          snapshot &&
          normalizeProfile(snapshot) === normalizeProfile(account.url)
        )
      );
    })
  )
    throw new Error(
      "같은 캠페인에서 이 계정에 이미 배정한 채널 작업이 있습니다.",
    );
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
            operationType: p.operationType || "self",
            teamName: p.teamName || "",
            nickname: p.nickname,
            account: { ...account },
          },
  };
}
