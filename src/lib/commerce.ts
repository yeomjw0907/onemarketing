import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  query,
  execute,
  transaction,
  lock,
  audit,
  get,
  create,
  list,
  update,
} from "./db";
import {
  campaignInput,
  campaignQuote,
  selfSettlement,
  policyVersion,
  type CampaignInput,
} from "./commerce-policy";
import { accountAssignable } from "./participant-account-policy";
import {
  publicationIdentity,
  publicationMatchesAccount,
} from "./account-identity";
import { queueNotification } from "./sens";
import { syncReferral } from "./referrals";
type Data = Record<string, any>;
export type CommerceActor = {
  role: "advertiser" | "admin" | "participant";
  id: string;
};
type Stored = {
  id: string;
  data: Data;
  version: number;
  order_id?: string;
  advertiser_id?: string;
  participant_id?: string;
  campaign_id?: string;
  created_at?: string;
};
const uid = z.string().uuid();
const note = z.string().trim().min(3).max(2000);
const now = () => new Date().toISOString();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
async function settings() {
  return (
    (
      await query<{ data: Data }>(
        "select data from commerce_settings where key='bank'",
      )
    )[0]?.data || { enabled: false, bank: "", account: "", holder: "" }
  );
}
export async function paymentInstructions() {
  const s = await settings();
  return {
    enabled: s.enabled === true && !!s.bank && !!s.account && !!s.holder,
    bank: s.bank,
    account: s.account,
    holder: s.holder,
  };
}
export async function savePaymentSettings(
  actor: CommerceActor,
  input: unknown,
) {
  if (actor.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
  const d = z
    .object({
      enabled: z.boolean(),
      bank: z.string().trim().min(1).max(60),
      account: z.string().trim().min(5).max(80),
      holder: z.string().trim().min(1).max(80),
    })
    .strict()
    .parse(input);
  return transaction(async () => {
    await execute(
      "insert into commerce_settings(key,data) values('bank',$1::jsonb) on conflict(key) do update set data=excluded.data",
      [JSON.stringify(d)],
    );
    await audit(actor.id, "commerce-bank-settings", "bank");
    return d;
  });
}
export async function checkout(advertiserId: string, raw: unknown) {
  const b = z
    .object({
      id: uid,
      campaigns: z.array(campaignInput).min(1).max(10),
      expectedTotal: z.number().int().nonnegative(),
      policyVersion: z.literal(policyVersion),
      consent: z.literal(true),
    })
    .strict()
    .parse(raw);
  const quotes = b.campaigns.map(campaignQuote),
    total = quotes.reduce((n, q) => n + q.total, 0);
  if (total !== b.expectedTotal)
    throw new Error("금액이 변경되었습니다. 구성과 합계를 다시 확인하세요.");
  const signature = hash(JSON.stringify(b));
  return transaction(async () => {
    await lock("commerce-checkout:" + b.id);
    const old = (
      await query<Stored>("select * from commerce_orders where id=$1", [b.id])
    )[0];
    if (old) {
      if (
        old.advertiser_id !== advertiserId ||
        old.data.requestHash !== signature
      )
        throw new Error("같은 요청 ID로 다른 주문을 저장할 수 없습니다.");
      return old;
    }
    if (!(await paymentInstructions()).enabled)
      throw new Error(
        "결제를 준비 중입니다. 장바구니를 보관하고 나중에 다시 시도해주세요.",
      );
    if (
      !quotes.every(
        (q) => Date.parse(q.input.deadline + "T23:59:59+09:00") > Date.now(),
      )
    )
      throw new Error("모집 마감은 미래 날짜여야 합니다.");
    if (
      quotes.some(
        (q) =>
          q.input.kind === "package" &&
          Date.parse(q.input.submissionDeadline + "T23:59:59+09:00") -
            Date.now() <
            14 * 86400000,
      )
    )
      throw new Error("패키지는 최소 2주 일정으로 신청하세요.");
    const titles = quotes.map(
      (q) => q.input.brand.toLowerCase() + ":" + q.input.title.toLowerCase(),
    );
    if (new Set(titles).size !== titles.length)
      throw new Error(
        "같은 브랜드·캠페인이 중복되어 있습니다. 하나의 구성으로 합쳐주세요.",
      );
    const bank = await paymentInstructions();
    const data = {
      status: "awaiting_payment",
      total,
      policyVersion,
      requestHash: signature,
      bank,
      consentedAt: now(),
      refunds: [],
      history: [{ at: now(), action: "주문 접수", actor: advertiserId }],
    };
    const [order] = await query<Stored>(
      "insert into commerce_orders(id,advertiser_id,request_hash,data) values($1,$2,$3,$4::jsonb) returning *",
      [b.id, advertiserId, signature, JSON.stringify(data)],
    );
    for (const q of quotes) {
      const campaignId = randomUUID();
      await execute(
        "insert into commerce_campaigns(id,order_id,data) values($1,$2,$3::jsonb)",
        [
          campaignId,
          order.id,
          JSON.stringify({
            ...q,
            status: "awaiting_payment",
            used: {},
            refunds: [],
            history: [],
          }),
        ],
      );
    }
    await audit("advertiser:" + advertiserId, "commerce-checkout", order.id, {
      total,
    });
    return order;
  });
}
async function campaignsFor(actor: CommerceActor) {
  if (actor.role === "admin")
    return query<Stored>(
      "select c.*,o.advertiser_id,o.data as order_data from commerce_campaigns c join commerce_orders o on o.id=c.order_id order by c.created_at desc",
    );
  if (actor.role === "advertiser")
    return query<Stored>(
      "select c.*,o.advertiser_id,o.data as order_data from commerce_campaigns c join commerce_orders o on o.id=c.order_id where o.advertiser_id=$1 order by c.created_at desc",
      [actor.id],
    );
  return query<Stored>(
    "select distinct c.* from commerce_campaigns c join commerce_applications a on a.campaign_id=c.id where a.participant_id=$1 order by c.created_at desc",
    [actor.id],
  );
}
async function owned(actor: CommerceActor, id: string) {
  const [c] = await query<Stored>(
    "select c.*,o.advertiser_id,o.data as order_data from commerce_campaigns c join commerce_orders o on o.id=c.order_id where c.id=$1",
    [uid.parse(id)],
  );
  if (
    !c ||
    (actor.role !== "admin" &&
      (actor.role !== "advertiser" || c.advertiser_id !== actor.id))
  )
    throw new Error("캠페인 접근 권한이 없습니다.");
  return c;
}
async function persist(
  table: "commerce_orders" | "commerce_campaigns" | "commerce_applications",
  r: Stored,
  data: Data,
) {
  const [saved] = await query<Stored>(
    `update ${table} set data=$1::jsonb,version=version+1 where id=$2 and version=$3 returning *`,
    [JSON.stringify(data), r.id, r.version],
  );
  if (!saved)
    throw new Error("다른 작업으로 변경되었습니다. 새로고침해주세요.");
  return saved;
}
export async function commerceView(actor: CommerceActor) {
  const campaigns = await campaignsFor(actor);
  const out = [];
  for (const c of campaigns) {
    const apps = await query<Stored>(
      "select * from commerce_applications where campaign_id=$1 order by created_at",
      [c.id],
    );
    const visible =
      actor.role === "participant"
        ? apps.filter((a) => a.participant_id === actor.id)
        : apps;
    const applications = await Promise.all(
      visible.map(async (a) => {
        if (actor.role === "admin")
          return { ...a, participant: await get(String(a.participant_id)) };
        return {
          id: a.id,
          campaign_id: a.campaign_id,
          version: a.version,
          data: { ...a.data, history: undefined, referrerSnapshot: undefined },
          participant_id:
            actor.role === "participant" ? a.participant_id : undefined,
        };
      }),
    );
    const data =
      actor.role === "participant"
        ? { input: c.data.input, status: c.data.status, terms: c.data.terms }
        : c.data;
    out.push({
      id: c.id,
      order_id: actor.role === "participant" ? undefined : c.order_id,
      version: c.version,
      data,
      applications,
      ...(actor.role === "participant"
        ? {}
        : {
            counts: {
              applied: apps.filter((a) => a.data.status === "applied").length,
              accepted: apps.filter((a) =>
                [
                  "accepted",
                  "submitted",
                  "revision",
                  "verified",
                  "paid",
                ].includes(a.data.status),
              ).length,
              completed: apps.filter((a) =>
                ["verified", "paid"].includes(a.data.status),
              ).length,
            },
          }),
    });
  }
  const orders =
    actor.role === "participant"
      ? []
      : await query<Stored>(
          actor.role === "admin"
            ? "select * from commerce_orders order by created_at desc"
            : "select * from commerce_orders where advertiser_id=$1 order by created_at desc",
          actor.role === "admin" ? [] : [actor.id],
        );
  return {
    productionProjects:
      actor.role === "admin"
        ? (await list("projects"))
            .filter((p) => !p.deletedAt && p.status !== "cancelled")
            .map((p) => ({ id: p.id, name: p.name, customerId: p.customerId }))
        : undefined,
    productionAssets:
      actor.role === "admin"
        ? (await list("assets"))
            .filter(
              (a) =>
                a.current === true &&
                ["copy", "image", "video"].includes(String(a.category)),
            )
            .map((a) => ({
              id: a.id,
              projectId: a.projectId,
              name: a.name,
              category: a.category,
            }))
        : undefined,
    campaigns: out,
    orders,
    payment:
      actor.role === "participant" ? undefined : await paymentInstructions(),
  };
}
export async function publicCommerceCampaigns() {
  const rows = await query<Stored>(
    "select c.* from commerce_campaigns c join commerce_orders o on o.id=c.order_id where o.data->>'status'='paid' and c.data->>'status'='recruiting'",
  );
  return rows
    .filter(
      (c) => Date.parse(c.data.input.deadline + "T23:59:59+09:00") > Date.now(),
    )
    .map((c) => ({
      id: c.id,
      title: c.data.input.title,
      brand: c.data.input.brand,
      channel: c.data.input.channel,
      quantity: c.data.input.quantity,
      reward:
        c.data.input.kind === "package"
          ? (c.data.participantReward ?? 7000)
          : c.data.input.reward,
      benefit: c.data.input.benefit,
      guide: c.data.input.guide,
      deadline: c.data.input.deadline,
      submissionDeadline: c.data.input.submissionDeadline,
    }));
}
export async function confirmPayment(
  actor: CommerceActor,
  id: string,
  version: number,
  reference: string,
) {
  if (actor.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
  note.parse(reference);
  return transaction(async () => {
    await lock("commerce-order:" + id);
    const [o] = await query<Stored>(
      "select * from commerce_orders where id=$1",
      [uid.parse(id)],
    );
    if (!o || o.version !== version || o.data.status !== "awaiting_payment")
      throw new Error("입금 대기 주문을 확인하세요.");
    const campaigns = await query<Stored>(
      "select * from commerce_campaigns where order_id=$1",
      [id],
    );
    for (const c of campaigns) {
      if (Date.parse(c.data.input.deadline + "T23:59:59+09:00") <= Date.now())
        throw new Error(
          "모집 일정이 지났습니다. 광고주가 새 일정으로 주문해야 합니다.",
        );
      await persist("commerce_campaigns", c, {
        ...c.data,
        status: "recruiting",
      });
    }
    await persist("commerce_orders", o, {
      ...o.data,
      status: "paid",
      paidAt: now(),
      paymentReference: reference,
      history: [
        ...o.data.history,
        { at: now(), action: "입금 확인", actor: actor.id },
      ],
    });
    await audit(actor.id, "commerce-payment-confirmed", id, { reference });
    return { ok: true };
  });
}
export async function applyCommerce(participantId: string, raw: unknown) {
  const b = z
    .object({
      campaignId: uid,
      blogAccountId: z.string().optional(),
      clipAccountId: z.string().optional(),
      message: z.string().trim().max(1000).default(""),
      consent: z.literal(true),
    })
    .strict()
    .parse(raw);
  return transaction(async () => {
    await lock("commerce-campaign:" + b.campaignId);
    const [c] = await query<Stored>(
      "select c.* from commerce_campaigns c join commerce_orders o on o.id=c.order_id where c.id=$1 and o.data->>'status'='paid'",
      [b.campaignId],
    );
    if (
      !c ||
      c.data.status !== "recruiting" ||
      Date.parse(c.data.input.deadline + "T23:59:59+09:00") <= Date.now()
    )
      throw new Error("현재 모집 중인 캠페인이 아닙니다.");
    const p = await get(participantId);
    if (!p || p.kind !== "participants" || p.status !== "active" || p.deletedAt)
      throw new Error("활동 중인 참여자만 지원할 수 있습니다.");
    const accounts = (p.accounts || []) as Data[];
    const chosen: Data = {};
    for (const channel of c.data.input.channel === "bundle"
      ? ["blog", "clip"]
      : [c.data.input.channel]) {
      const a = accounts.find(
        (a) =>
          a.id ===
            b[(channel + "AccountId") as "blogAccountId" | "clipAccountId"] &&
          accountAssignable(a, channel),
      );
      if (!a || !a.ownershipVerifiedAt)
        throw new Error("승인·소유 확인된 활동 계정을 선택하세요.");
      chosen[channel] = a.url;
    }
    const old = (
      await query<Stored>(
        "select * from commerce_applications where campaign_id=$1 and participant_id=$2",
        [c.id, participantId],
      )
    )[0];
    if (
      old &&
      !["withdrawn", "rejected", "declined", "expired"].includes(
        old.data.status,
      )
    )
      throw new Error("이미 지원 또는 참여 중입니다.");
    const data = {
      status: "applied",
      name: p.name,
      accounts: chosen,
      message: b.message,
      amount:
        c.data.input.kind === "package"
          ? Number(p.bundleRate ?? 7000)
          : c.data.input.reward,
      referrerSnapshot: p.referrerId || null,
      appliedAt: now(),
      history: [],
    };
    if (old) return persist("commerce_applications", old, data);
    return (
      await query<Stored>(
        "insert into commerce_applications(id,campaign_id,participant_id,data) values($1,$2,$3,$4::jsonb) returning *",
        [randomUUID(), c.id, participantId, JSON.stringify(data)],
      )
    )[0];
  });
}
export async function campaignAction(actor: CommerceActor, raw: unknown) {
  const b = z
    .object({
      campaignId: uid,
      version: z.number().int().positive(),
      action: z.enum([
        "select",
        "reject",
        "review",
        "status",
        "usage",
        "refund-request",
        "refund-decide",
        "refund-paid",
        "settle-self",
        "payout",
        "end-work",
        "materials",
        "link-production",
        "schedule",
        "message",
      ]),
      projectId: uid.optional(),
      deadline: z.string().optional(),
      submissionDeadline: z.string().optional(),
      materials: z
        .object({
          assetIds: z.array(uid).max(30).default([]),
          copy: z.string().max(30000),
          urls: z
            .array(
              z
                .string()
                .url()
                .refine(
                  (v) => v.startsWith("https://"),
                  "HTTPS 링크만 사용할 수 있습니다.",
                ),
            )
            .max(30),
        })
        .strict()
        .optional(),
      applicationId: uid.optional(),
      refundId: uid.optional(),
      decision: z.enum(["approve", "revision", "reject"]).optional(),
      note: note.optional(),
      status: z
        .enum([
          "recruiting",
          "selecting",
          "producing",
          "review",
          "completed",
          "cancelled",
        ])
        .optional(),
      used: z.record(z.string(), z.number().int().nonnegative()).optional(),
      amount: z.number().int().positive().optional(),
      reference: note.optional(),
    })
    .strict()
    .parse(raw);
  return transaction(async () => {
    await lock("commerce-campaign:" + b.campaignId);
    const c = await owned(actor, b.campaignId);
    if (c.version !== b.version)
      throw new Error("진행 상태가 변경되었습니다. 새로고침해주세요.");
    if ((c as any).order_data.status !== "paid")
      throw new Error("입금 확인 후 진행할 수 있습니다.");
    const d = { ...c.data },
      apps = await query<Stored>(
        "select * from commerce_applications where campaign_id=$1",
        [c.id],
      );
    const manager = actor.role === "admin";
    if (
      !manager &&
      d.input.managed &&
      ["select", "reject", "review"].includes(b.action)
    )
      throw new Error("대행 캠페인은 담당자에게 요청해주세요.");
    if (b.action === "link-production") {
      if (!manager || !b.projectId)
        throw new Error("관리자만 제작 프로젝트를 연결할 수 있습니다.");
      await lock("commerce-production:" + b.projectId);
      if (d.projectId && d.projectId !== b.projectId)
        throw new Error(
          "전달 이력을 보호하기 위해 연결한 프로젝트를 변경할 수 없습니다.",
        );
      const p = await get(b.projectId);
      if (p?.kind !== "projects" || p.deletedAt || p.status === "cancelled")
        throw new Error("진행 가능한 프로젝트를 선택하세요.");
      await lock("project-operations:" + p.id);
      if (
        (await list("tasks")).some(
          (t) => t.projectId === p.id && t.participantId,
        ) ||
        (await list("work_offers")).some(
          (o) =>
            o.projectId === p.id &&
            ["proposed", "accepted"].includes(String(o.status)),
        )
      )
        throw new Error("배정·제안 전 제작 프로젝트만 연결하세요.");
      await update(p.id, { commerceCampaignId: c.id });
      const [a] = await query<{ customer_id: string | null }>(
        "select customer_id from advertiser_accounts where id=$1",
        [c.advertiser_id],
      );
      if (a.customer_id && a.customer_id !== p.customerId)
        throw new Error("광고주의 고객과 일치하는 프로젝트만 연결하세요.");
      const linked = await query<Stored>(
        "select * from commerce_campaigns where data->>'projectId'=$1 and id<>$2",
        [p.id, c.id],
      );
      if (linked.length)
        throw new Error("다른 캠페인에 연결된 프로젝트입니다.");
      if (!a.customer_id)
        await execute(
          "update advertiser_accounts set customer_id=$1 where id=$2",
          [p.customerId, c.advertiser_id],
        );
      d.projectId = p.id;
    } else if (b.action === "message") {
      d.messages = [
        ...(d.messages || []),
        { role: actor.role, text: note.parse(b.note), at: now() },
      ].slice(-100);
    } else if (b.action === "schedule") {
      if (!manager && d.input.managed)
        throw new Error("대행 일정은 담당자에게 조율 요청을 남겨주세요.");
      if (["cancelled", "completed", "paused"].includes(d.status))
        throw new Error("진행 가능한 캠페인만 조율할 수 있습니다.");
      if (!manager && Number(d.scheduleChanges || 0) >= 1)
        throw new Error(
          "일정 변경 1회를 사용했습니다. 추가 조율은 담당자에게 요청하세요.",
        );
      const next = campaignInput.parse({
        ...d.input,
        deadline: b.deadline,
        submissionDeadline: b.submissionDeadline,
      });
      if (
        next.deadline < d.input.deadline ||
        next.submissionDeadline < d.input.submissionDeadline
      )
        throw new Error("약정한 일정을 앞당길 수 없습니다.");
      if (
        next.deadline === d.input.deadline &&
        next.submissionDeadline === d.input.submissionDeadline
      )
        throw new Error("변경할 일정을 입력하세요.");
      if (Date.parse(next.submissionDeadline + "T23:59:59+09:00") <= Date.now())
        throw new Error("제출 마감이 지났습니다.");
      note.parse(b.note);
      d.scheduleHistory = [
        ...(d.scheduleHistory || []),
        { at: now(), previous: d.input, next, note: b.note },
      ];
      d.input = next;
      d.scheduleChanges = Number(d.scheduleChanges || 0) + 1;
    } else if (b.action === "materials") {
      if (["paused", "cancelled", "completed"].includes(d.status))
        throw new Error("중지·종료 캠페인에는 자료를 전달할 수 없습니다.");
      if (
        b.materials &&
        !b.materials.copy.trim() &&
        !b.materials.urls.length &&
        !b.materials.assetIds.length
      )
        throw new Error("전달할 자료를 입력하세요.");
      if (!b.materials || (!manager && d.input.kind === "package"))
        throw new Error("제작 담당자만 자료를 전달할 수 있습니다.");
      const a = apps.find((a) => a.id === b.applicationId);
      if (!a || !["selected", "accepted", "revision"].includes(a.data.status))
        throw new Error("참여 제안 또는 진행 중인 작업을 선택하세요.");
      for (const id of b.materials.assetIds) {
        if (!manager || !d.projectId)
          throw new Error(
            "관리자가 제작 프로젝트를 연결한 뒤 파일을 전달하세요.",
          );
        const asset = await get(id);
        if (
          asset?.kind !== "assets" ||
          asset.current !== true ||
          asset.projectId !== d.projectId ||
          !["copy", "image", "video"].includes(String(asset.category))
        )
          throw new Error(
            "해당 제작 프로젝트의 현재 결과물만 전달할 수 있습니다.",
          );
      }
      await persist("commerce_applications", a, {
        ...a.data,
        materials: { ...b.materials, deliveredAt: now() },
      });
      await queueNotification(
        String(a.participant_id),
        "materials",
        a.id + ":" + (a.version + 1),
        { name: String(a.data.name), deadline: d.input.submissionDeadline },
      );
    } else if (b.action === "payout" || b.action === "end-work") {
      if (!manager || !b.reference)
        throw new Error("관리자가 실제 지급 또는 종료 근거를 입력하세요.");
      const a = apps.find((a) => a.id === b.applicationId);
      if (!a) throw new Error("작업을 찾을 수 없습니다.");
      const ad = { ...a.data };
      if (b.action === "end-work") {
        if (
          !["selected", "accepted", "submitted", "revision"].includes(ad.status)
        )
          throw new Error("종료할 진행 작업을 확인하세요.");
        if (b.amount)
          throw new Error(
            "부분 수행 보수는 담당자와 별도 합의 후 정산해야 합니다. 보수가 남은 작업은 종료하지 마세요.",
          );
        ad.status = "cancelled";
        ad.note = b.reference;
        ad.endedAt = now();
      } else {
        if (ad.status !== "verified")
          throw new Error("게시 확인된 미지급 작업만 기록할 수 있습니다.");
        const source = await create("work_slots", {
          name: c.data.input.title,
          commerceApplicationId: a.id,
          participantId: a.participant_id,
          projectId: null,
          type: c.data.input.channel,
          amount: ad.amount,
          payoutStatus: "paid",
          paidAt: now(),
          status: "verified",
          taskIds: [],
          referrerSnapshot: ad.referrerSnapshot,
          referralRate: c.data.input.channel === "bundle" ? 1200 : 500,
        });
        await syncReferral(source, true, actor.id);
        ad.status = "paid";
        ad.paidAt = now();
        ad.paymentReference = b.reference;
        ad.payoutRecordId = source.id;
        await queueNotification(String(a.participant_id), "payment", a.id, {
          name: String(a.data.name),
        });
      }
      await persist("commerce_applications", a, ad);
    } else if (["select", "reject", "review"].includes(b.action)) {
      if (
        ["paused", "cancelled", "completed", "awaiting_payment"].includes(
          d.status,
        )
      )
        throw new Error("중지·종료된 캠페인에서는 처리할 수 없습니다.");
      const a = apps.find((a) => a.id === b.applicationId);
      if (!a) throw new Error("지원자를 찾을 수 없습니다.");
      const ad = { ...a.data };
      if (b.action === "select") {
        if (ad.status !== "applied")
          throw new Error("지원 대기자만 선정할 수 있습니다.");
        if (
          Date.parse(d.input.submissionDeadline + "T23:59:59+09:00") <=
          Date.now() + 86400000
        )
          throw new Error("참여 수락·진행 시간이 부족합니다.");
        const occupied = apps.filter(
          (a) =>
            ["accepted", "submitted", "revision", "verified", "paid"].includes(
              a.data.status,
            ) ||
            (a.data.status === "selected" &&
              Date.parse(a.data.expiresAt) > Date.now()),
        ).length;
        if (occupied >= d.input.quantity)
          throw new Error("모집 정원이 찼습니다.");
        ad.status = "selected";
        ad.expiresAt = new Date(
          Math.min(
            Date.now() + 48 * 3600000,
            Date.parse(d.input.submissionDeadline + "T23:59:59+09:00") -
              86400000,
          ),
        ).toISOString();
      } else if (b.action === "reject") {
        if (ad.status !== "applied")
          throw new Error("지원 대기 상태만 변경할 수 있습니다.");
        ad.status = "rejected";
        ad.note = note.parse(b.note);
      } else {
        if (ad.status !== "submitted")
          throw new Error("제출된 콘텐츠만 검수할 수 있습니다.");
        ad.note = note.parse(b.note);
        if (b.decision === "approve") {
          ad.status = "verified";
          ad.verifiedAt = now();
        } else if (b.decision === "revision") {
          if (
            !manager &&
            Number(ad.revisionCount || 0) >= d.terms.revisionRounds
          )
            throw new Error(
              "기본 수정 범위를 초과했습니다. 담당자와 추가 범위를 합의해주세요.",
            );
          ad.status = "revision";
          ad.revisionCount = Number(ad.revisionCount || 0) + 1;
          await queueNotification(
            String(a.participant_id),
            "revision",
            a.id + ":" + (a.version + 1),
            {
              name: String(ad.name),
              deadline: d.input.submissionDeadline,
              note: ad.note,
            },
          );
        } else throw new Error("승인 또는 수정 요청을 선택하세요.");
      }
      await persist("commerce_applications", a, ad);
    } else if (b.action === "status") {
      if (!manager) throw new Error("단계 변경은 관리자에게 요청해주세요.");
      if (
        d.refunds.some((r: Data) =>
          ["requested", "approved"].includes(r.status),
        )
      )
        throw new Error("환불 처리 중에는 단계를 변경할 수 없습니다.");
      if (["cancelled", "completed"].includes(d.status))
        throw new Error("종료된 캠페인은 재개할 수 없습니다.");
      if (!b.status) throw new Error("단계를 선택하세요.");
      if (
        ["completed", "cancelled"].includes(b.status) &&
        apps.some((a) =>
          ["accepted", "submitted", "revision", "selected"].includes(
            a.data.status,
          ),
        )
      )
        throw new Error("미완료 참여가 남아 있습니다.");
      d.status = b.status;
    } else if (b.action === "usage") {
      if (!manager || !b.used || !b.note)
        throw new Error("관리자가 항목별 수행 금액과 근거를 입력하세요.");
      if (d.input.kind !== "package" && !d.input.managed)
        throw new Error("셀프 비용은 완료 인원으로 정산하세요.");
      if (d.refunds.some((r: Data) => ["approved", "paid"].includes(r.status)))
        throw new Error("환불 요청 이후 사용액을 변경할 수 없습니다.");
      for (const [key, value] of Object.entries(b.used)) {
        const line = d.lines.find((l: Data) => l.key === key);
        if (!line || value > line.amount)
          throw new Error("항목별 결제 금액을 초과했습니다.");
      }
      d.used = { ...d.used, ...b.used };
      d.usageReason = b.note;
    } else if (b.action === "settle-self") {
      if (!manager || d.input.kind === "package" || d.input.managed)
        throw new Error("일반 셀프 캠페인만 자동 정산할 수 있습니다.");
      if (
        apps.some((a) =>
          ["selected", "accepted", "submitted", "revision"].includes(
            a.data.status,
          ),
        )
      )
        throw new Error("미완료·선정 대기 참여를 먼저 처리하세요.");
      if (d.refunds.some((r: Data) => ["approved", "paid"].includes(r.status)))
        throw new Error("이미 정산 또는 환불 처리 중입니다.");
      const completed = apps.filter((a) =>
        ["verified", "paid"].includes(a.data.status),
      ).length;
      const s = selfSettlement(d.input, completed);
      d.used = { reward: s.reward, operation: s.operation };
      d.status = "completed";
      const amount = d.total - s.reward - s.operation;
      if (amount > 0)
        d.refunds.push({
          id: randomUUID(),
          status: "approved",
          amount,
          reason: "미사용 셀프 예산 정산",
          approvedAt: now(),
          actor: actor.id,
        });
    } else if (b.action === "refund-request") {
      if (d.input.kind !== "package") {
        const completed = apps.filter((a) =>
          ["verified", "paid"].includes(a.data.status),
        ).length;
        const settled = selfSettlement(d.input, completed);
        d.used = {
          ...d.used,
          reward: settled.reward,
          operation: settled.operation,
        };
      }
      if (
        d.refunds.some((r: Data) =>
          ["requested", "approved"].includes(r.status),
        )
      )
        throw new Error("처리 중인 환불 요청이 있습니다.");
      if (d.refunds.some((r: Data) => r.status === "paid"))
        throw new Error("추가 정산은 담당자에게 문의해주세요.");
      d.refunds.push({
        id: randomUUID(),
        status: "requested",
        reason: note.parse(b.note),
        requestedAt: now(),
        actor: actor.id,
        previousStatus: d.status,
      });
      d.status = "paused";
    } else {
      if (!manager) throw new Error("환불 처리 권한이 없습니다.");
      const r = d.refunds.find((r: Data) => r.id === b.refundId);
      if (!r) throw new Error("환불 요청을 찾을 수 없습니다.");
      if (b.action === "refund-decide") {
        if (r.status !== "requested" || !b.note)
          throw new Error("요청 상태와 처리 근거를 확인하세요.");
        if (b.decision === "reject") {
          r.status = "rejected";
          r.response = b.note;
          d.status = r.previousStatus || "selecting";
        } else if (b.decision === "approve") {
          if (d.input.managed && !d.usageReason)
            throw new Error("대행 업무 수행 금액과 근거를 먼저 확정하세요.");
          if (d.input.kind !== "package") {
            const floor = selfSettlement(
              d.input,
              apps.filter((a) => ["verified", "paid"].includes(a.data.status))
                .length,
            );
            d.used.reward = Math.max(d.used.reward || 0, floor.reward);
            d.used.operation = Math.max(d.used.operation || 0, floor.operation);
          }
          const max = availableRefund(d);
          if (!b.amount || b.amount > max)
            throw new Error("미사용 결제액을 초과한 환불입니다.");
          if (
            apps.some((a) =>
              ["selected", "accepted", "submitted", "revision"].includes(
                a.data.status,
              ),
            )
          )
            throw new Error("참여 중인 작업과 취소 보상을 먼저 해결하세요.");
          if (!d.usageReason && d.input.kind === "package")
            throw new Error("패키지 항목별 사용액·증빙을 먼저 확정하세요.");
          r.status = "approved";
          r.amount = b.amount;
          r.response = b.note;
          r.approvedAt = now();
        } else throw new Error("처리 방식을 확인하세요.");
      } else {
        if (r.status !== "approved" || !b.reference)
          throw new Error("승인된 환불의 실제 송금 증빙을 입력하세요.");
        r.status = "paid";
        r.reference = b.reference;
        r.paidAt = now();
        d.status = d.status === "completed" ? "completed" : "cancelled";
      }
    }
    d.history = [
      ...(d.history || []),
      { at: now(), action: b.action, note: b.note || "", actor: actor.id },
    ];
    const result = await persist("commerce_campaigns", c, d);
    await audit(actor.id, "commerce-" + b.action, c.id, {
      applicationId: b.applicationId,
      refundId: b.refundId,
    });
    return result;
  });
}
export function availableRefund(d: Data) {
  return Math.max(
    0,
    d.total -
      Object.values(d.used || {}).reduce((s: number, n) => s + Number(n), 0) -
      d.refunds
        .filter((r: Data) => ["approved", "paid"].includes(r.status))
        .reduce((s: number, r: Data) => s + r.amount, 0),
  );
}
export async function participantCommerceAction(
  participantId: string,
  raw: unknown,
) {
  const b = z
    .object({
      id: uid,
      version: z.number().int().positive(),
      action: z.enum(["accept", "decline", "withdraw", "submit"]),
      links: z.record(z.string(), z.string().url().max(2000)).optional(),
    })
    .strict()
    .parse(raw);
  const [initial] = await query<Stored>(
    "select * from commerce_applications where id=$1 and participant_id=$2",
    [b.id, participantId],
  );
  if (!initial) throw new Error("본인 작업만 처리할 수 있습니다.");
  return transaction(async () => {
    await lock("commerce-campaign:" + initial.campaign_id);
    const [a] = await query<Stored>(
      "select * from commerce_applications where id=$1",
      [b.id],
    );
    const [c] = await query<Stored>(
      "select * from commerce_campaigns where id=$1",
      [a.campaign_id],
    );
    if (a.version !== b.version) throw new Error("작업 상태가 변경되었습니다.");
    if (["paused", "cancelled", "completed"].includes(c.data.status))
      throw new Error("중지·종료된 캠페인입니다.");
    const d = { ...a.data };
    if (b.action === "withdraw") {
      if (d.status !== "applied")
        throw new Error("선정 전 지원만 철회할 수 있습니다.");
      d.status = "withdrawn";
    } else if (b.action === "accept" || b.action === "decline") {
      if (d.status !== "selected" || Date.parse(d.expiresAt) <= Date.now())
        throw new Error("수락 가능한 제안이 아닙니다.");
      d.status = b.action === "accept" ? "accepted" : "declined";
      d.respondedAt = now();
    } else {
      if (!["accepted", "revision"].includes(d.status))
        throw new Error("참여 확정·수정 중인 작업만 제출할 수 있습니다.");
      if (
        Date.parse(c.data.input.submissionDeadline + "T23:59:59+09:00") <
        Date.now()
      )
        throw new Error("제출 기한이 지났습니다. 담당자에게 문의하세요.");
      const links: Data = {};
      for (const channel of Object.keys(d.accounts)) {
        const link = b.links?.[channel];
        if (!link || !publicationMatchesAccount(link, d.accounts[channel]))
          throw new Error("활동 계정에 맞는 게시 링크를 입력하세요.");
        publicationIdentity(link);
        links[channel] = link;
      }
      d.links = links;
      d.status = "submitted";
      d.submittedAt = now();
    }
    await persist("commerce_campaigns", c, { ...c.data });
    await audit("participant:" + participantId, "commerce-" + b.action, a.id);
    return persist("commerce_applications", a, d);
  });
}

export async function cancelUnpaidOrder(
  actor: CommerceActor,
  id: string,
  version: number,
) {
  return transaction(async () => {
    await lock("commerce-order:" + uid.parse(id));
    const [o] = await query<Stored>(
      "select * from commerce_orders where id=$1",
      [id],
    );
    if (
      !o ||
      (actor.role !== "admin" &&
        (actor.role !== "advertiser" || o.advertiser_id !== actor.id))
    )
      throw new Error("주문 접근 권한이 없습니다.");
    if (o.version !== version || o.data.status !== "awaiting_payment")
      throw new Error("입금 전 대기 주문만 취소할 수 있습니다.");
    const campaigns = await query<Stored>(
      "select * from commerce_campaigns where order_id=$1",
      [id],
    );
    for (const c of campaigns)
      await persist("commerce_campaigns", c, {
        ...c.data,
        status: "cancelled",
      });
    await persist("commerce_orders", o, {
      ...o.data,
      status: "cancelled",
      cancelledAt: now(),
    });
    await audit(actor.id, "commerce-unpaid-cancel", id, {});
    return { ok: true };
  });
}

// The existing authenticated cron advances recruitment and releases expired proposals.
// It never chooses a participant or accepts terms on their behalf.
export async function commerceDeadlineTick() {
  const rows = await query<Stored>(
    "select * from commerce_campaigns where data->>'status' in ('recruiting','selecting','producing','review')",
  );
  let changed = 0;
  for (const initial of rows)
    await transaction(async () => {
      await lock("commerce-campaign:" + initial.id);
      const [c] = await query<Stored>(
        "select * from commerce_campaigns where id=$1",
        [initial.id],
      );
      if (
        !c ||
        !["recruiting", "selecting", "producing", "review"].includes(
          c.data.status,
        )
      )
        return;
      const apps = await query<Stored>(
        "select * from commerce_applications where campaign_id=$1",
        [c.id],
      );
      let dirty = false;
      for (const a of apps) {
        if (
          a.data.status === "selected" &&
          Date.parse(a.data.expiresAt) <= Date.now()
        ) {
          await persist("commerce_applications", a, {
            ...a.data,
            status: "expired",
          });
          dirty = true;
        }
        const remaining =
          Date.parse(c.data.input.submissionDeadline + "T23:59:59+09:00") -
          Date.now();
        if (
          ["accepted", "revision"].includes(a.data.status) &&
          remaining > 0 &&
          remaining <= 48 * 3600000
        ) {
          await queueNotification(
            String(a.participant_id),
            "reminder",
            "commerce:" + a.id + ":" + c.data.input.submissionDeadline,
            { count: "1" },
          );
        }
      }
      const d = { ...c.data };
      if (
        d.status === "recruiting" &&
        Date.parse(d.input.deadline + "T23:59:59+09:00") <= Date.now()
      ) {
        d.status = "selecting";
        dirty = true;
      }
      if (dirty) {
        await persist("commerce_campaigns", c, d);
        changed++;
      }
    });
  return { changed };
}
