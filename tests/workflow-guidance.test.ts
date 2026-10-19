import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectActions,
  participantTaskGuide,
  reportSchedule,
} from "../src/lib/workflow-guidance";
import { kinds, type DatabaseView, type RecordData } from "../src/lib/types";
const now = Date.parse("2026-10-18T15:10:00Z"); // Monday 00:10 in Korea, Sunday UTC.
const row = (
  id: string,
  kind: RecordData["kind"],
  extra: Record<string, unknown> = {},
): RecordData => ({
  id,
  kind,
  version: 1,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  ...extra,
});
const fixture = () => {
  const data = Object.fromEntries(
    kinds.map((k) => [k, []]),
  ) as unknown as DatabaseView;
  const project = row("p", "projects", {
    status: "producing",
    due: "2026-11-30",
  });
  data.projects = [project];
  return { data, project };
};
test("next actions separate review-ready submissions, waiting, fully approved deliveries and unfinished bundles", () => {
  const { data, project } = fixture();
  data.tasks = [
    row("t1", "tasks", {
      projectId: "p",
      status: "submitted",
      reviewEligibleAt: new Date(now - 1000).toISOString(),
    }),
    row("t2", "tasks", {
      projectId: "p",
      status: "submitted",
      reviewEligibleAt: new Date(now + 1000).toISOString(),
    }),
    row("a", "tasks", { projectId: "p", status: "approved" }),
    row("b", "tasks", { projectId: "p", status: "review" }),
    row("c", "tasks", { projectId: "other", status: "review" }),
  ];
  data.work_slots = [
    row("s1", "work_slots", {
      projectId: "p",
      participantId: "worker",
      taskIds: ["a"],
    }),
    row("s2", "work_slots", {
      projectId: "p",
      participantId: "worker",
      taskIds: ["a", "b"],
    }),
  ];
  const actions = projectActions(data, project, now);
  assert.equal(actions.find((a) => a.key === "publication")?.count, 1);
  assert.equal(actions.find((a) => a.key === "delivery")?.count, 1);
  assert.equal(actions.find((a) => a.key === "review")?.count, 1);
});
test("active proposals suppress duplicate recruitment and expired proposals reopen the action", () => {
  const { data, project } = fixture();
  data.tasks = [row("t", "tasks", { projectId: "p", status: "planned" })];
  data.work_slots = [
    row("s", "work_slots", {
      projectId: "p",
      status: "unassigned",
      taskIds: ["t"],
    }),
  ];
  data.work_offers = [
    row("o", "work_offers", {
      slotId: "s",
      status: "proposed",
      expiresAt: new Date(now + 1000).toISOString(),
    }),
  ];
  assert.ok(
    !projectActions(data, project, now).some((a) => a.key === "offers"),
  );
  data.work_offers[0].expiresAt = new Date(now - 1000).toISOString();
  assert.equal(
    projectActions(data, project, now).find((a) => a.key === "offers")?.count,
    1,
  );
});
test("closed and held campaigns hide production but retain post-payment recovery actions", () => {
  const { data, project } = fixture();
  data.tasks = [row("t", "tasks", { projectId: "p", status: "review" })];
  assert.deepEqual(projectActions(data, { ...project, hold: true }, now), []);
  data.tasks[0].retentionStatus = "needs_recovery";
  assert.deepEqual(
    projectActions(data, { ...project, settled: true }, now).map((a) => a.key),
    ["recovery"],
  );
});
test("full payout and partial bundle review navigate to their respective workflows", () => {
  const { data, project } = fixture();
  data.tasks = [
    row("a", "tasks", {
      projectId: "p",
      status: "verified",
      workSlotId: "full",
    }),
    row("b", "tasks", {
      projectId: "p",
      status: "verified",
      workSlotId: "partial",
    }),
    row("c", "tasks", {
      projectId: "p",
      status: "delivered",
      workSlotId: "partial",
    }),
  ];
  data.work_slots = [
    row("full", "work_slots", {
      projectId: "p",
      participantId: "worker",
      taskIds: ["a"],
    }),
    row("partial", "work_slots", {
      projectId: "p",
      participantId: "worker",
      taskIds: ["b", "c"],
    }),
  ];
  const a = projectActions(data, project, now);
  assert.equal(a.find((x) => x.key === "payment")?.tab, 7);
  assert.equal(a.find((x) => x.key === "partial_payment")?.workflow, true);
  data.tasks[1].payoutStatus = "paid";
  assert.ok(
    !projectActions(data, project, now).some(
      (x) => x.key === "partial_payment",
    ),
  );
});
test("participant guidance distinguishes preparation, submission, revision, verification and actual payment", () => {
  assert.match(participantTaskGuide({ status: "approved" }).title, /준비/);
  assert.match(participantTaskGuide({ status: "delivered" }).title, /게시/);
  assert.match(
    participantTaskGuide({
      status: "delivered",
      revisionNotes: "해시태그 수정",
    }).description,
    /해시태그/,
  );
  assert.match(
    participantTaskGuide({
      status: "submitted",
      reviewEligibleAt: "2026-10-22T01:00:00Z",
    }).description,
    /2026/,
  );
  assert.match(participantTaskGuide({ status: "verified" }).title, /지급 대기/);
  assert.match(
    participantTaskGuide({ status: "verified", payoutStatus: "paid" }).title,
    /지급이 완료/,
  );
  assert.match(
    participantTaskGuide({
      status: "verified",
      payoutStatus: "paid",
      retentionStatus: "needs_recovery",
    }).title,
    /복구/,
  );
});
test("customer schedule uses Korean week boundaries and distinguishes links from verified posts without cancelled tasks", () => {
  const tasks = [
    row("a", "tasks", {
      scheduledUntil: "2026-10-19",
      status: "submitted",
      link: "https://example.com/a",
    }),
    row("b", "tasks", {
      scheduledUntil: "2026-10-25",
      status: "verified",
      link: "https://example.com/b",
    }),
    row("c", "tasks", { scheduledUntil: "2026-10-18", status: "delivered" }),
    row("d", "tasks", { status: "planned" }),
    row("e", "tasks", { scheduledUntil: "2026-10-20", status: "cancelled" }),
  ];
  const r = reportSchedule(tasks, now);
  assert.equal(r.weekStart, "2026-10-19");
  assert.equal(r.weekEnd, "2026-10-25");
  assert.equal(r.total, 4);
  assert.equal(r.scheduled, 3);
  assert.equal(r.planned, 2);
  assert.equal(r.submitted, 2);
  assert.equal(r.verified, 1);
  assert.equal(r.overdue, 1);
  assert.equal(r.remaining, 0);
  assert.equal(reportSchedule([], now).scheduled, 0);
});
test("running generation waits without duplicate production actions and older submissions keep their review clock", () => {
  const { data, project } = fixture();
  data.tasks = [
    row("a", "tasks", { projectId: "p", status: "producing" }),
    row("b", "tasks", {
      projectId: "p",
      status: "submitted",
      submittedAt: new Date(now - 4 * 86400000).toISOString(),
    }),
  ];
  data.jobs = [
    row("j", "jobs", { projectId: "p", taskId: "a", status: "running" }),
  ];
  const actions = projectActions(data, project, now);
  assert.ok(!actions.some((a) => a.key === "production"));
  assert.equal(actions.find((a) => a.key === "publication")?.count, 1);
});
