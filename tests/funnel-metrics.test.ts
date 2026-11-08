import { test } from "node:test";
import assert from "node:assert/strict";
import {
  funnelRange,
  summarizeFunnel,
  type FunnelJourney,
} from "../src/lib/funnel-metrics";
const range = funnelRange(
  "2026-09-01",
  "2026-10-31",
  7,
  new Date("2026-11-02T00:00:00Z"),
);
const summarize = (journeys: FunnelJourney[]) =>
  summarizeFunnel(
    {
      key: "qa",
      title: "QA",
      unit: "건",
      description: "",
      steps: ["접수", "제출", "지급"],
      journeys,
    },
    range,
  );
test("closed cohorts exclude pending, count retries once and keep cancellations in denominator", () => {
  const paid = {
    id: "a",
    times: [
      "2026-10-01T00:00:00Z",
      "2026-10-03T00:00:00Z",
      "2026-10-05T00:00:00Z",
    ],
    status: "paid",
  };
  const r = summarize([
    paid,
    paid,
    {
      id: "cancel",
      times: ["2026-10-01T00:00:00Z", null, null],
      status: "cancelled",
    },
    {
      id: "pending",
      times: ["2026-10-30T00:00:00Z", null, null],
      status: "applied",
    },
  ]);
  assert.deepEqual([r.cohort, r.mature, r.pending], [3, 2, 1]);
  assert.deepEqual(
    r.steps.map((s) => s.reached),
    [2, 1, 1],
  );
  assert.equal(r.steps[1].conversion, 0.5);
  assert.deepEqual(
    r.steps.map((s) => s.observed),
    [3, 1, 1],
  );
  assert.equal(r.steps[1].notReached, 1);
  assert.equal(r.steps[2].conversion, 1);
  assert.equal(r.steps[2].medianDays, 2);
  assert.equal(
    Object.values(r.statuses).reduce((a, b) => a + b, 0),
    r.cohort,
  );
});
test("one observation deadline, ordered stages, unknown timestamps and future events never inflate completion", () => {
  const r = summarize([
    {
      id: "late",
      times: [
        "2026-10-01T00:00:00Z",
        "2026-10-07T00:00:00Z",
        "2026-10-09T00:00:00Z",
      ],
      status: "paid",
    },
    {
      id: "missing",
      times: ["2026-10-01T00:00:00Z", null, "2026-10-03T00:00:00Z"],
      status: "paid",
    },
    {
      id: "reverse",
      times: ["2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z", null],
      status: "submitted",
    },
    {
      id: "outside",
      times: ["2026-08-01T00:00:00Z", null, null],
      status: "new",
    },
  ]);
  assert.deepEqual(
    r.steps.map((s) => s.reached),
    [3, 1, 0],
  );
  assert.equal(r.missingTiming, 2);
  const empty = summarize([]);
  assert.equal(empty.steps[1].conversion, null);
});
test("KST cohort dates, exact observation boundary and invalid date rejection", () => {
  assert.equal(new Date(range.start).toISOString(), "2026-08-31T15:00:00.000Z");
  const r = summarize([
    {
      id: "boundary",
      times: ["2026-10-26T00:00:00Z", "2026-11-02T00:00:00Z", null],
      status: "submitted",
    },
  ]);
  assert.equal(r.mature, 1);
  assert.equal(r.steps[1].reached, 1);
  assert.throws(() => funnelRange("2026-02-30", "2026-03-01", 7));
  assert.throws(() =>
    funnelRange("2026-01-01", "2027-01-02", 7, new Date("2027-02-01")),
  );
  assert.throws(() =>
    funnelRange("2026-11-03", "2026-11-04", 7, new Date("2026-11-02")),
  );
  assert.throws(() => funnelRange("2026-01-01", "2026-01-02", 8));
});
