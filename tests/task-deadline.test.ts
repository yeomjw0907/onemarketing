import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskDeadline,
  taskOverdue,
  taskNeedsReminder,
} from "../src/lib/task-deadline";
const now = Date.parse("2026-10-16T12:00:00Z");
test("revision uses its own deadline even when original submission date passed", () => {
  const t = {
    status: "delivered",
    submissionDue: "2026-10-15T12:00:00Z",
    revisionNotes: "수정",
    revisionDue: "2026-10-18T12:00:00Z",
  };
  assert.equal(taskDeadline(t), t.revisionDue);
  assert.equal(taskOverdue(t, now), false);
  assert.equal(taskNeedsReminder(t, now), false);
  assert.equal(
    taskOverdue({ ...t, revisionDue: "2026-10-16T11:00:00Z" }, now),
    true,
  );
  assert.equal(
    taskNeedsReminder({ ...t, revisionDue: "2026-10-16T11:00:00Z" }, now),
    true,
  );
});
test("submitted and verified corrections are not overdue or reminded", () => {
  for (const status of ["submitted", "verified"]) {
    const t = {
      status,
      revisionNotes: "수정",
      revisionDue: "2026-10-15T12:00:00Z",
      submissionDue: "2026-10-14T12:00:00Z",
    };
    assert.equal(taskOverdue(t, now), false);
    assert.equal(taskNeedsReminder(t, now), false);
  }
});
test("missing and invalid dates are ignored; regular submission date still applies", () => {
  assert.equal(
    taskDeadline({ status: "delivered", submissionDue: "invalid" }),
    null,
  );
  assert.equal(taskOverdue({ status: "delivered" }, now), false);
  const t = { status: "delivered", submissionDue: "2026-10-16T11:00:00Z" };
  assert.equal(taskOverdue(t, now), true);
  assert.equal(taskNeedsReminder(t, now), true);
});
