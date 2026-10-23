import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { query, execute, get, list, lock, transaction, audit } from "./db";
import { passwordHash, verifyPassword } from "./auth";
import { save, requireActiveCatalog } from "./domain";
import { saveQuote } from "./quote-workflow";
import { campaignPriceIssue, rewardDefaults } from "./sales-cart";
import { proposeWork } from "./work-offers";
import { accountAssignable } from "./participant-account-policy";
import type { RecordData } from "./types";

type Data = Record<string, any>;
export type MarketEntry = {
  id: string;
  kind: string;
  owner_id: string | null;
  data: Data;
  version: number;
  created_at: string;
  updated_at: string;
};
export type Advertiser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  customer_id: string | null;
};
const text = z.string().trim().min(1).max(200);
const type = z.enum(["blog", "clip", "bundle"]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "날짜를 확인해주세요.");
const url = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine(
    (v) => ["http:", "https:"].includes(new URL(v).protocol),
    "웹 주소를 확인해주세요.",
  );
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function marketEntry(id: string, kind: string) {
  const row = (
    await query<MarketEntry>(
      "select * from market_entries where id=$1 and kind=$2",
      [z.string().uuid().parse(id), kind],
    )
  )[0];
  if (!row) throw new Error("항목을 찾을 수 없습니다.");
  return row;
}
async function insert(
  kind: string,
  data: Data,
  owner: string | null = null,
  id: string = randomUUID(),
) {
  return (
    await query<MarketEntry>(
      "insert into market_entries(id,kind,owner_id,data) values($1,$2,$3,$4::jsonb) returning *",
      [id, kind, owner, JSON.stringify(data)],
    )
  )[0];
}
async function edit(row: MarketEntry, data: Data, version: number) {
  const rows = await query<MarketEntry>(
    "update market_entries set data=$1::jsonb,version=version+1,updated_at=now() where id=$2 and version=$3 returning *",
    [JSON.stringify({ ...row.data, ...data }), row.id, version],
  );
  if (!rows.length) throw new Error("내용이 변경되었습니다. 새로고침해주세요.");
  return rows[0];
}
export async function advertiserSession(
  token?: string,
): Promise<Advertiser | null> {
  if (!token) return null;
  return (
    (
      await query<Advertiser>(
        "select a.id,a.email,a.name,a.phone,a.customer_id from advertiser_accounts a join advertiser_sessions s on s.advertiser_id=a.id where s.token_hash=$1 and s.expires_at>now()",
        [hash(token)],
      )
    )[0] || null
  );
}
export async function advertiserAuth(input: unknown, ip: string) {
  const b = z
    .object({
      action: z.enum(["register", "login"]),
      email: z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      password: z
        .string()
        .min(10, "비밀번호는 10자 이상 입력해주세요.")
        .max(128),
      consent: z.boolean().optional(),
      name: text.optional(),
      phone: z
        .string()
        .regex(/^01\d{8,9}$/, "휴대전화 번호를 확인해주세요.")
        .optional(),
    })
    .parse(input);
  // Persist failed attempts outside the registration/login transaction.
  const key = "advertiser:" + hash(ip + ":" + b.email);
  const now = Date.now();
  await transaction(async () => {
    const ipKey = "advertiser-ip:" + hash(ip);
    await lock(ipKey);
    const row = (
      await query<{ count: number; until_time: string }>(
        "select count,until_time from login_attempts where key=$1",
        [ipKey],
      )
    )[0];
    if (row && Number(row.until_time) > now && row.count >= 40)
      throw new Error("요청이 많습니다. 잠시 후 다시 시도해주세요.");
    await execute(
      "insert into login_attempts(key,count,until_time) values($1,1,$2) on conflict(key) do update set count=case when login_attempts.until_time>$3 then login_attempts.count+1 else 1 end,until_time=$2",
      [ipKey, now + 900000, now],
    );
  });
  await transaction(async () => {
    await lock(key);
    const old = (
      await query<{ count: number; until_time: string }>(
        "select count,until_time from login_attempts where key=$1",
        [key],
      )
    )[0];
    if (old && Number(old.until_time) > now && old.count >= 10)
      throw new Error("로그인 시도가 많습니다. 15분 후 다시 시도해주세요.");
    await execute(
      "insert into login_attempts(key,count,until_time) values($1,1,$2) on conflict(key) do update set count=case when login_attempts.until_time>$3 then login_attempts.count+1 else 1 end,until_time=$2",
      [key, now + 900000, now],
    );
  });
  return transaction(async () => {
    await lock("advertiser-email:" + b.email);
    let a = (
      await query<Advertiser & { password_hash: string }>(
        "select * from advertiser_accounts where email=$1",
        [b.email],
      )
    )[0];
    if (b.action === "register") {
      if (a) throw new Error("이미 가입된 이메일입니다. 로그인해주세요.");
      if (!b.name || !b.phone || b.consent !== true)
        throw new Error("이름과 휴대전화를 입력해주세요.");
      a = (
        await query<Advertiser & { password_hash: string }>(
          "insert into advertiser_accounts(id,email,password_hash,name,phone) values($1,$2,$3,$4,$5) returning *",
          [randomUUID(), b.email, passwordHash(b.password), b.name, b.phone],
        )
      )[0];
    } else if (!a || !verifyPassword(b.password, a.password_hash))
      throw new Error("이메일 또는 비밀번호를 확인해주세요.");
    await execute("delete from login_attempts where key=$1", [key]);
    const token = randomBytes(32).toString("hex");
    await execute(
      "insert into advertiser_sessions(token_hash,advertiser_id,expires_at) values($1,$2,now()+interval '7 days')",
      [hash(token), a.id],
    );
    return {
      token,
      account: {
        id: a.id,
        email: a.email,
        name: a.name,
        phone: a.phone,
        customer_id: a.customer_id,
      },
    };
  });
}
export async function advertiserLogout(token?: string) {
  if (token)
    await execute("delete from advertiser_sessions where token_hash=$1", [
      hash(token),
    ]);
}

