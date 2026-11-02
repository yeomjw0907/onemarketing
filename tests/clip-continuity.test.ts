import { test } from "node:test";
import assert from "node:assert/strict";
import { briefingPrompt } from "../src/lib/media-guidance";
test("approved continuity states reach generation prompt without changing old briefs", () => {
  const scene = {
    timing: "0–5초",
    composition: "흰 접시",
    people: false,
    hands: false,
    eating: false,
    action: "제품 고정",
    camera: "느린 접근",
  };
  const original = briefingPrompt({ prompt: "확인된 제품", scenes: [scene] });
  assert.ok(!original.includes("시작 상태:"));
  const prompt = briefingPrompt({
    prompt: "확인된 제품",
    scenes: [
      {
        ...scene,
        startState: "제품 중앙",
        endState: "토핑 근접",
        continuityConstraint: "중앙 위치와 광원 유지",
      },
    ],
  });
  assert.ok(prompt.includes("시작 상태: 제품 중앙"));
  assert.ok(prompt.includes("종료 상태: 토핑 근접"));
  assert.ok(prompt.includes("장면 연결 조건: 중앙 위치와 광원 유지"));
});
