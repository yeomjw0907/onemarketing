import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { create, get, update } from "../src/lib/db";
import { saveAsset, bytes } from "../src/lib/assets";
import { command } from "../src/lib/domain";
import { enqueue } from "../src/lib/jobs";
import {
  runCopyQuality,
  disclosureText,
  type CopyQualityReport,
} from "../src/lib/copy-quality";
const actor = "copy-quality@test.local";

async function fixture() {
  const p = await create("projects", {
    name: "교정 검증",
    status: "review",
    budget: 10000,
    knowledge: {
      customer: { name: "브랜드" },
      product: { facts: "국내 제조" },
    },
  });
  const t = await create("tasks", {
    name: "블로그",
    projectId: p.id,
    channel: "blog",
    status: "review",
    images: 0,
    brief: "국내 제조 제품 소개",
    briefApprovedAt: new Date().toISOString(),
  });
  return { p, t };
}
async function report() {
  return runCopyQuality(
    { channel: "blog", images: 0, brand: "브랜드", context: "국내 제조" },
    {},
    async (stage) =>
      stage === "verify"
        ? JSON.stringify({ issues: [] })
        : JSON.stringify({
            title: "제품 소개",
            body: "국내에서 제조한 제품입니다.",
            changes: [],
          }),
    async () => {},
  );
}
async function approve(id: string) {
  const task = (await get(id))!;
  return command(
    "approve-task",
    { id, version: task.version },
    actor,
    crypto.randomUUID(),
  );
}

test("manual copy gets an upfront disclosure in stored bytes; verified copy approval invalidates on subsequent edits", async () => {
  const { p, t } = await fixture();
  const manual = await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "원고.txt",
      text: "기존 원고입니다.",
      buffer: Buffer.from("기존 원고입니다."),
    },
    actor,
  );
  assert.ok(String(manual.text).startsWith(disclosureText("브랜드")));
  assert.equal((await bytes(manual)).toString(), manual.text);
  const result = await report();
  const verified = await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "원고.txt",
      text: result.text,
      buffer: Buffer.from(result.text),
      copyQuality: result.report,
    },
    actor,
  );
  await approve(t.id);
  await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "수정.txt",
      text: "국내에서 제조한 제품을 소개해요.",
      buffer: Buffer.from("국내에서 제조한 제품을 소개해요."),
    },
    actor,
  );
  await assert.rejects(approve(t.id), /보류/);
  assert.equal((await get(verified.id))!.current, false);
});

test("changed product facts invalidate a passed verification and blocked reports cannot be approved", async () => {
  const { p, t } = await fixture();
  const result = await report();
  const asset = await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "원고.txt",
      text: result.text,
      buffer: Buffer.from(result.text),
      copyQuality: result.report,
    },
    actor,
  );
  await update(p.id, { instructions: "원재료 확인 전 원산지 표현 금지" });
  await assert.rejects(approve(t.id), /변경/);
  const blocked: CopyQualityReport = {
    ...result.report,
    status: "blocked",
    issues: [
      {
        severity: "blocker",
        category: "fact",
        quote: "",
        reason: "원자료 부족",
        evidence: "제품 자료",
        suggestedFix: "자료 확인",
      },
    ],
  };
  await saveAsset(
    {
      projectId: p.id,
      taskId: t.id,
      category: "copy",
      name: "보류.txt",
      text: result.text,
      buffer: Buffer.from(result.text),
      copyQuality: blocked,
    },
    actor,
  );
  await assert.rejects(approve(t.id), /보류/);
  process.env.ANTHROPIC_API_KEY = "test-not-real";
  await assert.rejects(
    enqueue(
      {
        projectId: p.id,
        taskId: t.id,
        type: "copy",
        copySourceAssetId: asset.id,
        estimate: 100,
        key: crypto.randomUUID(),
      },
      actor,
    ),
    /최신 원고/,
  );
});
