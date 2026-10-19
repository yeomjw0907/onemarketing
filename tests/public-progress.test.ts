import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicProgress,
  participantNext,
  participantSteps,
  portalTaskMatches,
} from "../src/lib/public-progress";
test("public progress keeps link submission separate from verification and excludes cancelled tasks", () => {
  const p = publicProgress([
    { status: "planned" },
    { status: "producing" },
    { status: "changes" },
    { status: "approved" },
    { status: "delivered" },
    { status: "submitted" },
    { status: "verified" },
    { status: "cancelled" },
  ]);
  assert.deepEqual(p.stages, [1, 2, 2, 1, 1]);
  assert.equal(p.total, 7);
  assert.equal(p.verified, 1);
  assert.equal(p.percent, 14);
  assert.equal(publicProgress([]).percent, null);
});
test("participant next action prioritizes recovery, then revision and posting before offers", () => {
  const tasks = [
    { id: "deliver", status: "delivered" },
    { id: "revision", status: "delivered", revisionNotes: "수정" },
    { id: "recovery", status: "verified", retentionStatus: "needs_recovery" },
  ];
  assert.equal(participantNext(tasks, 2).taskId, "recovery");
  assert.equal(participantNext(tasks.slice(0, 2), 2).taskId, "revision");
  assert.equal(participantNext(tasks.slice(0, 1), 2).taskId, "deliver");
  assert.equal(participantNext([], 2).tab, "offers");
});
test("participant progress never treats a submitted link as verified or paid", () => {
  assert.deepEqual(participantSteps({ status: "delivered" }), [
    true,
    false,
    false,
    false,
  ]);
  assert.deepEqual(participantSteps({ status: "submitted" }), [
    true,
    true,
    false,
    false,
  ]);
  assert.deepEqual(participantSteps({ status: "verified" }), [
    true,
    true,
    true,
    false,
  ]);
  assert.deepEqual(
    participantSteps({ status: "verified", payoutStatus: "paid" }),
    [true, true, true, true],
  );
  assert.deepEqual(participantSteps({ status: "approved" }), [
    false,
    false,
    false,
    false,
  ]);
});
test("recovery filter includes resubmitted recoveries while all retains historical cancelled records", () => {
  assert.equal(
    portalTaskMatches(
      { status: "verified", retentionStatus: "recovery_submitted" },
      "recovery",
    ),
    true,
  );
  assert.equal(portalTaskMatches({ status: "verified" }, "recovery"), false);
  assert.equal(portalTaskMatches({ status: "submitted" }, "verified"), false);
  assert.equal(portalTaskMatches({ status: "cancelled" }, "all"), true);
});
