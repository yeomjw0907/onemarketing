import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, execute, transaction, lock, audit } from "./db";

export type AccountOwner = { role: "advertiser" | "participant"; id: string };
export type AccountRequest = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  role: AccountOwner["role"];
  ownerId: string;
  category: "withdrawal" | "privacy" | "profile" | "settlement";
  message: string;
  status: "requested" | "reviewing" | "answered" | "cancelled";
  response?: string;
  respondedAt?: string;
};
const ownerSchema = z.object({
  role: z.enum(["advertiser", "participant"]),
  id: z.string().uuid(),
});
const requestSchema = z
  .object({
    category: z.enum(["withdrawal", "privacy", "profile", "settlement"]),
    message: z
      .string()
      .trim()
      .min(5, "요청 내용을 5자 이상 입력해주세요.")
      .max(2000),
    consent: z.literal(true, {
      error: "요청 처리를 위한 정보 이용에 동의해주세요.",
    }),
  })
  .strict();
const ownerKey = (owner: AccountOwner) => owner.role + ":" + owner.id;
type Stored = {
  id: string;
  version: number;
  data: Omit<AccountRequest, "id" | "version">;
};
const unpack = (r: Stored): AccountRequest => ({
  ...r.data,
  id: r.id,
  version: r.version,
});

export async function accountRequests(
  owner?: AccountOwner,
): Promise<AccountRequest[]> {
  if (owner) ownerSchema.parse(owner);
  const rows = await query<Stored>(
    "select id,version,data from records where kind='account_requests'" +
      (owner ? " and data->>'role'=$1 and data->>'ownerId'=$2" : "") +
      " order by created_at desc limit " +
      (owner ? "100" : "200"),
    owner ? [owner.role, owner.id] : [],
  );
  return rows.map(unpack);
}

export async function requestAccountHelp(owner: AccountOwner, input: unknown) {
  ownerSchema.parse(owner);
  const b = requestSchema.parse(input);
  return transaction(async () => {
    await lock("account-request:" + ownerKey(owner));
    const pending = (await accountRequests(owner)).filter((r) =>
      ["requested", "reviewing"].includes(r.status),
    );
    const existing = pending.find((r) => r.category === b.category);
    if (existing) return { request: existing, existing: true };
    if (pending.length >= 4)
      throw new Error("처리 중인 요청을 먼저 확인해주세요.");
    const id = randomUUID(),
      at = new Date().toISOString();
    const data: Stored["data"] = {
      role: owner.role,
      ownerId: owner.id,
      category: b.category,
      message: b.message,
      status: "requested",
      createdAt: at,
      updatedAt: at,
    };
    await execute(
      "insert into records(id,kind,version,data,created_at,updated_at) values($1,'account_requests',1,$2::jsonb,$3,$3)",
      [id, JSON.stringify(data), at],
    );
    await audit(ownerKey(owner), "account-request-created", id, {
      category: b.category,
    });
    return {
      request: { ...data, id, version: 1 } as AccountRequest,
      existing: false,
    };
  });
}

export async function changeAccountRequest(
  actor: AccountOwner | { role: "admin"; id: string },
  input: unknown,
) {
  const b = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      status: z.enum(["reviewing", "answered", "cancelled"]),
      response: z.string().trim().min(5).max(2000).optional(),
    })
    .strict()
    .parse(input);
  return transaction(async () => {
    await lock("account-request-item:" + b.id);
    const row = (
      await query<Stored>(
        "select id,version,data from records where id=$1 and kind='account_requests' for update",
        [b.id],
      )
    )[0];
    if (
      !row ||
      (actor.role !== "admin" &&
        (row.data.role !== actor.role || row.data.ownerId !== actor.id))
    )
      throw new Error("요청을 찾을 수 없습니다.");
    if (row.version !== b.version)
      throw new Error("요청이 변경되었습니다. 다시 불러와주세요.");
    if (!["requested", "reviewing"].includes(row.data.status))
      throw new Error("이미 종료된 요청입니다.");
    if (
      actor.role !== "admin" &&
      (b.status !== "cancelled" || b.response !== undefined)
    )
      throw new Error("본인 요청의 철회만 가능합니다.");
    if (actor.role === "admin" && b.status === "cancelled")
      throw new Error("요청 철회는 본인만 할 수 있습니다.");
    if (b.status === "answered" && !b.response)
      throw new Error("처리 내용과 다음 절차를 입력해주세요.");
    const at = new Date().toISOString();
    const data = {
      ...row.data,
      status: b.status,
      updatedAt: at,
      ...(b.response ? { response: b.response, respondedAt: at } : {}),
    };
    await execute(
      "update records set data=$1::jsonb,version=version+1,updated_at=$2 where id=$3 and version=$4",
      [JSON.stringify(data), at, b.id, b.version],
    );
    await audit(
      actor.role + ":" + actor.id,
      "account-request-" + b.status,
      b.id,
    );
    return { ...data, id: row.id, version: row.version + 1 } as AccountRequest;
  });
}
