import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "./helpers";
import { execute, create } from "../src/lib/db";
import { platformFunnel } from "../src/lib/platform-funnel";
import { funnelRange } from "../src/lib/funnel-metrics";
test("business records reach admin funnel without PII; pending and legacy coverage stay separate", async () => {
  const account = randomUUID(),
    order = randomUUID(),
    campaign = randomUUID();
  const secret = "never-export@example.test";
  await execute(
    "insert into advertiser_accounts(id,email,password_hash,name,phone,created_at) values($1,$2,'hash','PRIVATE NAME','01099999999','2026-09-01')",
    [account, secret],
  );
  await execute(
    "insert into commerce_orders(id,advertiser_id,request_hash,data,created_at) values($1,$2,'qa',$3::jsonb,'2026-09-02')",
    [
      order,
      account,
      JSON.stringify({
        status: "paid",
        paidAt: "2026-09-03T00:00:00Z",
        bank: { account: "SECRET BANK" },
      }),
    ],
  );
  await execute(
    "insert into commerce_campaigns(id,order_id,data,created_at) values($1,$2,$3::jsonb,'2026-09-02')",
    [
      campaign,
      order,
      JSON.stringify({
        status: "completed",
        completedAt: "2026-09-06T00:00:00Z",
      }),
    ],
  );
  const p = await create("participants", {
    name: "PRIVATE PARTICIPANT",
    phone: "01099999998",
  });
  await execute(
    "update records set created_at='2026-09-01T01:00:00Z' where id=$1",
    [p.id],
  );
  await execute(
    "insert into participant_applications(id,participant_id,status,data,created_at) values($1,$2,'approved',$3::jsonb,'2026-09-01')",
    [
      randomUUID(),
      p.id,
      JSON.stringify({ email: secret, trustedKakaoId: "SECRET ID" }),
    ],
  );
  await execute(
    "insert into commerce_applications(id,campaign_id,participant_id,data,created_at) values($1,$2,$3,$4::jsonb,'2026-09-02')",
    [
      randomUUID(),
      campaign,
      p.id,
      JSON.stringify({
        status: "paid",
        respondedAt: "2026-09-03T00:00:00Z",
        firstSubmittedAt: "2026-09-04T00:00:00Z",
        submittedAt: "2026-10-31T00:00:00Z",
        verifiedAt: "2026-09-05T00:00:00Z",
        paidAt: "2026-09-06T00:00:00Z",
        name: secret,
      }),
    ],
  );
  await execute(
    "insert into market_entries(id,kind,owner_id,data,created_at) values($1,'application',$2,'{}','2026-09-02')",
    [randomUUID(), p.id],
  );
  await execute(
    "insert into advertiser_accounts(id,email,password_hash,name,phone,created_at) values($1,'pending@qa.local','hash','PRIVATE','01000000000','2026-10-31')",
    [randomUUID()],
  );
  const report = await platformFunnel(
    funnelRange("2026-09-01", "2026-10-31", 7, new Date("2026-11-02")),
  );
  const [participant, advertiser, application, orders] = report.funnels;
  assert.deepEqual(
    participant.steps.map((s) => s.reached),
    [1, 1, 1],
  );
  assert.deepEqual([advertiser.mature, advertiser.pending], [1, 1]);
  assert.deepEqual(
    application.steps.map((s) => s.reached),
    [1, 1, 1, 1, 1],
  );
  assert.deepEqual(
    orders.steps.map((s) => s.reached),
    [1, 1, 1],
  );
  assert.equal(report.coverage.legacyApplications, 1);
  const serialized = JSON.stringify(report);
  for (const value of [
    secret,
    "PRIVATE",
    "SECRET BANK",
    "SECRET ID",
    account,
    p.id,
  ])
    assert.equal(serialized.includes(value), false);
  // All campaigns, not just one, must complete an order. Missing completion
  // timestamps remain unknown rather than being fabricated from updated_at.
  await execute(
    "insert into commerce_campaigns(id,order_id,data,created_at) values($1,$2,'{\"status\":\"completed\"}','2026-09-02')",
    [randomUUID(), order],
  );
  const incomplete = await platformFunnel(report.range);
  assert.deepEqual(
    incomplete.funnels[3].steps.map((s) => s.reached),
    [1, 1, 0],
  );
  assert.equal(incomplete.coverage.undatedCompleted, 1);
  const slot = await create("work_slots", {
    participantId: p.id,
    acceptedAt: "2026-09-03T00:00:00Z",
    payoutStatus: "paid",
    paidAt: "2026-09-06T00:00:00Z",
  });
  const offer = await create("work_offers", {
    slotId: slot.id,
    status: "accepted",
  });
  await create("tasks", {
    workSlotId: slot.id,
    participantId: p.id,
    firstSubmittedAt: "2026-09-04T00:00:00Z",
    firstVerifiedAt: "2026-09-05T00:00:00Z",
  });
  await execute(
    "update market_entries set data=$1::jsonb where kind='application'",
    [JSON.stringify({ offerId: offer.id })],
  );
  const linked = await platformFunnel(report.range);
  assert.deepEqual(
    linked.funnels[4].steps.map((s) => s.reached),
    [1, 1, 1, 1, 1],
  );
  await create("tasks", { workSlotId: slot.id, participantId: p.id });
  const partial = await platformFunnel(report.range);
  assert.deepEqual(
    partial.funnels[4].steps.map((s) => s.reached),
    [1, 1, 0, 0, 0],
  );
});
