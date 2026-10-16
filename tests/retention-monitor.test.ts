import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, get, list, update } from "../src/lib/db";
import {
  applyProbe,
  retentionDue,
  retentionMonitorTick,
} from "../src/lib/retention-monitor";
import { reportRecovery, checkRetention } from "../src/lib/retention";
import {
  retentionAdminAlertTick,
  retentionAdminTemplate,
} from "../src/lib/retention-admin-alert";

const hour = 3600000;
async function fixture() {
  const p = await create("participants", {
    name: "유지 QA",
    status: "active",
    phone: "01012345678",
    accounts: [],
  });
  const project = await create("projects", {
    workflowPolicy: { revisionDays: 2 },
  });
  return create("tasks", {
    name: "QA 유지 게시물",
    projectId: project.id,
    participantId: p.id,
    status: "verified",
    payoutStatus: "paid",
    amount: 7000,
    link: "https://blog.naver.com/retention-qa/123",
    retentionUntil: new Date(Date.now() + 89 * 86400000).toISOString(),
  });
}
test("two spaced missing responses after a public baseline create one recovery and admin alert", async () => {
  const now = Date.now();
  let t = await fixture();
  const end = t.retentionUntil;
  t = (await applyProbe(t, { state: "public", reason: "공개" }, now))!;
  t = (await applyProbe(
    t,
    { state: "missing", reason: "404" },
    now + 24 * hour,
  ))!;
  assert.notEqual(t.retentionStatus, "needs_recovery");
  t = (await applyProbe(
    t,
    { state: "missing", reason: "404" },
    now + 30 * hour,
  ))!;
  assert.equal(t.retentionStatus, "needs_recovery");
  assert.equal(t.retentionMonitorAlert, true);
  t = (await applyProbe(
    t,
    { state: "missing", reason: "404" },
    now + 36 * hour,
  ))!;
  assert.equal(
    (await list("notification_outbox")).filter(
      (n) => String(n.eventId).startsWith(t.id + ":") && n.type === "retention",
    ).length,
    1,
  );
  assert.equal(
    (await list("notification_outbox")).filter(
      (n) =>
        String(n.eventId).startsWith(t.id + ":") &&
        n.type === "retention_admin",
    ).length,
    1,
  );
  assert.equal(t.payoutStatus, "paid");
  assert.equal(t.amount, 7000);
  assert.equal(t.retentionUntil, end);
  t = await reportRecovery(t.id, String(t.participantId));
  t = (await applyProbe(
    t,
    { state: "public", reason: "복구 확인" },
    now + 42 * hour,
  ))!;
  // Visibility alone cannot close an operator's recovery review.
  assert.equal(t.retentionStatus, "recovery_submitted");
  t = await checkRetention(t.id, true, "", "qa", t.version);
  assert.equal(t.retentionMonitorAlert, false);
  assert.equal(t.retentionStatus, "public");
});
test("unknowns and absent baseline alert administrator without accusing participant", async () => {
  for (const state of ["unknown", "missing"] as const) {
    const now = Date.now();
    let t = await fixture();
    t = (await applyProbe(t, { state, reason: "접속 확인 필요" }, now))!;
    t = (await applyProbe(
      t,
      { state, reason: "접속 확인 필요" },
      now + 6 * hour,
    ))!;
    assert.equal(t.retentionMonitorAlert, true);
    assert.notEqual(t.retentionStatus, "needs_recovery");
    assert.equal(
      (await list("notification_outbox")).filter(
        (n) =>
          n.type === "retention" && String(n.eventId).startsWith(t.id + ":"),
      ).length,
      0,
    );
  }
});
test("stale fetch results, short intervals, and end of retention cannot trigger recovery", async () => {
  const now = Date.now();
  let t = await fixture();
  await update(t.id, { retentionNote: "운영자 확인" });
  assert.equal(
    await applyProbe(t, { state: "missing", reason: "404" }, now),
    null,
  );
  t = (await get(t.id))!;
  t = (await applyProbe(t, { state: "public", reason: "공개" }, now))!;
  t = (await applyProbe(t, { state: "missing", reason: "404" }, now + hour))!;
  t = (await applyProbe(
    t,
    { state: "missing", reason: "404" },
    now + 2 * hour,
  ))!;
  assert.notEqual(t.retentionStatus, "needs_recovery");
  t = await update(t.id, { retentionUntil: new Date(now - 1).toISOString() });
  assert.equal(retentionDue(t, now), false);
  assert.equal(
    await applyProbe(t, { state: "missing", reason: "404" }, now + 10 * hour),
    null,
  );
  assert.equal(
    retentionDue(
      { ...t, retentionStatus: "needs_recovery", retentionNextProbeAt: null },
      now,
    ),
    true,
  );
});
test("monitor batches are leased and health persists even when no media jobs exist", async () => {
  process.env.RETENTION_MONITOR_ENABLED = "true";
  await fixture();
  let calls = 0;
  let entered!: () => void, release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const first = retentionMonitorTick(async () => {
    calls++;
    entered();
    await gate;
    return { state: "unsupported", reason: "수동 확인" };
  });
  await started;
  const second = await retentionMonitorTick(async () => {
    throw new Error("동시 실행이 차단되어야 합니다.");
  });
  release();
  const result = [await first, second];
  assert.ok(result.some((r) => r.running));
  assert.ok(calls > 0);
  const health = (await list("events")).find(
    (e) => e.type === "retention-monitor-health",
  );
  assert.ok(health?.lastCompletedAt);
  assert.equal(health?.leaseUntil, null);
  delete process.env.RETENTION_MONITOR_ENABLED;
});
test("admin Alimtalk only sends approved template to configured administrator; resolved alerts cancelled", async () => {
  const old = { ...process.env };
  const original = globalThis.fetch;
  Object.assign(process.env, {
    RETENTION_ADMIN_ALIMTALK_ENABLED: "true",
    RETENTION_ADMIN_PHONE: "01099994649",
    SENS_TEMPLATE_RETENTION_ADMIN: retentionAdminTemplate.code,
    NCP_ACCESS_KEY: "qa",
    NCP_SECRET_KEY: "qa",
    SENS_SERVICE_ID: "qa",
    SENS_CHANNEL_ID: "@qa",
    APP_URL: "https://qa.test",
    SENS_ENABLED: "false",
  });
  const t = await fixture();
  await update(t.id, {
    retentionMonitorAlert: true,
    retentionMonitorEventId: t.id + ":qa",
  });
  const n = await create("notification_outbox", {
    type: "retention_admin",
    taskId: t.id,
    eventId: t.id + ":qa",
    status: "queued",
    attempts: 0,
    variables: { name: "QA", reason: "관리자 확인 필요" },
  });
  let approved = false;
  const sent: string[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "GET")
      return Response.json([
        {
          templateCode: retentionAdminTemplate.code,
          channelId: "@qa",
          templateInspectionStatus: approved ? "COMPLETE" : "INSPECT",
          templateStatus: "READY",
          isBlock: false,
          isDormant: false,
          content: retentionAdminTemplate.text,
          buttons: [
            {
              type: "WL",
              name: "관리자 화면",
              linkMobile: "https://qa.test/?page=workflow",
              linkPc: "https://qa.test/?page=workflow",
            },
          ],
        },
      ]);
    const payload = JSON.parse(String(init?.body));
    sent.push(payload.messages[0].to);
    return Response.json({
      requestId: "qa",
      messages: [{ messageId: "qa-id" }],
    });
  };
  try {
    await retentionAdminAlertTick();
    assert.equal((await get(n.id))?.status, "queued");
    assert.equal(sent.length, 0);
    approved = true;
    await retentionAdminAlertTick();
    assert.equal((await get(n.id))?.status, "accepted");
    assert.ok(sent.every((to) => to === "01099994649"));
    const stale = await create("notification_outbox", {
      type: "retention_admin",
      taskId: t.id,
      eventId: t.id + ":stale",
      status: "queued",
      attempts: 0,
      variables: { name: "QA", reason: "QA" },
    });
    await update(t.id, { retentionMonitorAlert: false });
    // Accepted result lookup uses the standard response shape, independently of new sends.
    await update(n.id, { status: "succeeded" });
    await retentionAdminAlertTick();
    assert.equal((await get(stale.id))?.status, "cancelled");
  } finally {
    globalThis.fetch = original;
    for (const key of Object.keys(process.env))
      if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
});
