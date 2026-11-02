import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  researchFalGroup,
  runFalCampaign,
} from "../scripts/clip-lab/fal-research.mjs";
import { loudnessStats } from "../scripts/clip-lab/master-audio.mjs";
import {
  researchForLab,
  researchAccounting,
} from "../scripts/clip-lab/knowledge.mjs";
async function isolated(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "fal-research-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const observation = {
  visualAccess: true,
  summary: "제품을 가까이 보여줍니다.",
  hook: "제품 근접",
  shots: [
    {
      startMs: 0,
      endMs: 3000,
      subject: "제품",
      action: "고정",
      camera: "미세 접근",
      startState: "중앙",
      endState: "확대",
      continuityConstraint: "광원 유지",
      transition: "하드 컷",
    },
  ],
  editRule: {
    instruction: "제품을 고정하고 접근",
    appliesWhen: "정물",
    avoidWhen: "뒷면이 드러날 때",
    evidenceShot: 0,
  },
  limitations: "공급사 기본 샘플링. 정밀 컷과 음성 미검증.",
};
const refs = Array.from({ length: 10 }, (_, i) => ({
  url: "https://www.youtube.com/watch?v=aaaaaaa" + String(i).padStart(4, "0"),
  title: "제품 테스트 " + i,
  category: "음식",
}));
test("fal observation keeps source identities and distinguishes provider-default sampling and reported charges", () =>
  isolated(async (root) => {
    let submits = 0,
      ids;
    const fetchImpl = async (url, init) => {
      if (init?.method === "POST") {
        submits++;
        const input = JSON.parse(init.body);
        assert.equal(input.reasoning, true);
        assert.equal(input.enable_web_search, false);
        ids = [...input.prompt.matchAll(/sourceId=([a-f0-9]{64})/g)].map(
          (m) => m[1],
        );
        return Response.json({
          request_id: "r",
          status_url: "https://queue.fal.run/test/requests/r/status",
          response_url: "https://queue.fal.run/test/requests/r",
        });
      }
      if (String(url).endsWith("/status"))
        return Response.json({ status: "COMPLETED" });
      return Response.json({
        output: JSON.stringify({
          observations: ids.map((sourceId) => ({
            sourceId,
            analysis: observation,
          })),
        }),
        usage: { cost: 0.01, prompt_tokens: 10000, completion_tokens: 1000 },
      });
    };
    const options = {
      references: refs.slice(0, 2),
      key: "secret-test-key",
      root,
      fetchImpl,
      pollMs: 0,
    };
    const records = await researchFalGroup(options);
    assert.ok(
      records.every((r) => r.status === "succeeded" && r.samplingFps === null),
    );
    assert.equal(records[0].providerReportedUsdShare, 0.005);
    assert.ok(
      researchForLab(records[0])
        .analysis.limitations.at(-1)
        .includes("공급사 기본값"),
    );
    await researchFalGroup(options);
    assert.equal(submits, 1);
    const a = await researchAccounting(root, records);
    assert.equal(a.providerRequests, 1);
    assert.equal(a.providerReportedUsd, 0.01);
    assert.ok(
      !(
        await readFile(
          path.join(root, "research", records[0].id + ".json"),
          "utf8",
        )
      ).includes(options.key),
    );
  }));
test("fal campaign stops after three terminal errors instead of exhausting the reference pool", () =>
  isolated(async (root) => {
    let submits = 0;
    const fetchImpl = async (url, init) => {
      if (init?.method === "POST") {
        submits++;
        return Response.json({
          request_id: "r" + submits,
          status_url:
            "https://queue.fal.run/test/requests/r" + submits + "/status",
          response_url: "https://queue.fal.run/test/requests/r" + submits,
        });
      }
      if (String(url).endsWith("/status"))
        return Response.json({ status: "COMPLETED" });
      return Response.json(
        { detail: "unsupported configuration" },
        { status: 400 },
      );
    };
    const result = await runFalCampaign({
      manifest: { references: refs },
      key: "test",
      root,
      target: 1,
      concurrency: 1,
      fetchImpl,
      pollMs: 0,
    });
    assert.equal(result.success, 0);
    assert.equal(submits, 3);
    const status = JSON.parse(
      await readFile(path.join(root, "campaign-status.json"), "utf8"),
    );
    assert.equal(status.stoppedAfterRepeatedFailure, true);
    assert.equal(status.complete, false);
  }));
test("audio measurement rejects silent or malformed input", () => {
  const good = {
    input_i: "-23",
    input_tp: "-3",
    input_lra: "6",
    input_thresh: "-33",
    target_offset: "1",
  };
  assert.equal(loudnessStats(JSON.stringify(good)).input_i, "-23");
  assert.throws(() =>
    loudnessStats(JSON.stringify({ ...good, input_i: "-inf" })),
  );
  assert.throws(() => loudnessStats("no audio"));
});
