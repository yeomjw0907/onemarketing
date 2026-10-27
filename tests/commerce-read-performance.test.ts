import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { create, execute } from "../src/lib/db";
import { commerceView } from "../src/lib/commerce";
test("캠페인이 늘어도 조회 수를 제한하고 참여자 정보는 본인에게만 노출한다", async () => {
  const advertiser = randomUUID();
  await execute(
    "insert into advertiser_accounts(id,email,password_hash,name,phone) values($1,$2,'unused','성능 확인','01000000000')",
    [advertiser, advertiser + "@test.local"],
  );
  const own = await create("participants", { name: "본인", status: "active" }),
    other = await create("participants", {
      name: "다른 참여자",
      status: "active",
    });
  for (let i = 0; i < 20; i++) {
    const order = randomUUID(),
      campaign = randomUUID();
    await execute(
      "insert into commerce_orders(id,advertiser_id,request_hash,data) values($1,$2,$3,$4::jsonb)",
      [
        order,
        advertiser,
        randomUUID(),
        JSON.stringify({ status: "paid", total: 10000 }),
      ],
    );
    await execute(
      "insert into commerce_campaigns(id,order_id,data) values($1,$2,$3::jsonb)",
      [
        campaign,
        order,
        JSON.stringify({
          status: "recruiting",
          input: { title: "테스트 캠페인" },
          terms: {},
          history: [],
        }),
      ],
    );
    for (const participant of [own, other])
      await execute(
        "insert into commerce_applications(id,campaign_id,participant_id,data) values($1,$2,$3,$4::jsonb)",
        [
          randomUUID(),
          campaign,
          participant.id,
          JSON.stringify({
            status: "applied",
            history: ["internal"],
            referrerSnapshot: { private: true },
          }),
        ],
      );
  }
  const proto = Pool.prototype as any,
    original = proto.query;
  let reads = 0;
  proto.query = function (sql: unknown, ...args: unknown[]) {
    if (typeof sql === "string" && /^select/i.test(sql)) reads++;
    return original.call(this, sql, ...args);
  };
  try {
    const admin = await commerceView({ role: "admin", id: "admin@test.local" });
    assert.equal(admin.campaigns.length, 20);
    assert.ok(reads <= 8, `20개 캠페인 조회에 ${reads}번 요청했습니다.`);
    assert.equal(admin.campaigns[0].applications.length, 2);
    assert.ok((admin.campaigns[0].applications[0] as any).participant);
    const view = await commerceView({ role: "participant", id: own.id });
    assert.equal(view.orders.length, 0);
    assert.equal(view.campaigns.length, 20);
    for (const c of view.campaigns) {
      assert.equal(c.applications.length, 1);
      assert.equal(c.applications[0].participant_id, own.id);
      assert.equal(c.order_id, undefined);
      assert.equal((c.applications[0].data as any).history, undefined);
    }
    const foreign = await commerceView({
      role: "advertiser",
      id: randomUUID(),
    });
    assert.equal(foreign.campaigns.length, 0);
  } finally {
    proto.query = original;
  }
});
