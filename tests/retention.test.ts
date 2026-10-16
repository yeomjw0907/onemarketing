import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, get, list, update } from "../src/lib/db";
import { checkRetention, reportRecovery } from "../src/lib/retention";

test("paid publication recovery preserves settlement, link and original 90-day end", async () => {
  const p = await create("participants", {
    name: "유지 QA",
    status: "active",
    phone: "01012345678",
    accounts: [],
  });
  const project = await create("projects", {
    workflowPolicy: { revisionDays: 3 },
  });
  const end = new Date(Date.now() + 89 * 86400000).toISOString();
  let t = await create("tasks", {
    name: "삭제 확인 QA",
    projectId: project.id,
    participantId: p.id,
    status: "verified",
    payoutStatus: "paid",
    amount: 7000,
    link: "https://blog.naver.com/retention-qa/1",
    retentionUntil: end,
  });
  await assert.rejects(
    checkRetention(t.id, false, "", "qa", t.version),
    /입력/,
  );
  t = await checkRetention(
    t.id,
    false,
    "비공개 확인 · 공개로 복구해주세요",
    "qa",
    t.version,
  );
  assert.equal(t.retentionStatus, "needs_recovery");
  assert.ok(
    Date.parse(String(t.retentionRecoveryDue)) > Date.now() + 2.9 * 86400000,
  );
  await assert.rejects(reportRecovery(t.id, "another"), /본인/);
  await assert.rejects(checkRetention(t.id, true, "", "qa", 1), /변경/);
  t = await checkRetention(t.id, false, "비공개 재확인", "qa", t.version);
  assert.equal(
    (await list("notification_outbox")).filter((n) =>
      String(n.eventId).startsWith(t.id + ":"),
    ).length,
    1,
  );
  t = await reportRecovery(t.id, p.id);
  assert.equal(t.retentionStatus, "recovery_submitted");
  assert.equal((await reportRecovery(t.id, p.id)).version, t.version);
  // An existing request can be resolved after the maintenance end date.
  t = await update(t.id, {
    retentionUntil: new Date(Date.now() - 1000).toISOString(),
  });
  t = await checkRetention(t.id, true, "", "qa", t.version);
  assert.equal(t.retentionStatus, "public");
  assert.equal(t.payoutStatus, "paid");
  assert.equal(t.amount, 7000);
  assert.equal(t.link, "https://blog.naver.com/retention-qa/1");
  assert.ok(Date.parse(String(t.retentionUntil)) < Date.now());
  await assert.rejects(
    checkRetention(t.id, false, "새 요청", "qa", t.version),
    /종료/,
  );
  await assert.rejects(reportRecovery(t.id, p.id), /요청 중/);
  const fresh = await create("tasks", {
    name: "90일 유지",
    projectId: project.id,
    participantId: p.id,
    status: "verified",
    link: "https://blog.naver.com/retention-qa/2",
    retentionUntil: end,
  });
  const checked = await checkRetention(fresh.id, true, "", "qa", fresh.version);
  assert.equal(checked.retentionUntil, end);
  assert.equal((await get(t.id))?.payoutStatus, "paid");
});
