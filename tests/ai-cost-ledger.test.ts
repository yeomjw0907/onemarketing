import { test } from "node:test";
import assert from "node:assert/strict";
import { anthropicCost } from "../src/lib/anthropic-cost";
import {
  aiCostLedger,
  groupAiCosts,
  koreanDay,
  totalAiCosts,
} from "../src/lib/ai-cost-ledger";
import type { RecordData } from "../src/lib/types";
const row = (id: string, fields: Record<string, unknown>) =>
  ({
    id,
    kind: "costs",
    version: 1,
    createdAt: "2026-09-30T15:00:00Z",
    updatedAt: "2026-09-30T15:00:00Z",
    ...fields,
  }) as RecordData;
test("fal $4.82826 wins over KRW placeholders; retries and Claude search calls remain separate", () => {
  const jobs = [1, 2, 3, 4].map((n) =>
    row("j" + n, { kind: "jobs", type: n === 4 ? "video" : "image" }),
  );
  jobs.push(
    row("research", {
      kind: "jobs",
      type: "research",
      calls: [
        {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          requestId: "r1",
          at: "2026-09-30T14:59:59Z",
          usage: {
            input_tokens: 1000,
            output_tokens: 100,
            output_tokens_details: { thinking_tokens: 50 },
            server_tool_use: { web_search_requests: 4 },
          },
        },
      ],
    }),
  );
  const costs = jobs.slice(0, 4).map((j, i) =>
    row("c" + i, {
      jobId: j.id,
      projectId: "p",
      category: "ai",
      currency: "KRW",
      amount: i === 3 ? 7000 : 500,
      confirmed: false,
      providerBilling: {
        currency: "USD",
        amount: i === 3 ? 4.64166 : 0.0622,
        requestId: j.id,
        billedAt: "2026-09-30T15:00:00Z",
      },
    }),
  );
  costs.push(
    row("rc", {
      jobId: "research",
      projectId: "p",
      category: "ai",
      amount: 3000,
      confirmed: false,
    }),
  );
  const rows = aiCostLedger({ costs, jobs });
  const total = totalAiCosts(rows);
  assert.equal(total.actualUsd, 4.82826);
  assert.equal(total.estimatedUsd, 0.043);
  assert.equal(total.pendingKrw, 0);
  assert.equal(total.pendingCount, 0);
  assert.equal(
    groupAiCosts(rows, "type").find((r) => r.key === "image")!.actualUsd,
    0.1866,
  );
  assert.equal(
    groupAiCosts(rows, "day").find((r) => r.key === "2026-09-30")!.estimatedUsd,
    0.043,
  );
  assert.equal(
    groupAiCosts(rows, "month").find((r) => r.key === "2026-10")!.actualUsd,
    4.82826,
  );
  assert.equal(groupAiCosts(rows, "projectId")[0].actualUsd, 4.82826);
  // Repeated cost records must not count the same invoice/request a second time.
  assert.deepEqual(
    totalAiCosts(aiCostLedger({ costs: [...costs, ...costs], jobs })),
    total,
  );
});
test("unknown models/usages stay unpriced, zero actual charges are valid, KRW is not added to USD", () => {
  const jobs = [
    row("unknown", {
      kind: "jobs",
      type: "copy",
      calls: [
        {
          provider: "anthropic",
          model: "unpriced-model",
          requestId: "unknown",
          usage: { input_tokens: 100, output_tokens: 10 },
        },
      ],
    }),
  ];
  const costs = [
    row("a", {
      category: "ai",
      jobId: "unknown",
      amount: 500,
      confirmed: false,
    }),
    row("b", {
      category: "ai",
      amount: 1000,
      confirmed: true,
      currency: "KRW",
    }),
    row("c", {
      category: "ai",
      amount: 2000,
      providerBilling: { currency: "USD", amount: 0, requestId: "free" },
    }),
  ];
  const total = totalAiCosts(aiCostLedger({ costs, jobs }));
  assert.equal(total.actualUsd, 0);
  assert.equal(total.actualCount, 1);
  assert.equal(total.estimatedCount, 0);
  assert.equal(total.estimatedUsd, 0);
  assert.equal(total.pendingCount, 1);
  assert.equal(total.pendingKrw, 500);
  assert.equal(total.confirmedKrw, 1000);
  assert.equal(
    anthropicCost("unpriced-model", { input_tokens: 1, output_tokens: 1 }),
    null,
  );
  assert.equal(anthropicCost("claude-sonnet-5-5", { output_tokens: 1 }), null);
  assert.equal(koreanDay("2026-09-30T15:00:00Z"), "2026-10-01");
});
test("Claude cache and thinking tokens are charged once and unsupported tiers are not guessed", () => {
  const usage = {
    input_tokens: 1000,
    output_tokens: 1000,
    cache_creation_input_tokens: 2000,
    cache_creation: {
      ephemeral_5m_input_tokens: 1000,
      ephemeral_1h_input_tokens: 1000,
    },
    cache_read_input_tokens: 1000,
    output_tokens_details: { thinking_tokens: 500 },
  };
  assert.equal(anthropicCost("claude-sonnet-5-5", usage)!.amount, 0.0186);
  assert.equal(
    anthropicCost("claude-sonnet-5-5", { ...usage, service_tier: "priority" }),
    null,
  );
});
