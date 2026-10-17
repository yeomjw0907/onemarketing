import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clipDescription,
  clipCopyOutput,
  requireClipDescription,
} from "../src/lib/clip-description";

test("clip description uses normalized Unicode character boundaries without truncation", () => {
  assert.equal(clipDescription("가".repeat(9)).valid, false);
  assert.equal(clipDescription("가".repeat(10)).valid, true);
  assert.equal(clipDescription("가".repeat(300)).valid, true);
  assert.equal(clipDescription("가".repeat(301)).valid, false);
  assert.equal(clipDescription("😀".repeat(10)).length, 10);
  assert.equal(
    clipDescription("  설명을 입력해주세요\r\n#광고  ").text,
    "설명을 입력해주세요\n#광고",
  );
  assert.throws(() => requireClipDescription("가".repeat(301)), /현재 301자/);
});
test("five hashtags including leading and adjacent tags survive unchanged; six are rejected", () => {
  const text =
    "#광고 #브랜드 #제품 #사용법 #추천\n확인된 제품 정보를 소개합니다.";
  assert.equal(requireClipDescription(text), text);
  assert.equal(clipDescription(text).hashtags.length, 5);
  assert.equal(clipDescription(text + " #추가").valid, false);
  assert.equal(
    clipDescription("제품을 소개합니다 #a#b#c#d#e#f").hashtags.length,
    6,
  );
});
test("generated publication description is separated from scene and production notes", () => {
  const text = "#광고 확인된 제품 정보를 소개합니다. #제품";
  const output = clipCopyOutput(
    JSON.stringify({
      description: text,
      productionNotes: "장면1: 제품 클로즈업. 자막 제작 지시",
    }),
  );
  assert.equal(output.text, text);
  assert.match(output.notes, /장면1/);
  assert.doesNotMatch(output.text, /제작 지시/);
  assert.throws(
    () =>
      clipCopyOutput(
        JSON.stringify({
          description: "짧음",
          productionNotes: "긴 제작 지시",
        }),
      ),
    /10~300/,
  );
});
