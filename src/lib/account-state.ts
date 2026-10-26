import { z } from "zod";
import { query, transaction, lock } from "./db";
import { builderStateSchema, emptyBuilder } from "./account-state-schema";
import { campaignQuote, policyVersion } from "./commerce-policy";
import { checkout, type CommerceActor } from "./commerce";
type Section = "builder" | "favorites";
type Row = { data: Record<string, any>; version: number; updated_at: string };
export class StateConflict extends Error {
  constructor(public current: any) {
    super(
      "다른 기기에서 변경한 내용이 있어요. 계정 내용을 불러오거나 현재 내용으로 저장해주세요.",
    );
  }
}
function builderOwner(owner: CommerceActor) {
  if (owner.role !== "advertiser") throw Error("광고주 로그인이 필요합니다.");
}
export async function readAccountState(
  owner: CommerceActor,
  section: Section,
): Promise<any> {
  if (section === "builder") builderOwner(owner);
  const [r] = await query<Row>(
    "select data,version,updated_at from account_state where owner_role=$1 and owner_id=$2 and section=$3",
    [owner.role, owner.id, section],
  );
  return {
    owner: owner.role + ":" + owner.id,
    version: r?.version || 0,
    updatedAt: r?.updated_at || null,
    state:
      section === "builder"
        ? r
          ? builderStateSchema.parse({
              draft: r.data.draft,
              cart: r.data.cart,
              step: r.data.step,
              editing: r.data.editing,
            })
          : emptyBuilder()
        : { ids: r?.data.ids || [] },
  };
}
async function write(owner: CommerceActor, section: Section, data: unknown) {
  const [r] = await query<Row>(
    "insert into account_state(owner_role,owner_id,section,data) values($1,$2,$3,$4::jsonb) on conflict(owner_role,owner_id,section) do update set data=excluded.data,version=account_state.version+1,updated_at=now() returning data,version,updated_at",
    [owner.role, owner.id, section, JSON.stringify(data)],
  );
  return r;
}
export async function saveBuilder(owner: CommerceActor, raw: unknown) {
  builderOwner(owner);
  const b = z
    .object({
      version: z.number().int().nonnegative(),
      state: builderStateSchema,
    })
    .strict()
    .parse(raw);
  return transaction(async () => {
    await lock("account-builder:" + owner.id);
    const current = await readAccountState(owner, "builder");
    if (b.version !== current.version) throw new StateConflict(current);
    // A completed order's retry token is server-owned and never copied from client data.
    const [old] = await query<Row>(
      "select data from account_state where owner_role=$1 and owner_id=$2 and section='builder'",
      [owner.role, owner.id],
    );
    await write(owner, "builder", {
      ...b.state,
      ...(old?.data.lastCheckout
        ? { lastCheckout: old.data.lastCheckout }
        : {}),
    });
    return readAccountState(owner, "builder");
  });
}
export async function changeFavorites(owner: CommerceActor, raw: unknown) {
  const b = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("favorite"),
          id: z.string().uuid(),
          saved: z.boolean(),
        })
        .strict(),
      z
        .object({
          action: z.literal("import-favorites"),
          ids: z.array(z.string().uuid()).max(500),
        })
        .strict(),
    ])
    .parse(raw);
  return transaction(async () => {
    await lock("account-favorites:" + owner.role + ":" + owner.id);
    const current = await readAccountState(owner, "favorites");
    const ids = new Set<string>(current.state.ids || []);
    const add = b.action === "favorite" ? (b.saved ? [b.id] : []) : b.ids;
    if (add.length) {
      const publicIds = await query<{ id: string }>(
        "select c.id::text from commerce_campaigns c join commerce_orders o on o.id=c.order_id where c.id=any($1::uuid[]) and o.data->>'status'='paid' and coalesce(c.data->'input'->>'visibility','public')='public' and c.data->>'status' in ('recruiting','selecting','producing','review','completed') union select m.id::text from market_entries m where m.id=any($1::uuid[]) and m.kind='campaign' and m.data->>'published'='true' and coalesce(m.data->>'visibility','public')='public'",
        [add],
      );
      if (b.action === "favorite" && !publicIds.length)
        throw Error("공개된 캠페인을 찾을 수 없어요.");
      publicIds.forEach((r) => ids.add(r.id));
    }
    if (b.action === "favorite" && !b.saved) ids.delete(b.id);
    if (ids.size > 500)
      throw Error("관심 캠페인은 500개까지 저장할 수 있어요.");
    await write(owner, "favorites", { ids: [...ids] });
    return readAccountState(owner, "favorites");
  });
}
export async function checkoutBuilder(owner: CommerceActor, raw: unknown) {
  builderOwner(owner);
  const b = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().nonnegative(),
      expectedTotal: z.number().int().positive(),
      consent: z.literal(true),
    })
    .strict()
    .parse(raw);
  return transaction(async () => {
    await lock("account-builder:" + owner.id);
    const current = await readAccountState(owner, "builder");
    const [r] = await query<Row>(
      "select data from account_state where owner_role=$1 and owner_id=$2 and section='builder'",
      [owner.role, owner.id],
    );
    const last = r?.data.lastCheckout;
    if (
      last?.id === b.id &&
      last.version === b.version &&
      last.total === b.expectedTotal
    ) {
      const [order] = await query(
        "select * from commerce_orders where id=$1 and advertiser_id=$2",
        [b.id, owner.id],
      );
      if (order) return { order, workspace: current };
    }
    if (current.version !== b.version) throw new StateConflict(current);
    const cart = current.state.cart as any[];
    if (!cart.length) throw Error("장바구니에 캠페인을 담아주세요.");
    const total = cart.map(campaignQuote).reduce((n, q) => n + q.total, 0);
    if (total !== b.expectedTotal)
      throw Error("금액이 변경됐어요. 장바구니를 다시 확인해주세요.");
    const order = await checkout(owner.id, {
      id: b.id,
      campaigns: cart,
      expectedTotal: total,
      policyVersion,
      consent: true,
    });
    await write(owner, "builder", {
      ...emptyBuilder(),
      lastCheckout: { id: b.id, version: b.version, total },
    });
    return { order, workspace: await readAccountState(owner, "builder") };
  });
}
