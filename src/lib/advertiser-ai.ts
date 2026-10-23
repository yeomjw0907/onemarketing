import { randomBytes, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { query, execute, transaction, lock, audit } from "./db";
import { campaignQuote, policyVersion } from "./commerce-policy";
import { checkout, commerceView, paymentInstructions } from "./commerce";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export async function listAdvertiserKeys(id: string) {
  return query(
    "select id,label,created_at,expires_at,revoked_at from advertiser_api_keys where advertiser_id=$1 order by created_at desc",
    [id],
  );
}
export async function createAdvertiserKey(id: string, label: unknown) {
  const name = z.string().trim().min(1).max(80).parse(label);
  return transaction(async () => {
    await lock("advertiser-keys:" + id);
    const [count] = await query<{ n: string }>(
      "select count(*) n from advertiser_api_keys where advertiser_id=$1 and revoked_at is null and expires_at>now()",
      [id],
    );
    if (Number(count.n) >= 5)
      throw new Error("연결은 최대 5개입니다. 기존 연결을 해제해주세요.");
    const token = "om_adv_" + randomBytes(32).toString("base64url");
    const [row] = await query<{
      id: string;
      label: string;
      expires_at: string;
    }>(
      "insert into advertiser_api_keys(id,advertiser_id,token_hash,label,expires_at) values($1,$2,$3,$4,now()+interval '90 days') returning id,label,expires_at",
      [randomUUID(), id, digest(token), name],
    );
    await audit(id, "advertiser-key-create", String(row.id), {});
    return { ...row, token };
  });
}
export async function revokeAdvertiserKey(id: string, key: unknown) {
  await execute(
    "update advertiser_api_keys set revoked_at=now() where id=$1 and advertiser_id=$2",
    [z.string().uuid().parse(key), id],
  );
  await audit(id, "advertiser-key-revoke", String(key), {});
}
export async function advertiserKeyIdentity(token: string) {
  if (!/^om_adv_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return (
    (
      await query<{ id: string; advertiser_id: string }>(
        "select id,advertiser_id from advertiser_api_keys where token_hash=$1 and revoked_at is null and expires_at>now()",
        [digest(token)],
      )
    )[0] || null
  );
}
const object = { type: "object" as const, additionalProperties: false };
export const advertiserTools = [
  {
    name: "get_catalog",
    description:
      "상품 구성, VAT 포함 가격 기준, 입금 안내 조회. MCP 사용료는 무료이며 캠페인은 유료입니다.",
    inputSchema: { ...object, properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "quote_campaigns",
    description: "캠페인 구성의 서버 견적. 저장·결제하지 않습니다.",
    inputSchema: {
      ...object,
      properties: { campaigns: { type: "array", items: { type: "object" } } },
      required: ["campaigns"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_my_campaigns",
    description: "연결한 광고주의 주문·지원·검수·환불 현황만 조회.",
    inputSchema: { ...object, properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_campaign_order",
    description:
      "사용자가 구성·금액·결제 및 환불 조건을 확인한 뒤에만 주문 접수. 입금 대기이며 관리자 입금 확인 뒤 공개됩니다. 재시도에는 같은 UUID를 쓰세요.",
    inputSchema: {
      ...object,
      properties: {
        id: { type: "string", format: "uuid" },
        campaigns: { type: "array", items: { type: "object" } },
        expectedTotal: { type: "integer" },
        policyVersion: { type: "string" },
        consent: { type: "boolean", const: true },
      },
      required: [
        "id",
        "campaigns",
        "expectedTotal",
        "policyVersion",
        "consent",
      ],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
];
export async function callAdvertiserTool(
  id: string,
  name: string,
  args: unknown,
) {
  if (name === "get_catalog")
    return {
      policyVersion,
      currency: "KRW",
      vat: "포함",
      selfCash: "보수 10%, 최소 5,000원",
      selfProduct: "완료 1명당 3,000원, 최소 5,000원",
      package: 220000,
      managed: "5명까지 60,000원, 추가 인원당 10,000원",
      campaignFields: {
        title: "제목",
        brand: "브랜드",
        product: "제품",
        guide: "가이드",
        kind: ["self_cash", "self_product", "package"],
        channel: ["blog", "clip", "bundle"],
        quantity: "1~100, 패키지는5",
        reward: "1명 현금 보수, 제품형·패키지0",
        benefit: "제품 제공 조건",
        managed: "boolean",
        deadline: "YYYY-MM-DD 모집 마감",
        submissionDeadline: "YYYY-MM-DD 게시 마감",
      },
      payment: await paymentInstructions(),
    };
  if (name === "list_my_campaigns")
    return commerceView({ role: "advertiser", id });
  if (name === "quote_campaigns") {
    const b = z
      .object({ campaigns: z.array(z.unknown()).min(1).max(10) })
      .strict()
      .parse(args);
    const campaigns = b.campaigns.map(campaignQuote);
    return {
      policyVersion,
      campaigns,
      total: campaigns.reduce((n, c) => n + c.total, 0),
      requiresConfirmation: true,
    };
  }
  if (name === "create_campaign_order") return checkout(id, args);
  throw new Error("지원하지 않는 광고주 도구입니다.");
}
