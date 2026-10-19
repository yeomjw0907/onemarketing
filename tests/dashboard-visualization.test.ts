import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dashboardVisuals,
  dashboardDay,
  taskPipeline,
} from "../src/lib/dashboard-visualization";
import { kinds, type DatabaseView, type RecordData } from "../src/lib/types";
const row = (
  id: string,
  kind: RecordData["kind"],
  fields: Record<string, unknown> = {},
): RecordData => ({
  id,
  kind,
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...fields,
});
const now = new Date("2026-10-18T15:10:00Z"); // Monday in Korea, Sunday UTC.
function fixture() {
  const data = Object.fromEntries(
    kinds.map((k) => [k, []]),
  ) as unknown as DatabaseView;
  data.projects = [
    row("p", "projects", {
      status: "producing",
      customerId: "c",
      due: "2026-10-20",
      productUnderstandingCurrent: true,
    }),
  ];
  data.customers = [row("c", "customers", { name: "실제 고객" })];
  return data;
}
const task = (id: string, fields: Record<string, unknown> = {}) =>
  row(id, "tasks", {
    projectId: "p",
    channel: "blog",
    status: "planned",
    ...fields,
  });

test("content pipeline counts each non-cancelled task once, independently of participant assignment", () => {
  const data = fixture();
  data.tasks = [
    task("prep"),
    task("producing", { status: "producing" }),
    task("review", { status: "review" }),
    task("changes", { status: "changes" }),
    task("approved", { status: "approved" }),
    task("delivered", { status: "delivered" }),
    task("submitted", { status: "submitted" }),
    task("verified", { status: "verified" }),
    task("cancelled", { status: "cancelled" }),
  ];
  const v = dashboardVisuals(data, now),
    r = v.rows[0];
  assert.deepEqual(r.pipeline, [1, 1, 2, 3, 1]);
  assert.equal(r.total, 8);
  assert.equal(r.percent, 13);
  assert.equal(r.customer, "실제 고객");
  assert.equal(taskPipeline(task("no-worker", { status: "verified" })), 4);
});
test("weekly actuals use KST verifiedAt, never updatedAt or future/missing dates", () => {
  const data = fixture();
  data.tasks = [
    task("last-week", {
      status: "verified",
      verifiedAt: "2026-10-18T14:59:00Z",
    }),
    task("today", { status: "verified", verifiedAt: "2026-10-18T15:01:00Z" }),
    task("legacy-date", { status: "verified", verifiedAt: "2026-10-19" }),
    task("missing-date", { status: "verified", updatedAt: now.toISOString() }),
    task("future", { status: "verified", verifiedAt: "2026-10-19T04:00:00Z" }),
    task("cancelled", { status: "cancelled", verifiedAt: now.toISOString() }),
    task("orphan", {
      projectId: "missing",
      status: "verified",
      verifiedAt: now.toISOString(),
    }),
  ];
  const v = dashboardVisuals(data, now);
  assert.equal(v.weekStart, "2026-10-19");
  assert.equal(v.weekEnd, "2026-10-25");
  assert.equal(v.week.actual, 2);
  assert.equal(v.week.bars[0].actual, 2);
  assert.equal(v.month.actual, 3);
  assert.equal(v.undatedVerified, 1);
  assert.equal(v.recent.length, 3);
});
test("schedule goal is a separate cohort, excludes held/cancelled work, and history includes completed projects", () => {
  const data = fixture();
  data.projects.push(
    row("hold", "projects", { status: "publishing", hold: true }),
    row("completed", "projects", { status: "completed" }),
    row("cancelled", "projects", { status: "cancelled" }),
  );
  data.tasks = [
    task("late-confirmed", {
      status: "verified",
      scheduledUntil: "2026-10-10",
      verifiedAt: "2026-10-18T15:01:00Z",
    }),
    task("week", { scheduledUntil: "2026-10-23" }),
    task("held", { projectId: "hold", scheduledUntil: "2026-10-23" }),
    task("complete", {
      projectId: "completed",
      scheduledUntil: "2026-10-21",
      status: "verified",
      verifiedAt: "2026-10-18T15:02:00Z",
    }),
    task("cancelled-parent", {
      projectId: "cancelled",
      scheduledUntil: "2026-10-21",
      status: "verified",
      verifiedAt: "2026-10-18T15:02:00Z",
    }),
    task("cancelled-task", {
      status: "cancelled",
      scheduledUntil: "2026-10-21",
    }),
  ];
  const v = dashboardVisuals(data, now);
  assert.deepEqual(v.goal, { total: 2, done: 1 });
  assert.equal(v.week.actual, 2);
  assert.equal(v.week.planned, 1);
  assert.equal(v.rows.length, 2);
  assert.equal(v.rows.find((r) => r.project.id === "hold")!.board, 3);
});
test("month calendar handles month/year boundaries and empty goals without fabricated percentages", () => {
  const data = fixture();
  data.tasks = [task("next", { scheduledUntil: "2027-01-02" })];
  const v = dashboardVisuals(data, new Date("2026-12-31T15:10:00Z"));
  assert.equal(v.month.start, "2027-01-01");
  assert.equal(v.month.end, "2027-01-31");
  assert.equal(v.month.bars.length, 5);
  assert.equal(v.month.bars[0].planned, 1);
  assert.equal(v.goal.total, 1);
  const empty = dashboardVisuals(fixture(), now);
  assert.equal(empty.rows[0].percent, null);
  assert.deepEqual(empty.goal, { total: 0, done: 0 });
  assert.equal(empty.week.actual, 0);
  assert.equal(dashboardDay("2026-02-30"), null);
  assert.equal(dashboardDay("garbage"), null);
});
test("next actions retain completed-project recovery and workflow destinations, and do not prematurely review submissions", () => {
  const data = fixture();
  data.projects.push(
    row("done", "projects", { status: "completed", settled: true }),
  );
  data.tasks = [
    task("wait", {
      status: "submitted",
      reviewEligibleAt: "2026-10-19T15:00:00Z",
    }),
    task("recovery", {
      projectId: "done",
      status: "verified",
      retentionStatus: "needs_recovery",
    }),
  ];
  const v = dashboardVisuals(data, now);
  assert.equal(v.actions[0].project.id, "done");
  assert.equal(v.actions[0].action.key, "recovery");
  assert.equal(v.actions[0].action.workflow, true);
  assert.ok(!v.actions.some((a) => a.action.key === "publication"));
});
test("AI activity uses stored states and timestamps, including live work in held projects", () => {
  const data = fixture();
  data.projects[0].hold = true;
  data.jobs = [
    row("pending", "jobs", { projectId: "p", status: "pending" }),
    row("running", "jobs", { projectId: "p", status: "running" }),
    row("uncertain", "jobs", { projectId: "p", status: "uncertain" }),
    row("failed", "jobs", { projectId: "p", status: "failed" }),
    row("done", "jobs", {
      projectId: "p",
      status: "succeeded",
      completedAt: "2026-10-18T15:01:00Z",
    }),
    row("no-time", "jobs", { projectId: "p", status: "succeeded" }),
  ];
  const v = dashboardVisuals(data, now);
  assert.equal(v.jobs.length, 3);
  assert.equal(v.jobs[0].id, "running");
  assert.equal(v.recent.length, 1);
  assert.equal(v.recent[0].id, "done");
});
