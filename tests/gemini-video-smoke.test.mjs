import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  youtubeUrl,
  validateResult,
  runSmoke,
} from "../scripts/gemini-video-smoke.mjs";

const url = "https://www.youtube.com/shorts/5FHQBMCmJtM";
const analysis = () => ({
  visualAccess: true,
  audioAccess: false,
  summary: "테스트",
  limitations: [],
  hypotheses: [],
  segments: [
    {
      startMs: 0,
      endMs: 1000,
      visual: "제품",
      action: "이동",
      camera: "고정",
      audio: "확인 불가",
      transition: "컷",
      reproduction: "손으로 이동",
    },
  ],
});
test("YouTube 주소를 통합하고 외부 호스트와 인증 정보를 거절한다", () => {
  assert.equal(
    youtubeUrl(url),
    youtubeUrl("https://youtu.be/5FHQBMCmJtM?si=tracking"),
  );
  for (const bad of [
    "https://youtube.com.evil.test/watch?v=5FHQBMCmJtM",
    "https://user:pass@youtube.com/watch?v=5FHQBMCmJtM",
    "http://youtu.be/5FHQBMCmJtM",
  ])
    assert.throws(() => youtubeUrl(bad));
});
test("화면 접근 실패와 겹치거나 범위를 벗어나는 장면을 거절한다", () => {
  assert.throws(() =>
    validateResult({ ...analysis(), visualAccess: false }, 30),
  );
  const data = analysis();
  data.segments[0].endMs = 30001;
  assert.throws(() => validateResult(data, 30));
  data.segments[0].endMs = 1000;
  data.segments.push({ ...data.segments[0], startMs: 500 });
  assert.throws(() => validateResult(data, 30));
});
async function isolated(fn) {
  const outputDir = await mkdtemp(path.join(tmpdir(), "om-gemini-smoke-test-"));
  try {
    await fn({
      url,
      outputDir,
      key: "test-secret-not-real",
      model: "gemini-test",
    });
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}
test("성공 결과를 재사용하고 키를 결과 파일에 저장하지 않는다", () =>
  isolated(async (args) => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(analysis()) }] },
          },
        ],
        usageMetadata: { totalTokenCount: 10 },
      });
    };
    const first = await runSmoke({ ...args, fetchImpl });
    assert.equal(first.record.status, "succeeded");
    assert.equal((await runSmoke({ ...args, fetchImpl })).reused, true);
    assert.equal(calls, 1);
    assert.ok(!(await readFile(first.file, "utf8")).includes(args.key));
  }));
test("통신 불확실 시 자동 재호출하지 않는다", () =>
  isolated(async (args) => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      throw new Error("transport secret test-secret-not-real");
    };
    await assert.rejects(runSmoke({ ...args, fetchImpl }), /uncertain/);
    await assert.rejects(runSmoke({ ...args, fetchImpl }), /자동 재호출/);
    assert.equal(calls, 1);
  }));
test("잘린 출력은 성공 처리하지 않고 응답 사용량을 보존한다", () =>
  isolated(async (args) => {
    const fetchImpl = async () =>
      Response.json({
        candidates: [{ finishReason: "MAX_TOKENS" }],
        usageMetadata: { totalTokenCount: 50 },
      });
    await assert.rejects(runSmoke({ ...args, fetchImpl }), /invalid_result/);
    const { readdir } = await import("node:fs/promises");
    const file = (await readdir(args.outputDir))[0];
    const record = JSON.parse(
      await readFile(path.join(args.outputDir, file), "utf8"),
    );
    assert.equal(record.usage.totalTokenCount, 50);
    assert.equal(record.status, "invalid_result");
  }));
