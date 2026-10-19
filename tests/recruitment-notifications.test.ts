import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, get, list, transaction, update } from "../src/lib/db";
import { proposeWork } from "../src/lib/work-offers";
import {
  queueRecruitment,
  sendRecruitment,
  refreshRecruitment,
  recruitmentSendTime,
} from "../src/lib/recruitment-notifications";
const originalFetch = globalThis.fetch;
const keys = [
  "SENS_BRAND_ENABLED",
  "NCP_ACCESS_KEY",
  "NCP_SECRET_KEY",
  "SENS_SERVICE_ID",
  "SENS_CHANNEL_ID",
  "APP_URL",
];
const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
after(() => {
  globalThis.fetch = originalFetch;
  for (const k of keys) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});
Object.assign(process.env, {
  SENS_BRAND_ENABLED: "true",
  NCP_ACCESS_KEY: "test",
  NCP_SECRET_KEY: "test",
  SENS_SERVICE_ID: "test",
  SENS_CHANNEL_ID: "@test",
  APP_URL: "https://example.com",
});
async function fixture(consent = true) {
  const p = await create("participants", {
    name: "test",
    status: "active",
    phone: "01012345678",
    kakaoMarketingConsent: consent,
  });
  const project = await create("projects", {
    name: "campaign",
    status: "active",
  });
  const offer = await create("work_offers", {
    projectId: project.id,
    participantId: p.id,
    name: "campaign",
    amount: 8000,
    status: "proposed",
    expiresAt: "2035-01-01T00:00:00Z",
  });
  const n = await transaction(() => queueRecruitment(offer));
  return { p, project, offer, n };
}
test("KST advertising window boundaries", () => {
  for (const [time, expected] of [
    ["07:59:59", false],
    ["08:00:00", true],
    ["20:49:59", true],
    ["20:50:00", false],
    ["23:30:00", false],
  ] as const)
    assert.equal(
      recruitmentSendTime(new Date(`2026-10-19T${time}+09:00`)),
      expected,
    );
});
test("no consent means no queue; duplicate offers create one notification", async () => {
  assert.equal((await fixture(false)).n, undefined);
  const { offer, n } = await fixture();
  assert.equal((await transaction(() => queueRecruitment(offer)))?.id, n!.id);
});
test("creating an actual work proposal atomically queues an opted-in recruitment message", async () => {
  const accountId = crypto.randomUUID();
  const p = await create("participants", {
    name: "worker",
    status: "active",
    phone: "01012345678",
    kakaoMarketingConsent: true,
    accounts: [
      {
        id: accountId,
        channel: "blog",
        url: "https://blog.naver.com/recruitment-test",
        approvalStatus: "approved",
      },
    ],
  });
  const project = await create("projects", {
    name: "campaign",
    status: "producing",
    due: "2035-01-01",
  });
  const task = await create("tasks", {
    projectId: project.id,
    channel: "blog",
    status: "producing",
  });
  const slot = await create("work_slots", {
    projectId: project.id,
    type: "blog",
    name: "blog",
    status: "unassigned",
    taskIds: [task.id],
  });
  const offer = await proposeWork(
    { slotId: slot.id, participantId: p.id, blogAccountId: accountId },
    "test",
  );
  const message = (await list("notification_outbox")).find(
    (n) => n.type === "recruitment" && n.eventId === offer.id,
  );
  assert.equal(message?.eventId, offer.id);
  assert.equal(message?.status, "queued");
});
test("consent withdrawal, deleted participant, expired/responded offer and held project cancel without sending", async () => {
  let sends = 0;
  globalThis.fetch = async () => {
    sends++;
    return Response.json({});
  };
  for (const reason of ["withdraw", "deleted", "expired", "accepted", "held"]) {
    const { p, project, offer, n } = await fixture();
    if (reason === "withdraw")
      await update(p.id, { kakaoMarketingConsent: false });
    if (reason === "deleted")
      await update(p.id, { deletedAt: new Date().toISOString() });
    if (reason === "expired")
      await update(offer.id, { expiresAt: "2020-01-01" });
    if (reason === "accepted") await update(offer.id, { status: "accepted" });
    if (reason === "held") await update(project.id, { hold: true });
    await sendRecruitment(n!.id);
    assert.equal((await get(n!.id))?.status, "cancelled");
  }
  assert.equal(sends, 0);
});
test("night queues stay queued and do not call provider", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-19T21:00:00+09:00"),
  });
  const { n } = await fixture();
  globalThis.fetch = async () => {
    throw new Error("must not send");
  };
  await assert.rejects(sendRecruitment(n!.id), /08:00/);
  assert.equal((await get(n!.id))?.status, "queued");
});
test("concurrent send is once, uses latest phone, target I, portal URL and no SMS fallback; polls delivery", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-19T13:00:00+09:00"),
  });
  const { p, n } = await fixture();
  await update(p.id, { phone: "01087654321" });
  let sends = 0;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/brandmessage\/v2\//);
    if (init?.method === "GET")
      return Response.json({
        messageStatusName: "success",
        messageStatusCode: "0000",
      });
    sends++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.targeting, "I");
    assert.equal(body.messages[0].to, "01087654321");
    assert.equal(body.messages[0].useSmsFailover, false);
    assert.match(body.messages[0].content, /^\(광고\) 원케이션/);
    assert.equal(
      body.messages[0].buttons[0].linkMobile,
      "https://example.com/participants/portal",
    );
    return Response.json({
      requestId: "request",
      messages: [{ messageId: "message", requestStatusCode: "A000" }],
    });
  };
  await Promise.allSettled([sendRecruitment(n!.id), sendRecruitment(n!.id)]);
  assert.equal(sends, 1);
  assert.equal((await get(n!.id))?.status, "accepted");
  assert.equal((await refreshRecruitment(n!.id)).status, "succeeded");
});
test("ambiguous network error cannot be resent", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-19T13:00:00+09:00"),
  });
  const { n } = await fixture();
  let sends = 0;
  globalThis.fetch = async () => {
    sends++;
    throw new Error("timeout");
  };
  await assert.rejects(sendRecruitment(n!.id), /timeout/);
  assert.equal((await get(n!.id))?.status, "uncertain");
  await assert.rejects(sendRecruitment(n!.id), /발송 가능한/);
  assert.equal(sends, 1);
});
