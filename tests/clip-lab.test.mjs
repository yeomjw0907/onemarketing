import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  analyzeOne,
  validateAnalysis,
  estimateCost,
  runBatch,
  listRuns,
  atomicJson,
} from "../scripts/clip-lab/core.mjs";
import { startLab } from "../scripts/clip-lab/server.mjs";
import { enrichMetadata } from "../scripts/clip-lab/metadata.mjs";
import { exportLab } from "../scripts/clip-lab/export.mjs";
const reference = {
  url: "https://www.youtube.com/shorts/5FHQBMCmJtM",
  title: "테스트 영상",
  category: "음식",
};
const result = () => ({
  visualAccess: true,
  audioAccess: false,
  language: "ko",
  summary: "제품을 보여줍니다.",
  hook: "근접 촬영",
  limitations: ["시점은 근사값입니다."],
  segments: [
    {
      startMs: 0,
      endMs: 1000,
      role: "소개",
      visual: "제품",
      action: "손으로 이동",
      camera: "고정",
      audio: "확인 불가",
      caption: "없음",
      transition: "없음",
      continuity: "첫 장면",
      reproduction: "공통 기준 이미지 사용",
    },
  ],
  hypotheses: [
    {
      statement: "동작을 이어갑니다.",
      evidenceSegmentIndexes: [0],
      experiment: "같은 대본으로 비교",
      failureRisk: "제품 변형",
    },
  ],
});
const ok = async () =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(result()) }] },
      },
    ],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 100,
      thoughtsTokenCount: 10,
    },
  });
test("503만 명시적으로 한 번 재시도하고 첫 요청 이력을 보존한다", () =>
  isolated(async (root) => {
    let calls = 0;
    const args = {
      reference,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      root,
      fetchImpl: async () => {
        calls++;
        return calls === 1
          ? Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 })
          : ok();
      },
    };
    const first = await analyzeOne(args);
    assert.equal(first.status, "rejected");
    assert.equal((await analyzeOne(args)).reused, true);
    assert.equal(calls, 1);
    const second = await analyzeOne({ ...args, retryRejected: true });
    assert.equal(second.status, "succeeded");
    assert.equal(second.attemptNumber, 2);
    assert.equal(second.priorAttempts[0].httpStatus, 503);
    await analyzeOne({ ...args, retryRejected: true });
    assert.equal(calls, 2);
  }));
test("403과 응답 불확실 상태는 재시도를 요청해도 다시 보내지 않는다", () =>
  isolated(async (root) => {
    let calls = 0;
    const args = {
      reference,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      root,
      fetchImpl: async () => {
        calls++;
        return Response.json(
          { error: { status: "PERMISSION_DENIED" } },
          { status: 403 },
        );
      },
    };
    await analyzeOne(args);
    await analyzeOne({ ...args, retryRejected: true });
    assert.equal(calls, 1);
  }));
test("원본 메타데이터와 수집 제목을 구분하고 HTML 보고서에서 스크립트 삽입을 차단한다", () =>
  isolated(async (root) => {
    await analyzeOne({
      reference,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      root,
      fetchImpl: ok,
    });
    const manifest = await enrichMetadata({
      root,
      manifest: { references: [reference] },
      fetchImpl: async () =>
        Response.json({
          title: "원본 제목 </script><script>evil()</script>",
          author_name: "원작자",
        }),
    });
    assert.equal(manifest.references[0].title, reference.title);
    assert.ok(manifest.references[0].metadata.title.startsWith("원본 제목"));
    const output = path.join(root, "report.html");
    await exportLab(root, output);
    const html = await readFile(output, "utf8");
    assert.ok(html.includes('id="snapshot"'));
    assert.ok(!html.includes("</script><script>evil()"));
    assert.ok(!html.includes("await fetch("));
  }));
