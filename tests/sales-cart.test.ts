import { test } from "node:test";
import assert from "node:assert/strict";
import { cartQuote, salesCartSchema } from "../src/lib/sales-cart";
import {
  elapsedLabel,
  participantPerformance,
} from "../src/lib/participant-performance";
import type { RecordData } from "../src/lib/types";
const price = (id: string, channel: string) =>
  ({
    id,
    channel,
    sale: 10000,
    payout: 5000,
    aiEstimate: 1000,
    images: channel === "blog" ? 3 : 0,
    duration: channel === "clip" ? 10 : 0,
    mode: channel === "clip" ? "generated" : "slideshow",
  }) as unknown as RecordData;
test("cart examples produce exact blog/clip quantities and the 3000/3000/7000 reward policy", () => {
  const prices = [price("blog", "blog"), price("clip", "clip")];
  const mixed = cartQuote(
    prices,
    [
      { type: "bundle", quantity: 3, blogPriceId: "blog", clipPriceId: "clip" },
      { type: "clip", quantity: 2, clipPriceId: "clip" },
    ],
    0,
  );
  assert.equal(mixed.total, 80000);
  assert.equal(mixed.cost, 35000); // 27000 rewards + 8000 AI
  assert.equal(
    mixed.snapshots
      .filter((r) => r.channel === "blog")
      .reduce((n, r) => n + Number(r.quantity), 0),
    3,
  );
  assert.equal(
    mixed.snapshots
      .filter((r) => r.channel === "clip")
      .reduce((n, r) => n + Number(r.quantity), 0),
    5,
  );
  const both = cartQuote(
    prices,
    [{ type: "bundle", quantity: 5, blogPriceId: "blog", clipPriceId: "clip" }],
    0,
  );
  assert.equal(both.cost, 45000);
  assert.equal(
    both.snapshots.reduce(
      (n, r) => n + Number(r.payout) * Number(r.quantity),
      0,
    ),
    35000,
  );
  assert.throws(() =>
    cartQuote(prices, [{ type: "blog", quantity: 1, blogPriceId: "clip" }], 0),
  );
  assert.throws(() =>
    salesCartSchema.parse([
      { type: "blog", quantity: 1 },
      { type: "blog", quantity: 1 },
    ]),
  );
  assert.throws(() => salesCartSchema.parse([{ type: "clip", quantity: -1 }]));
});
test("worker response, operator review lag, deadlines and quality use only observed timestamps", () => {
  const row = (id: string, data: Record<string, unknown>) =>
    ({
      id,
      participantId: "p",
      status: "verified",
      ...data,
    }) as unknown as RecordData;
  const rows = [
    row("a", {
      requestedAt: "2026-10-15T00:00:00Z",
      submittedAt: "2026-10-15T01:00:00Z",
      verifiedAt: "2026-10-15T03:00:00Z",
      postingDeadlineAt: "2026-10-15T02:00:00Z",
      qualityScore: 5,
      postingRevisionCount: 1,
    }),
    row("legacy", {}),
    row("cancelled", { status: "cancelled", qualityScore: 1 }),
    row("pending", {
      status: "delivered",
      requestedAt: "2026-10-15T00:00:00Z",
      postingDeadlineAt: "2026-10-15T02:00:00Z",
    }),
  ];
  const p = participantPerformance(
    rows,
    "p",
    Date.parse("2026-10-15T04:00:00Z"),
  );
  assert.equal(p.averageResponseMs, 3600000);
  assert.equal(p.averageReviewMs, 7200000);
  assert.equal(p.averageCompletionMs, 10800000);
  assert.equal(p.averageQuality, 5);
  assert.equal(p.qualityCount, 1);
  assert.equal(p.deadlineCount, 1);
  assert.equal(p.onTime, 1);
  assert.equal(p.overdue, 1);
  assert.equal(p.revisionCount, 1);
  assert.equal(elapsedLabel(p.averageResponseMs), "1시간 0분");
  assert.equal(participantPerformance([], "p").averageQuality, null);
});
