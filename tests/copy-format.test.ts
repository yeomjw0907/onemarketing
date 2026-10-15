import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blogCopyOutput,
  publishableCopy,
  orderedImages,
} from "../src/lib/copy-format";
import type { RecordData } from "../src/lib/types";
test("게시용 원고는 제목·본문·이미지 순서만 유지하고 내부 메모는 분리", () => {
  const raw = JSON.stringify({
    title: "피자설기 소개",
    body: "첫 문단\n[이미지 1]\n중간 문단\n[이미지 2]\n마무리\n[이미지 3]",
    editorialNotes: "원재료 확인 필요",
  });
  const output = blogCopyOutput(raw, 3);
  assert.match(output.text, /^피자설기 소개/);
  assert.ok(!output.text.includes("원재료"));
  assert.equal(output.notes, "원재료 확인 필요");
  assert.throws(
    () =>
      blogCopyOutput(JSON.stringify({ title: "제목", body: "[이미지 2]" }), 1),
    /순서/,
  );
});
test("기존 원고의 제작 메모·대안 제목·제작 지시를 빼고 삽입 표시는 정규화", () => {
  const raw =
    "# 내부 원고\n> 제작 메모: 내부용\n## 1. 제목\n**게시 제목**\n- 대안 1: 대안 제목\n## 2. 본문\n### 소제목\n본문입니다.\n**[이미지 1 삽입: 대표 컷]**\n*(배경 한 줄은 확인 필요 표현 ①)*\n## 3. 이미지 제작 지시\n내부 프롬프트";
  const output = publishableCopy(raw);
  assert.ok(output.startsWith("게시 제목"));
  assert.ok(output.includes("[이미지 1]"));
  assert.ok(
    !/제작 메모|대안 제목|내부 프롬프트|확인 필요 표현|\*\*/.test(output),
  );
});
test("이미지 교체 버전에서도 원래 슬롯의 이미지 순서를 유지", () => {
  const row = (id: string, slot: string, createdAt: string, current: boolean) =>
    ({
      id,
      slot,
      taskId: "t",
      category: "image",
      createdAt,
      current,
    }) as unknown as RecordData;
  const rows = [
    row("new1", "a", "2026-10-15", true),
    row("old1", "a", "2026-10-10", false),
    row("second", "b", "2026-10-11", true),
  ];
  assert.deepEqual(
    orderedImages(rows, "t").map((r) => r.id),
    ["new1", "second"],
  );
});