async function publicProduct(
  row: Pick<MarketEntry, "id" | "version" | "data">,
) {
  const d = row.data;
  if (!d.published) return null;
  const priceIds = [
    ...(d.type !== "clip" ? [d.blogPriceId] : []),
    ...(d.type !== "blog" ? [d.clipPriceId] : []),
  ];
  const prices = await Promise.all(priceIds.map((id) => get(String(id))));
  if (
    prices.some(
      (p, i) =>
        !p ||
        p.kind !== "prices" ||
        p.deletedAt ||
        campaignPriceIssue(p, i === 0 && d.type !== "clip" ? "blog" : "clip") ||
        !Number.isSafeInteger(p.sale) ||
        Number(p.sale) < 0,
    )
  )
    return null;
  const unit = prices.reduce((n, p) => n + Number(p!.sale), 0);
  return {
    id: row.id,
    version: row.version,
    title: d.title,
    description: d.description,
    type: d.type,
    details: d.details,
    unit,
    vat: Math.round(unit * 0.1),
  };
}
export async function publicProducts() {
  const rows = await query<MarketEntry>(
    "select * from market_entries where kind='catalog' order by created_at,id",
  );
  return (await Promise.all(rows.map(publicProduct))).filter(Boolean);
}
export async function orderProduct(advertiserId: string, input: unknown) {
  const b = z
    .object({
      id: z.string().uuid(),
      catalogId: z.string().uuid(),
      catalogVersion: z.number().int().positive(),
      expectedUnit: z.number().int().nonnegative(),
      quantity: z.number().int().min(1).max(100),
      brand: text,
      product: text,
      productUrl: url,
      start: date,
      end: date,
      notes: z.string().trim().max(3000).default(""),
      consent: z.literal(true),
    })
    .parse(input);
  if (
    b.end < b.start ||
    b.start < new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  )
    throw new Error("희망 진행 기간을 확인해주세요.");
  if (Date.parse(b.end) - Date.parse(b.start) > 365 * 86400000)
    throw new Error("진행 기간은 1년 이내로 선택해주세요.");
  return transaction(async () => {
    await lock("market-request:" + b.id);
    const old = (
      await query<MarketEntry>("select * from market_entries where id=$1", [
        b.id,
      ])
    )[0];
    if (old) {
      if (old.kind !== "request" || old.owner_id !== advertiserId)
        throw new Error("신청을 확인해주세요.");
      return old;
    }
    await lock("market-order:" + advertiserId);
    const recent = (
      await query<{ count: string }>(
        "select count(*) from market_entries where kind='request' and owner_id=$1 and created_at>now()-interval '1 hour'",
        [advertiserId],
      )
    )[0];
    if (Number(recent.count) >= 10)
      throw new Error("신청이 많습니다. 잠시 후 다시 시도해주세요.");
    await lock("save:prices");
    await lock("market-catalog:" + b.catalogId);
    const catalog = await marketEntry(b.catalogId, "catalog"),
      product = await publicProduct(catalog);
    if (
      !product ||
      product.version !== b.catalogVersion ||
      product.unit !== b.expectedUnit
    )
      throw new Error(
        "상품 구성 또는 가격이 변경되었습니다. 상품을 다시 확인해주세요.",
      );
    const supply = product.unit * b.quantity;
    const row = await insert(
      "request",
      {
        ...b,
        status: "new",
        productSnapshot: product,
        priceIds: {
          blog: catalog.data.blogPriceId,
          clip: catalog.data.clipPriceId,
        },
        supply,
        vat: Math.round(supply * 0.1),
        total: supply + Math.round(supply * 0.1),
        consentedAt: new Date().toISOString(),
      },
      advertiserId,
      b.id,
    );
    await audit("advertiser:" + advertiserId, "market-order", row.id);
    return row;
  });
}
export async function advertiserOrders(advertiserId: string) {
  const rows = await query<MarketEntry>(
    "select * from market_entries where kind='request' and owner_id=$1 order by created_at desc",
    [advertiserId],
  );
  const result = [];
  for (const row of rows) {
    const d = row.data;
    const linkedQuote = d.quoteId ? await get(d.quoteId) : null;
    const quote = linkedQuote?.customerId === d.customerId ? linkedQuote : null;
    const linkedProject = quote?.projectId
      ? await get(String(quote.projectId))
      : null;
    const project =
      linkedProject?.customerId === d.customerId ? linkedProject : null;
    const tasks = project
      ? (await list("tasks")).filter((t) => t.projectId === project.id)
      : [];
    result.push({
      id: row.id,
      createdAt: row.created_at,
      status: d.status,
      note: d.adminNote || "",
      brand: d.brand,
      product: d.product,
      quantity: d.quantity,
      title: d.productSnapshot.title,
      total: d.total,
      quote: quote ? { status: quote.status, total: quote.total } : null,
      project: project
        ? {
            name: project.name,
            status: project.status,
            due: project.due,
            tasks: tasks.map((t) => ({
              channel: t.channel,
              status: t.status,
              link:
                t.status === "verified" ? t.link || t.publicationUrl || "" : "",
            })),
          }
        : null,
    });
  }
  return result;
}
function openProject(p: RecordData | null | undefined) {
  return (
    !!p &&
    !p.deletedAt &&
    !p.hold &&
    !p.settled &&
    !["completed", "cancelled"].includes(String(p.status)) &&
    Date.parse(String(p.due) + "T23:59:59+09:00") > Date.now()
  );
}
async function freeSlots(projectId: string) {
  const offers = await list("work_offers");
  return (await list("work_slots")).filter(
    (s) =>
      s.projectId === projectId &&
      !s.participantId &&
      s.status !== "cancelled" &&
      Array.isArray(s.taskIds) &&
      s.taskIds.length > 0 &&
      !offers.some(
        (o) =>
          o.slotId === s.id &&
          (o.status === "accepted" ||
            (o.status === "proposed" &&
              Date.parse(String(o.expiresAt)) > Date.now())),
      ),
  );
}
async function publicCampaign(row: MarketEntry) {
  const d = row.data,
    p = await get(String(d.projectId));
  if (
    !d.published ||
    !openProject(p) ||
    Date.parse(d.deadline + "T23:59:59+09:00") <= Date.now()
  )
    return null;
  const slots = await freeSlots(String(d.projectId));
  return {
    id: row.id,
    title: d.title,
    description: d.description,
    deadline: d.deadline,
    due: p!.due,
    types: [...new Set(slots.map((s) => String(s.type)))],
    remaining: slots.length,
    rewards: rewardDefaults,
    guide: d.guide,
  };
}
export async function publicCampaigns() {
  const rows = await query<MarketEntry>(
    "select * from market_entries where kind='campaign' order by created_at desc",
  );
  return (await Promise.all(rows.map(publicCampaign))).filter(Boolean);
}
export async function applyCampaign(participantId: string, input: unknown) {
  const b = z
    .object({
      campaignId: z.string().uuid(),
      type,
      blogAccountId: z.string().uuid().optional(),
      clipAccountId: z.string().uuid().optional(),
      message: z.string().trim().max(1000).default(""),
      consent: z.literal(true),
    })
    .parse(input);
  return transaction(async () => {
    const campaign = await marketEntry(b.campaignId, "campaign");
    await lock("project-operations:" + campaign.data.projectId);
    const fresh = await marketEntry(b.campaignId, "campaign");
    const visible = await publicCampaign(fresh);
    if (!visible || !visible.types.includes(b.type))
      throw new Error("마감되었거나 모집 가능한 자리가 없습니다.");
    const p = await get(participantId);
    if (!p || p.kind !== "participants" || p.deletedAt || p.status !== "active")
      throw new Error("이용 중인 회원만 지원할 수 있습니다.");
    const accounts = p.accounts as Data[];
    for (const channel of b.type === "bundle" ? ["blog", "clip"] : [b.type]) {
      const id = channel === "blog" ? b.blogAccountId : b.clipAccountId;
      if (!accounts.some((a) => a.id === id && accountAssignable(a, channel)))
        throw new Error("채널에 맞는 승인 계정을 선택해주세요.");
    }
    if (
      (await list("work_offers")).some(
        (o) =>
          o.projectId === fresh.data.projectId &&
          o.participantId === participantId &&
          (o.status === "accepted" ||
            (o.status === "proposed" &&
              Date.parse(String(o.expiresAt)) > Date.now())),
      )
    )
      throw new Error(
        "이 캠페인의 제안이 이미 있습니다. 나의 작업에서 확인해주세요.",
      );
    if (
      (await list("work_slots")).some(
        (s) =>
          s.projectId === fresh.data.projectId &&
          s.participantId === participantId &&
          s.status !== "cancelled",
      )
    )
      throw new Error("이미 참여 중인 캠페인입니다.");
    const old = (
      await query<MarketEntry>(
        "select * from market_entries where kind='application' and owner_id=$1 and data->>'campaignId'=$2",
        [participantId, b.campaignId],
      )
    )[0];
    const data = {
      ...b,
      projectId: fresh.data.projectId,
      title: fresh.data.title,
      status: "applied",
      appliedAt: new Date().toISOString(),
    };
    if (old && old.data.status !== "withdrawn")
      throw new Error("이미 지원한 캠페인입니다.");
    const result = old
      ? await edit(old, data, old.version)
      : await insert("application", data, participantId);
    await audit("participant:" + participantId, "campaign-applied", result.id);
    return result;
  });
}
export async function myApplications(participantId: string) {
  const rows = await query<MarketEntry>(
    "select * from market_entries where kind='application' and owner_id=$1 order by updated_at desc",
    [participantId],
  );
  return Promise.all(
    rows.map(async (r) => {
      const o = r.data.offerId ? await get(r.data.offerId) : null;
      return {
        id: r.id,
        version: r.version,
        title: r.data.title,
        type: r.data.type,
        status: o ? o.status : r.data.status,
        createdAt: r.created_at,
        note: r.data.adminNote || "",
        offerId: o?.id,
      };
    }),
  );
}
export async function withdrawApplication(
  participantId: string,
  id: string,
  version: number,
) {
  return transaction(async () => {
    const row = await marketEntry(id, "application");
    await lock("project-operations:" + row.data.projectId);
    const fresh = await marketEntry(id, "application");
    if (fresh.owner_id !== participantId || fresh.data.status !== "applied")
      throw new Error("본인의 선정 전 지원만 철회할 수 있습니다.");
    return edit(fresh, { status: "withdrawn" }, version);
  });
}
export async function marketAdminView() {
  const entries = await query<MarketEntry>(
    "select * from market_entries order by created_at desc",
  );
  return {
    entries,
    advertisers: await query<Advertiser>(
      "select id,email,name,phone,customer_id from advertiser_accounts order by created_at desc",
    ),
  };
}
export async function marketAdmin(input: unknown, actor: string) {
  const b = z
    .object({
      action: z.enum([
        "catalog",
        "campaign",
        "convert",
        "reject-order",
        "select",
        "reject-application",
      ]),
      id: z.string().uuid().optional(),
      version: z.number().int().positive().optional(),
      data: z.record(z.string(), z.unknown()).default({}),
    })
    .parse(input);
  return transaction(async () => {
    if (b.action === "catalog") {
      const d = z
        .object({
          title: text,
          description: z.string().trim().min(1).max(500),
          details: z.string().trim().min(1).max(4000),
          type,
          blogPriceId: z.string().uuid().optional(),
          clipPriceId: z.string().uuid().optional(),
          published: z.boolean(),
        })
        .parse(b.data);
      await lock("save:prices");
      const row = b.id ? await marketEntry(b.id, "catalog") : null;
      await lock("market-catalog:" + (row?.id || "new"));
      const candidate = {
        id: row?.id || randomUUID(),
        version: row?.version || 1,
        data: d,
      };
      if (d.published && !(await publicProduct(candidate)))
        throw new Error("채널에 맞는 유효한 판매 단가를 선택해주세요.");
      const result = row
        ? await edit(row, d, b.version!)
        : await insert("catalog", d);
      await audit(actor, "market-catalog", result.id);
      return result;
    }
    if (b.action === "campaign") {
      const d = z
        .object({
          projectId: z.string().uuid(),
          title: text,
          description: z.string().trim().min(1).max(500),
          guide: z.string().trim().min(1).max(4000),
          deadline: date,
          published: z.boolean(),
        })
        .parse(b.data);
      await lock("project-operations:" + d.projectId);
      const p = await get(d.projectId);
      if (!p || p.kind !== "projects")
        throw new Error("프로젝트를 선택해주세요.");
      if (
        d.published &&
        (!openProject(p) ||
          d.deadline > String(p.due) ||
          Date.parse(d.deadline + "T23:59:59+09:00") <= Date.now())
      )
        throw new Error("모집 기한과 프로젝트 진행 상태를 확인해주세요.");
      if (
        b.id &&
        (await marketEntry(b.id, "campaign")).data.projectId !== d.projectId
      )
        throw new Error("연결 프로젝트를 변경할 수 없습니다.");
      const old = (
        await query<MarketEntry>(
          "select * from market_entries where kind='campaign' and data->>'projectId'=$1",
          [d.projectId],
        )
      )[0];
      if (old && !b.id)
        throw new Error("이미 모집 공고가 있습니다. 기존 공고를 수정해주세요.");
      const result = old
        ? await edit(old, d, b.version!)
        : await insert("campaign", d);
      await audit(actor, "market-campaign", result.id);
      return result;
    }
    if (!b.id || !b.version) throw new Error("처리할 신청을 선택해주세요.");
    if (b.action === "convert" || b.action === "reject-order") {
      await lock("market-convert:" + b.id);
      const row = await marketEntry(b.id, "request");
      if (b.action === "convert" && row.data.quoteId) return row;
      if (row.version !== b.version || row.data.status !== "new")
        throw new Error("이미 처리했거나 신청이 변경되었습니다.");
      if (b.action === "reject-order")
        return edit(
          row,
          { status: "rejected", adminNote: text.parse(b.data.note) },
          b.version,
        );
      await lock("advertiser-owner:" + row.owner_id);
      const account = (
        await query<Advertiser>(
          "select id,name,email,phone,customer_id from advertiser_accounts where id=$1",
          [row.owner_id],
        )
      )[0];
      if (!account) throw new Error("광고주 계정을 찾을 수 없습니다.");
      const d = row.data;
      const selected = z
        .object({
          customerId: z.union([z.string().uuid(), z.literal("")]).optional(),
          productId: z.union([z.string().uuid(), z.literal("")]).optional(),
        })
        .parse(b.data);
      let customerId = account.customer_id;
      if (
        selected.customerId &&
        customerId &&
        selected.customerId !== customerId
      )
        throw new Error("이미 연결된 광고주의 고객을 바꿀 수 없습니다.");
      if (!customerId) {
        if (selected.customerId) {
          await requireActiveCatalog(selected.customerId, "customers");
          customerId = selected.customerId;
        } else
          customerId = (
            await save(
              "customers",
              {
                name: d.brand,
                brand: d.brand,
                contact: account.name + " · " + account.phone,
                email: account.email,
              },
              actor,
            )
          ).id;
        await execute(
          "update advertiser_accounts set customer_id=$1 where id=$2",
          [customerId, account.id],
        );
      }
      let productId = selected.productId;
      if (productId) {
        const p = await requireActiveCatalog(productId, "products");
        if (p.customerId !== customerId)
          throw new Error("고객에 속한 제품을 선택해주세요.");
      } else
        productId = (
          await save(
            "products",
            {
              name: d.product,
              customerId,
              facts: d.notes || d.product,
              notes: d.productUrl,
            },
            actor,
          )
        ).id;
      const q = await saveQuote(
        {
          name: d.brand + " · " + d.productSnapshot.title,
          customerId,
          productId,
          start: d.start,
          end: d.end,
          blog: d.productSnapshot.type !== "clip" ? d.quantity : 0,
          clip: d.productSnapshot.type !== "blog" ? d.quantity : 0,
          blogPriceId: d.priceIds.blog,
          clipPriceId: d.priceIds.clip,
        },
        actor,
      );
      if (q.supply !== d.supply)
        throw new Error(
          "현재 단가가 신청 금액과 다릅니다. 광고주와 금액을 확인한 뒤 재신청을 안내해주세요.",
        );
      const result = await edit(
        row,
        {
          status: "quoted",
          quoteId: q.id,
          customerId,
          productId,
          adminNote: "견적이 준비되었습니다. 담당자 안내에 따라 진행해주세요.",
        },
        row.version,
      );
      await audit(actor, "market-order-converted", row.id, { quoteId: q.id });
      return result;
    }
    const initial = await marketEntry(b.id, "application");
    await lock("project-operations:" + initial.data.projectId);
    const row = await marketEntry(b.id, "application");
    if (row.version !== b.version || row.data.status !== "applied")
      throw new Error("지원 상태가 변경되었습니다.");
    if (b.action === "reject-application")
      return edit(
        row,
        { status: "rejected", adminNote: text.parse(b.data.note) },
        row.version,
      );
    const campaign = await marketEntry(row.data.campaignId, "campaign");
    if (!campaign.data.published || !openProject(await get(row.data.projectId)))
      throw new Error("종료되거나 중지된 모집입니다.");
    if (
      (await list("work_offers")).some(
        (o) =>
          o.projectId === row.data.projectId &&
          o.participantId === row.owner_id &&
          (o.status === "accepted" ||
            (o.status === "proposed" &&
              Date.parse(String(o.expiresAt)) > Date.now())),
      )
    )
      throw new Error(
        "이미 추천 제안 또는 배정이 있습니다. 기존 제안을 먼저 확인해주세요.",
      );
    const slots = (await freeSlots(row.data.projectId)).filter(
      (s) => s.type === row.data.type,
    );
    const slot = slots.find((s) => !b.data.slotId || s.id === b.data.slotId);
    if (!slot) throw new Error("선정할 수 있는 자리가 없습니다.");
    const offer = await proposeWork(
      {
        slotId: slot.id,
        participantId: row.owner_id,
        blogAccountId: row.data.blogAccountId,
        clipAccountId: row.data.clipAccountId,
      },
      actor,
    );
    const result = await edit(
      row,
      {
        status: "selected",
        offerId: offer.id,
        adminNote:
          "선정되었습니다. 나의 작업에서 조건을 확인하고 수락해주세요.",
      },
      row.version,
    );
    await audit(actor, "campaign-selected", row.id, { offerId: offer.id });
    return result;
  });
}
