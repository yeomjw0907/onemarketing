import { test } from "node:test";
import assert from "node:assert/strict";
import { validateKeywordEvidence } from "../src/lib/keyword-research";
const plan = {
  main: ["제품 간식"],
  secondary: [],
  reason: "실제 제품 자료",
  candidates: [
    {
      keyword: "제품 간식",
      intent: "구매 비교",
      reason: "확인한 제품 특징과 일치",
      evidenceUrls: ["https://example.com/product"],
    },
  ],
  excluded: [],
  volumeVerified: false,
};
test("keyword plans require evidence for selected terms and reject invented sources and volumes", () => {
  const sources = [{ url: "https://example.com/product" }];
  assert.equal(validateKeywordEvidence(plan, sources).candidates.length, 1);
  assert.throws(
    () => validateKeywordEvidence(plan, [{ url: "https://other.test" }]),
    /수집하지 않은/,
  );
  assert.throws(
    () =>
      validateKeywordEvidence(
        { ...plan, secondary: ["근거 없는 효능"] },
        sources,
      ),
    /근거/,
  );
  assert.throws(() =>
    validateKeywordEvidence({ ...plan, volumeVerified: true }, sources),
  );
  assert.throws(() =>
    validateKeywordEvidence({ ...plan, candidates: [] }, sources),
  );
});