async function isolated(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "clip-lab-test-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("장면 범위·중첩·가설 참조를 검사한다", () => {
  const a = result();
  a.segments[0].endMs = 30001;
  assert.throws(() => validateAnalysis(a, 30));
  const b = result();
  b.segments.push({ ...b.segments[0], startMs: 500 });
  assert.throws(() => validateAnalysis(b, 30));
  const c = result();
  c.hypotheses[0].evidenceSegmentIndexes = [1];
  assert.throws(() => validateAnalysis(c, 30));
  assert.equal(validateAnalysis(result(), 30).audioAccess, false);
});
test("오디오 입력과 thinking 출력 단가를 포함하고 모르는 모델은 미확인으로 둔다", () => {
  const cost = estimateCost("gemini-3.1-flash-lite", {
    promptTokenCount: 1000,
    candidatesTokenCount: 100,
    thoughtsTokenCount: 20,
    promptTokensDetails: [{ modality: "AUDIO", tokenCount: 200 }],
  });
  assert.equal(cost.amount, (800 * 0.25 + 200 * 0.5 + 120 * 1.5) / 1e6);
  assert.equal(estimateCost("unknown", {}), null);
  assert.equal(
    estimateCost("gemini-3.1-flash-lite", {
      promptTokenCount: 1000,
      candidatesTokenCount: 100,
      cachedContentTokenCount: 50,
    }),
    null,
  );
});
test("동시 요청도 한 번만 전송하고 파일에 키를 남기지 않는다", () =>
  isolated(async (root) => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return ok();
    };
    const args = {
      reference,
      key: "test-secret-value",
      model: "gemini-3.1-flash-lite",
      root,
      fetchImpl,
    };
    await Promise.all([analyzeOne(args), analyzeOne(args)]);
    assert.equal(calls, 1);
    const rows = await listRuns(root);
    assert.equal(rows[0].status, "succeeded");
    assert.ok(!JSON.stringify(rows).includes(args.key));
    await analyzeOne(args);
    assert.equal(calls, 1);
  }));
test("응답 전 연결 실패는 uncertain으로 보존하고 재실행하지 않는다", () =>
  isolated(async (root) => {
    let calls = 0;
    const args = {
      reference,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      root,
      fetchImpl: async () => {
        calls++;
        throw new Error("private error");
      },
    };
    assert.equal((await analyzeOne(args)).status, "uncertain");
    assert.equal((await analyzeOne(args)).reused, true);
    assert.equal(calls, 1);
  }));
test("공급사 거절과 출력 잘림을 성공으로 처리하지 않는다", () =>
  isolated(async (root) => {
    const args = {
      reference,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      root,
    };
    const rejected = await analyzeOne({
      ...args,
      fetchImpl: async () =>
        Response.json(
          { error: { status: "UNAVAILABLE", message: "secret" } },
          { status: 503 },
        ),
    });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.errorCode, "UNAVAILABLE");
    assert.ok(!JSON.stringify(rejected).includes("secret"));
    const invalid = await analyzeOne({
      ...args,
      reference: { ...reference, url: "https://youtu.be/6ZvIs9nFDDc" },
      fetchImpl: async () =>
        Response.json({
          candidates: [{ finishReason: "MAX_TOKENS" }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
        }),
    });
    assert.equal(invalid.status, "invalid_result");
    assert.ok(invalid.estimatedCost);
  }));
test("배치 한도와 중복 주소를 공급사 호출 전에 거절한다", () =>
  isolated(async (root) => {
    const args = {
      root,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      fetchImpl: async () => {
        throw new Error("must not call");
      },
    };
    await assert.rejects(
      runBatch({ ...args, references: Array(31).fill(reference) }),
    );
    await assert.rejects(
      runBatch({
        ...args,
        references: [
          reference,
          { ...reference, url: "https://youtu.be/5FHQBMCmJtM" },
        ],
      }),
    );
  }));
test("로컬 API는 외부 Origin을 차단하고 검토 버전 충돌을 보존한다", () =>
  isolated(async (root) => {
    await atomicJson(path.join(root, "manifest.json"), {
      references: [reference],
    });
    const row = await analyzeOne({
      root,
      reference,
      key: "not-real",
      model: "gemini-3.1-flash-lite",
      fetchImpl: ok,
    });
    const { server, url } = await startLab({ root, port: 0 });
    try {
      const wrong = await fetch(url + "/api/review", {
        method: "POST",
        headers: {
          origin: "https://evil.test",
          "content-type": "application/json",
        },
        body: "{}",
      });
      assert.equal(wrong.status, 403);
      const post = (body) =>
        fetch(url + "/api/review", {
          method: "POST",
          headers: { origin: url, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      assert.equal(
        (
          await post({
            id: row.id,
            version: 0,
            status: "source-checked",
            note: "0~1초 원본 대조",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post({
            id: row.id,
            version: 0,
            status: "rejected",
            note: "오래된 검토",
          })
        ).status,
        409,
      );
      const saved = (await listRuns(root))[0];
      assert.equal(saved.reviewStatus, "source-checked");
      const s = await (await fetch(url + "/api/state")).json();
      assert.equal(s.canAnalyze, false);
      assert.equal(s.summary.succeeded, 1);
    } finally {
      await new Promise((r) => server.close(r));
    }
  }));
