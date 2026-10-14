import { test } from "node:test";
import assert from "node:assert/strict";
import { aiCostSummary } from "../src/lib/ai-cost-summary";
import type { RecordData } from "../src/lib/types";

const cost = (
  amount: number,
  createdAt: string,
  projectId = "a",
  confirmed = true,
): RecordData => ({
  id: `${amount}-${createdAt}`,
  kind: "costs",
  version: 1,
  createdAt,
  updatedAt: createdAt,
  category: "ai",
  amount,
  projectId,
  confirmed,
});

test("AI costs use Korean month boundaries, include retries and distinguish provisional charges", () => {
  const rows = [
    cost(100, "2026-09-30T14:59:59Z"),
    cost(200, "2026-09-30T15:00:00Z"),
    cost(300, "2026-10-10T00:00:00Z", "a", false),
    cost(400, "2026-10-31T14:59:59Z", "b"),
    cost(500, "2026-10-31T15:00:00Z", "b"),
    { ...cost(9999, "2026-10-10T00:00:00Z"), category: "other" },
  ];
  const result = aiCostSummary(rows, new Date("2026-10-14T00:00:00Z"));
  assert.equal(result.monthlyTotal, 900);
  assert.equal(result.monthlyProvisional, 300);
  assert.equal(result.total, 1500);
  assert.equal(result.average, 750);
  assert.equal(result.projectCount, 2);
  assert.equal(result.provisionalCount, 1);
});

test("An empty history has no average; zero-cost projects count when explicitly recorded", () => {
  assert.equal(aiCostSummary([]).average, null);
  assert.equal(aiCostSummary([cost(0, "2026-10-01T00:00:00Z")]).average, 0);
});
