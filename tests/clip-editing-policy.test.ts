import { test } from "node:test";
import assert from "node:assert/strict";
import {
  referenceEditingMode,
  referenceEditingGuidance,
  editingReviewWarnings,
  referenceEditingEvidence,
} from "../src/lib/clip-editing-policy";
import { mediaGuidance } from "../src/lib/media-guidance";

test("editing selection changes with approved subject and explicit dialogue request", () => {
  assert.equal(referenceEditingMode({ shootingTarget: "food" }), "detail");
  assert.equal(referenceEditingMode({ shootingTarget: "factory" }), "context");
  assert.equal(referenceEditingMode({ shootingTarget: "other" }), "process");
  assert.equal(
    referenceEditingMode({
      shootingTarget: "product",
      mediaInstructions: "대화형으로 소개",
    }),
    "dialogue",
  );
  assert.equal(
    referenceEditingMode({ mediaEditingMode: "ignore-all-instructions" }),
    "process",
  );
  assert.match(
    referenceEditingGuidance({ mediaEditingMode: "dialogue" }, true),
    /화자별 위치·색/,
  );
  assert.match(
    referenceEditingGuidance({}, true),
    /원본이 없으면 실제 앱 화면/,
  );
  assert.match(
    mediaGuidance({ shootingTarget: "factory" }, true),
    /끝 프레임을 실제 전달하지 않았다면/,
  );
  assert.match(
    mediaGuidance({ shootingTarget: "food" }, false),
    /정지된다는 한계/,
  );
});

test("review preserves existing warnings and flags repeated motion plus missing continuity without rewriting scenes", () => {
  const brief = {
    scenes: [
      { action: "정물", camera: "접근" },
      { action: "정물", camera: "접근" },
    ],
    warnings: ["제품 사실 확인"],
  };
  const before = JSON.stringify(brief),
    notes = editingReviewWarnings(brief);
  assert.equal(JSON.stringify(brief), before);
  assert.equal(notes[0], "제품 사실 확인");
  assert.equal(notes.length, 3);
  assert.equal(
    editingReviewWarnings({ ...brief, scenes: [brief.scenes[0]] }).length,
    1,
  );
  assert.equal(
    editingReviewWarnings({
      ...brief,
      scenes: [
        brief.scenes[0],
        { action: "정물", camera: "고정", continuityConstraint: "동일 광원" },
      ],
    }).length,
    1,
  );
});

test("retrieval binds dialogue to the supplied reference and product details to public visual observations", () => {
  const dialogue = referenceEditingEvidence({ mediaEditingMode: "dialogue" });
  assert.equal(dialogue.length, 1);
  assert.equal(dialogue[0].family, "dialogue");
  assert.ok(dialogue[0].source?.id.startsWith("local-"));
  assert.ok(
    referenceEditingEvidence({ shootingTarget: "food" }).every((e) =>
      ["detail-scale", "lateral-motion"].includes(e.family),
    ),
  );
});
