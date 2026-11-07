// Regression: ISSUE-005 — verified unpaid rewards disappeared from the admin queue.
// Found by /qa on 2026-11-08
// Report: docs/service-lifecycle-qa-2026-11-08.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { operationQueue } from "../src/lib/campaign-queue";
test("admin sees outstanding rewards on active, paused and completed campaigns until paid", () => {
  const campaigns = ["producing", "paused", "completed", "cancelled"].map(
    (status, i) => ({
      id: "campaign-" + i,
      data: {
        status,
        input: {
          title: status,
          managed: true,
          submissionDeadline: "2027-11-01",
        },
        refunds: [],
      },
      applications: ["verified", "paid", "submitted"].map((status) => ({
        data: { status },
      })),
    }),
  );
  const admin = operationQueue({ campaigns }, true).filter(
    (r) => r.kind === "payout",
  );
  assert.equal(admin.length, 4);
  assert.ok(admin.every((r) => r.count === 1));
  assert.equal(
    operationQueue({ campaigns }, false).filter((r) => r.kind === "payout")
      .length,
    0,
  );
  campaigns[0].applications[0].data.status = "paid";
  assert.equal(
    operationQueue({ campaigns }, true).filter((r) => r.kind === "payout")
      .length,
    3,
  );
});
