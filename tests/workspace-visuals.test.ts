import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardVisuals } from "../src/lib/dashboard-visualization";
import {
  workspaceSnapshot,
  dashboardHeadline,
  recordProgress,
} from "../src/lib/workspace-visuals";
import { kinds, type DatabaseView, type RecordData } from "../src/lib/types";
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
const now = new Date("2026-10-18T15:10:00Z");
const fixture = () => {
  const d = Object.fromEntries(
    kinds.map((k) => [k, []]),
  ) as unknown as DatabaseView;
  d.projects = [
    row("p", "projects", {
      status: "producing",
      due: "2026-10-20",
      productUnderstandingCurrent: true,
    }),
  ];
  return d;
};
test("workspace counts exclude deleted catalogs, orphan products and cancelled-project work", () => {
  const d = fixture();
  d.customers = [
    row("a", "customers"),
    row("deleted", "customers", { deletedAt: now.toISOString() }),
  ];
  d.products = [
    row("valid", "products", { customerId: "a" }),
    row("deleted-parent", "products", { customerId: "deleted" }),
    row("orphan", "products", { customerId: "missing" }),
  ];
  d.projects.push(row("cancelled", "projects", { status: "cancelled" }));
  d.tasks = [
    row("review", "tasks", { projectId: "p", status: "review" }),
    row("cancel", "tasks", { projectId: "cancelled", status: "review" }),
  ];
  d.assets = [
    row("current-source", "assets", { customerId: "a" }),
    row("deleted-source", "assets", { customerId: "deleted" }),
    row("project-source", "assets", { customerId: "a", projectId: "p" }),
  ];
  const s = workspaceSnapshot(d, now.getTime());
  assert.equal(s.customers.length, 1);
  assert.equal(s.products.length, 1);
  assert.equal(s.sources.length, 1);
  assert.equal(s.review, 1);
});
test("review-ready count separates three-day waiting and includes completed-project recovery", () => {
  const d = fixture();
  d.projects.push(row("done", "projects", { status: "completed" }));
  d.tasks = [
    row("ready", "tasks", {
      projectId: "p",
      status: "submitted",
      submittedAt: new Date(now.getTime() - 4 * 86400000).toISOString(),
    }),
    row("waiting", "tasks", {
      projectId: "p",
      status: "submitted",
      reviewEligibleAt: new Date(now.getTime() + 86400000).toISOString(),
    }),
    row("restored", "tasks", {
      projectId: "done",
      status: "verified",
      retentionStatus: "needs_recovery",
    }),
  ];
  const s = workspaceSnapshot(d, now.getTime());
  assert.equal(s.submitted, 2);
  assert.equal(s.reviewReady, 1);
  assert.equal(s.recovery, 1);
});
test("headline prioritizes recovery over deadlines and retains exact workflow destination", () => {
  const d = fixture();
  d.projects[0].due = "2026-10-18";
  d.tasks = [
    row("recovery", "tasks", {
      projectId: "p",
      status: "verified",
      retentionMonitorAlert: true,
    }),
  ];
  let h = dashboardHeadline(dashboardVisuals(d, now));
  assert.equal(h.projectId, "p");
  assert.equal(h.workflow, true);
  assert.equal(h.section, "review");
  d.tasks = [];
  h = dashboardHeadline(dashboardVisuals(d, now));
  assert.match(h.title, /마감이 지난 캠페인 1개/);
  assert.equal(h.projectId, "p");
});
test("headline distinguishes today from overdue and does not claim healthy operations without evidence", () => {
  const d = fixture();
  d.projects[0].due = "2026-10-19";
  assert.match(dashboardHeadline(dashboardVisuals(d, now)).title, /오늘 마감/);
  d.projects[0].hold = true;
  assert.match(
    dashboardHeadline(dashboardVisuals(d, now)).title,
    /확인해보세요/,
  );
  d.projects = [];
  assert.match(dashboardHeadline(dashboardVisuals(d, now)).title, /첫 캠페인/);
  assert.deepEqual(
    recordProgress([
      row("verified", "tasks", { status: "verified" }),
      row("cancelled", "tasks", { status: "cancelled" }),
    ]),
    { total: 1, done: 1 },
  );
});

test("recruitment overview excludes held, completed, settled and empty slots", () => {
  const d = fixture();
  d.projects.push(
    row("held", "projects", { status: "producing", hold: true }),
    row("done", "projects", { status: "completed" }),
    row("settled", "projects", { status: "producing", settled: true }),
  );
  d.tasks = [row("t", "tasks", { projectId: "p", status: "planned" })];
  d.work_slots = [
    row("open", "work_slots", { projectId: "p", taskIds: ["t"] }),
    row("held-slot", "work_slots", { projectId: "held", taskIds: ["t"] }),
    row("done-slot", "work_slots", { projectId: "done", taskIds: ["t"] }),
    row("settled-slot", "work_slots", { projectId: "settled", taskIds: ["t"] }),
    row("empty-slot", "work_slots", { projectId: "p", taskIds: [] }),
    row("assigned", "work_slots", {
      projectId: "p",
      taskIds: ["t"],
      participantId: "worker",
    }),
  ];
  assert.deepEqual(
    workspaceSnapshot(d, now.getTime()).assignableSlots.map((s) => s.id),
    ["open"],
  );
});
