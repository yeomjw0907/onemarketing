import { test } from "node:test";
import assert from "node:assert/strict";
import { operationQueue, participantQueue } from "../src/lib/campaign-queue";
const campaign = (
  id: string,
  status: string,
  managed: boolean,
  apps: string[],
  refunds: any[] = [],
) => ({
  id,
  data: {
    status,
    input: { title: id, managed, submissionDeadline: "2027-01-20" },
    refunds,
  },
  applications: apps.map((status, i) => ({
    id: id + i,
    data: { status, expiresAt: "2027-01-01" },
  })),
});
test("operations queue prioritizes refunds and excludes actions delegated to a manager", () => {
  const data = {
    orders: [
      { id: "await", data: { status: "awaiting_payment" } },
      { id: "paid", data: { status: "paid" } },
    ],
    campaigns: [
      campaign("self", "recruiting", false, ["applied", "submitted"]),
      campaign("managed", "review", true, ["submitted"]),
      campaign(
        "paused",
        "paused",
        false,
        ["applied"],
        [{ status: "requested" }],
      ),
      campaign("done", "completed", false, ["submitted"]),
    ],
  };
  const user = operationQueue(data, false);
  assert.deepEqual(
    user.map((x) => x.kind),
    ["refund", "payment", "review", "selection"],
  );
  assert.equal(
    user.some((x) => x.campaignId === "managed" || x.campaignId === "done"),
    false,
  );
  const admin = operationQueue(data, true);
  assert.equal(admin.filter((x) => x.kind === "review").length, 2);
  assert.equal(admin.find((x) => x.orderId)?.orderId, "await");
});
test("participant queue keeps revision and acceptance visible, but excludes completed and withdrawn applications", () => {
  const rows = participantQueue([
    campaign("a", "producing", false, [
      "paid",
      "withdrawn",
      "revision",
      "selected",
      "submitted",
    ]),
    campaign("b", "paused", false, ["accepted"]),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, "selected");
  assert.equal(
    rows.find((x) => x.campaignId === "b")?.label,
    "진행 보류 · 안내 확인",
  );
  assert.ok(rows.some((x) => x.label === "수정 후 재제출"));
});
