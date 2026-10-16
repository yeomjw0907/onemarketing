import { test } from "node:test";
import assert from "node:assert/strict";
import { portalPaymentHistory } from "../src/lib/portal-payment-history";
import type { DatabaseView, RecordData } from "../src/lib/types";
const row = (values: Record<string, unknown>) =>
  ({
    id: "row",
    kind: "tasks",
    version: 1,
    createdAt: "2026-10-16",
    updatedAt: "2026-10-16",
    participantId: "p",
    ...values,
  }) as RecordData;
const data = () =>
  ({
    participant_settlements: [],
    work_slots: [],
    posting_sets: [],
    tasks: [],
    participant_history: [],
  }) as Pick<
    DatabaseView,
    | "participant_settlements"
    | "work_slots"
    | "posting_sets"
    | "tasks"
    | "participant_history"
  >;
test("direct slot payments appear once, separate from linked posting sets and tasks", () => {
  const d = data();
  d.work_slots = [
    row({
      id: "slot",
      payoutStatus: "paid",
      amount: 7000,
      paidAt: "2026-10-16",
    }),
  ];
  d.posting_sets = [
    row({
      id: "set",
      workSlotId: "slot",
      payoutStatus: "paid",
      amount: 7000,
      paidAt: "2026-10-16",
    }),
  ];
  d.tasks = [
    row({
      id: "blog",
      workSlotId: "slot",
      postingSetId: "set",
      payoutStatus: "paid",
      payout: 7000,
      paidAt: "2026-10-16",
    }),
  ];
  assert.equal(portalPaymentHistory(d, "p").length, 1);
  assert.equal(portalPaymentHistory(d, "p")[0].total, 7000);
  assert.equal(portalPaymentHistory(d, "other").length, 0);
});
test("partial 3000 and remaining aggregate 4000 are both shown without double counting", () => {
  const d = data();
  d.work_slots = [
    row({
      id: "slot",
      payoutStatus: "paid",
      amount: 7000,
      partialPaidAmount: 3000,
      settlementId: "s",
      paidAt: "2026-10-17",
    }),
  ];
  d.tasks = [
    row({
      id: "blog",
      workSlotId: "slot",
      payoutStatus: "paid",
      partialPaidAmount: 3000,
      settlementId: "s",
      paidAt: "2026-10-16",
    }),
  ];
  d.participant_settlements = [
    row({ id: "s", total: 4000, status: "paid", paidAt: "2026-10-17" }),
  ];
  assert.equal(
    portalPaymentHistory(d, "p").reduce((n, r) => n + Number(r.total), 0),
    7000,
  );
  d.work_slots[0].settlementId = null;
  d.participant_settlements = [];
  assert.equal(
    portalPaymentHistory(d, "p").reduce((n, r) => n + Number(r.total), 0),
    7000,
  );
});
test("cancelled direct payments disappear and aggregate settlements are not repeated", () => {
  const d = data();
  d.work_slots = [
    row({ id: "slot", payoutStatus: "pending", amount: 3000, paidAt: null }),
  ];
  assert.deepEqual(portalPaymentHistory(d, "p"), []);
  d.work_slots[0] = {
    ...d.work_slots[0],
    payoutStatus: "paid",
    paidAt: "2026-10-16",
    settlementId: "s",
  };
  d.participant_settlements = [
    row({ id: "s", total: 3000, status: "paid", paidAt: "2026-10-16" }),
  ];
  assert.equal(portalPaymentHistory(d, "p").length, 1);
});
