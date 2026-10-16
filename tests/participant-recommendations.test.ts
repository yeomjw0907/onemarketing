import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendParticipants } from "../src/lib/participant-recommendations";
import { kinds, type DatabaseView, type RecordData } from "../src/lib/types";
const now = Date.parse("2026-10-16T00:00:00Z");
const row = (id: string, fields: object) =>
  ({
    id,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    version: 1,
    ...fields,
  }) as RecordData;
function fixture() {
  const data = Object.fromEntries(
    kinds.map((k) => [k, []]),
  ) as unknown as DatabaseView;
  data.participants = ["a", "b", "new"].map((id) =>
    row(id, {
      kind: "participants",
      status: "active",
      accounts: [{ id, channel: "blog", ownershipVerifiedAt: "2026-01-01" }],
    }),
  );
  data.tasks = [
    row("ta", {
      kind: "tasks",
      participantId: "a",
      status: "verified",
      qualityScore: 5,
      requestedAt: "2026-01-01",
      submittedAt: "2026-01-01T12:00:00Z",
      verifiedAt: "2026-01-10",
      postingDeadlineAt: "2026-01-03",
    }),
    row("tb", {
      kind: "tasks",
      participantId: "b",
      status: "verified",
      qualityScore: 2,
      requestedAt: "2026-10-01",
      submittedAt: "2026-10-05",
      postingDeadlineAt: "2026-10-03",
    }),
  ];
  return data;
}
test("quality, speed and tenure reflect recorded work and ignore review waiting time", () => {
  const data = fixture();
  for (const order of ["balanced", "quality", "speed", "tenure"] as const)
    assert.equal(
      recommendParticipants(data, undefined, order, now)[0].participant.id,
      "a",
    );
  assert.equal(
    recommendParticipants(data, undefined, "balanced", now)[0].hours,
    12,
  );
  const fresh = recommendParticipants(data, undefined, "balanced", now).find(
    (r) => r.participant.id === "new",
  )!;
  assert.equal(fresh.days, 0);
  assert.equal(fresh.hours, null);
});
test("volume includes legacy completions and excludes cancelled work", () => {
  const data = fixture();
  data.tasks.push(
    row("legacy", { kind: "tasks", participantId: "b", status: "verified" }),
  );
  data.tasks.push(
    row("cancel", { kind: "tasks", participantId: "a", status: "cancelled" }),
  );
  assert.equal(
    recommendParticipants(data, undefined, "volume", now)[0].participant.id,
    "b",
  );
});
test("eligibility checks ownership, channels, pending offers and campaign assignments", () => {
  const data = fixture();
  const slot = row("slot", {
    kind: "work_slots",
    projectId: "p",
    type: "blog",
  });
  data.projects.push(row("p", { kind: "projects", workflowPolicy: {} }));
  data.work_offers.push(
    row("offer", {
      kind: "work_offers",
      projectId: "p",
      participantId: "a",
      status: "proposed",
      expiresAt: "2026-10-17",
      accountKeys: ["blog:a"],
    }),
  );
  data.tasks.push(
    row("assigned", {
      kind: "tasks",
      projectId: "p",
      participantId: "b",
      participantAccountId: "b",
      channel: "blog",
      status: "planned",
    }),
  );
  assert.deepEqual(
    recommendParticipants(data, slot, "balanced", now).map(
      (r) => r.participant.id,
    ),
    ["new"],
  );
  assert.equal(
    recommendParticipants(data, { ...slot, type: "bundle" }, "balanced", now)
      .length,
    1,
  );
  data.participants[2].accounts = [
    { id: "new", channel: "clip", approvalStatus: "pending" },
  ];
  assert.equal(recommendParticipants(data, slot, "balanced", now).length, 0);
});
test("overdue incomplete work reduces recommendation and expired offers release eligibility", () => {
  const data = fixture();
  const before = recommendParticipants(data, undefined, "balanced", now).find(
    (r) => r.participant.id === "a",
  )!.score;
  data.tasks.push(
    row("late", {
      kind: "tasks",
      participantId: "a",
      status: "planned",
      postingDeadlineAt: "2026-10-10",
    }),
  );
  const after = recommendParticipants(data, undefined, "balanced", now).find(
    (r) => r.participant.id === "a",
  )!;
  assert.ok(after.score < before);
  assert.equal(after.overdue, 1);
});
