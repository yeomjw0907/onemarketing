import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runCopyQuality,
  withDisclosure,
  disclosureText,
  copyRuleIssues,
  requireCopyApproval,
  type CopyCheckpoint,
  type CopyQualityInput,
} from "../src/lib/copy-quality";
import type { RecordData } from "../src/lib/types";

const base: CopyQualityInput = {
  channel: "blog",
  images: 1,
  brand: "원케이션",
  context: JSON.stringify({
    product: { name: "제품", facts: "국내 제조, 개별 포장" },
  }),
};
const blog = (body = "국내에서 제조한 개별 포장 제품입니다.\n[이미지 1]") =>
  JSON.stringify({ title: "제품 소개", body, editorialNotes: "", changes: [] });
const clip = (description = "개별 포장 제품을 소개합니다.") =>
  JSON.stringify({
    description,
    productionNotes: "영상 내 광고 표시 별도 확인",
    changes: [],
  });
const issue = {
  severity: "blocker",
  category: "fact",
  quote: "국산 원료",
  reason: "제조 장소를 원산지로 확대함",
  evidence: "product.facts는 국내 제조만 명시",
  suggestedFix: "국내 제조로 수정",
};
const clear = JSON.stringify({ issues: [] });

test("a model-supplied upfront blog disclosure is not duplicated when title and body are assembled", async () => {
  const result = await runCopyQuality(
    base,
    {},
    async (stage) =>
      stage === "verify"
        ? clear
        : blog(
            disclosureText(base.brand) + "\n\n확인된 제품입니다.\n[이미지 1]",
          ),
    async () => {},
  );
  assert.equal(result.text.split(disclosureText(base.brand)).length, 2);
  assert.ok(
    result.text.startsWith(disclosureText(base.brand) + "\n\n제품 소개"),
  );
});

test("blog and clip use separate draft/edit/verification calls, preserve previous text and checkpoints", async () => {
  for (const channel of ["blog", "clip"] as const) {
    const stages: string[] = [],
      saved: CopyCheckpoint[] = [];
    const input = {
      ...base,
      channel,
      images: channel === "blog" ? 1 : 0,
      previousText: "이전 등록 원고",
    };
    const result = await runCopyQuality(
      input,
      {},
      async (stage, prompt) => {
        stages.push(stage);
        assert.ok(prompt.includes(input.context.replaceAll('"', '\\"')));
        return stage === "verify"
          ? clear
          : channel === "blog"
            ? blog()
            : clip();
      },
      async (state) => {
        saved.push(state);
      },
    );
    assert.deepEqual(stages, ["draft", "edit", "verify"]);
    assert.equal(saved.length, 3);
    assert.equal(result.report.status, "passed");
    assert.equal(result.report.previousText, "이전 등록 원고");
    assert.ok(result.text.startsWith(disclosureText(base.brand) + "\n"));
    assert.equal(result.text.split(disclosureText(base.brand)).length, 2);
    requireCopyApproval([
      {
        category: "copy",
        text: result.text,
        copyQuality: result.report,
      } as unknown as RecordData,
    ]);
  }
});

test("a fact blocker triggers one repair and separate reverification; unresolved issues block approval", async () => {
  const stages: string[] = [];
  const result = await runCopyQuality(
    base,
    {},
    async (stage) => {
      stages.push(stage);
      return stage === "verify" || stage === "reverify"
        ? JSON.stringify({ issues: [issue] })
        : blog("국산 원료 제품입니다.\n[이미지 1]");
    },
    async () => {},
  );
  assert.deepEqual(stages, ["draft", "edit", "verify", "repair", "reverify"]);
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.repaired, true);
  assert.throws(
    () =>
      requireCopyApproval([
        {
          category: "copy",
          text: result.text,
          copyQuality: result.report,
        } as unknown as RecordData,
      ]),
    /보류/,
  );
});

test("completed calls resume without duplicate provider calls after interruption", async () => {
  let checkpoint: CopyCheckpoint = {};
  await assert.rejects(
    runCopyQuality(
      base,
      {},
      async (stage) => {
        if (stage === "verify") throw new Error("yield");
        return blog();
      },
      async (state) => {
        checkpoint = state;
      },
    ),
    /yield/,
  );
  const stages: string[] = [];
  const result = await runCopyQuality(
    base,
    checkpoint,
    async (stage) => {
      stages.push(stage);
      return clear;
    },
    async () => {},
  );
  assert.deepEqual(stages, ["verify"]);
  assert.equal(result.report.status, "passed");
});

test("existing copy skips generation and verifier malformed responses fail closed", async () => {
  const stages: string[] = [];
  await assert.rejects(
    runCopyQuality(
      { ...base, sourceText: "기존 원고\n[이미지 1]" },
      {},
      async (stage) => {
        stages.push(stage);
        return stage === "edit" ? blog() : JSON.stringify({ status: "passed" });
      },
      async () => {},
    ),
  );
  assert.deepEqual(stages, ["edit", "verify"]);
});

test("deterministic constraints include ad length, hashtags, image ordering and false firsthand experience", async () => {
  const input = { ...base, channel: "clip" as const, images: 0 };
  assert.ok(
    copyRuleIssues(withDisclosure("가".repeat(280), base.brand), input).some(
      (i) => i.category === "format",
    ),
  );
  assert.ok(
    copyRuleIssues(
      withDisclosure("#가 #나 #다 #라 #마 #바", base.brand),
      input,
    ).some((i) => i.category === "format"),
  );
  assert.ok(
    copyRuleIssues(
      withDisclosure("제가 직접 먹어봤어요.\n[이미지 1]", base.brand),
      base,
    ).some((i) => i.category === "experience"),
  );
  assert.ok(
    copyRuleIssues(withDisclosure("[이미지 2]\n[이미지 1]", base.brand), {
      ...base,
      images: 2,
    }).some((i) => i.category === "format"),
  );
  const stages: string[] = [];
  const result = await runCopyQuality(
    input,
    {},
    async (stage) => {
      stages.push(stage);
      if (stage === "verify" || stage === "reverify") return clear;
      return clip(
        stage === "repair" ? "개별 포장 제품을 소개합니다." : "가".repeat(280),
      );
    },
    async () => {},
  );
  assert.equal(result.report.status, "passed");
  assert.ok(result.report.firstIssues.some((i) => i.category === "format"));
  assert.deepEqual(stages, ["draft", "edit", "verify", "repair", "reverify"]);
});

test("tampering invalidates verification and missing upfront disclosure blocks legacy approval", async () => {
  const result = await runCopyQuality(
    base,
    {},
    async (stage) => (stage === "verify" ? clear : blog()),
    async () => {},
  );
  assert.throws(
    () =>
      requireCopyApproval([
        {
          category: "copy",
          text: result.text + "변경",
          copyQuality: result.report,
        } as unknown as RecordData,
      ]),
    /보류/,
  );
  assert.throws(
    () =>
      requireCopyApproval([
        {
          category: "copy",
          text: "광고 표시 없는 원고",
        } as unknown as RecordData,
      ]),
    /광고/,
  );
  assert.equal(withDisclosure(result.text, base.brand), result.text);
});
