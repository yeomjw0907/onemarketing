import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateResearch } from "./research.mjs";

export async function listResearch(root) {
  const dir = path.join(root, "research");
  let names;
  try {
    names = await readdir(dir);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  return Promise.all(
    names
      .filter((n) => /^[a-f0-9]{64}\.json$/.test(n))
      .map(async (n) => JSON.parse(await readFile(path.join(dir, n), "utf8"))),
  );
}
export async function researchAccounting(root, records) {
  let names = [];
  try {
    names = await readdir(path.join(root, "batches"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const batches = await Promise.all(
    names
      .filter((n) => /^[a-f0-9-]+\.json$/.test(n))
      .map(async (n) =>
        JSON.parse(await readFile(path.join(root, "batches", n), "utf8")),
      ),
  );
  const attempts = [
    ...records
      .filter((r) => !r.groupId && !r.importedFromCatalog)
      .flatMap((r) => r.attempts),
    ...batches.flatMap((b) => b.attempts),
  ];
  let falNames = [];
  try {
    falNames = await readdir(path.join(root, "fal-batches"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const falReceipts = await Promise.all(
    falNames
      .filter((n) => /^fal-[a-f0-9]{64}\.json$/.test(n))
      .map(async (n) =>
        JSON.parse(await readFile(path.join(root, "fal-batches", n), "utf8")),
      ),
  );
  const falUsage = falReceipts.filter((r) => r.usage);
  return {
    attempts: records.reduce((n, r) => n + r.attempts.length, 0),
    firstPassSucceeded: records.filter(
      (r) => r.attempts[0]?.status === "succeeded",
    ).length,
    retried: records.filter((r) => r.attempts.length > 1).length,
    providerRequests: attempts.length + falReceipts.length,
    knownUsageCount: attempts.filter((a) => a.usage).length + falUsage.length,
    usageUnavailableAttempts:
      attempts.filter((a) => !a.usage).length +
      falReceipts.length -
      falUsage.length,
    providerReportedUsd: falUsage.reduce((s, r) => s + (r.usage.cost || 0), 0),
    estimatedUsd: attempts.reduce(
      (n, a) => n + (a.estimatedCost?.amount || 0),
      0,
    ),
    inputTokens:
      falUsage.reduce((n, r) => n + (r.usage.prompt_tokens || 0), 0) +
      attempts.reduce((n, a) => n + (a.usage?.promptTokenCount || 0), 0),
    outputTokens:
      falUsage.reduce((n, r) => n + (r.usage.completion_tokens || 0), 0) +
      attempts.reduce(
        (n, a) =>
          n +
          (a.usage?.candidatesTokenCount || 0) +
          (a.usage?.thoughtsTokenCount || 0),
        0,
      ),
    actualUsd: null,
  };
}
export function researchForLab(r) {
  if (r.analysis) validateResearch(r.analysis);
  return {
    ...r,
    recordKind: "research",
    durationMs: null,
    usage: r.attempts.at(-1)?.usage || null,
    reviewVersion: r.reviewVersion || 1,
    reviewNote: r.reviewNote || "",
    attemptNumber: r.attempts.length,
    httpStatus: r.attempts.at(-1)?.httpStatus,
    analysis: r.analysis
      ? {
          summary: r.analysis.summary,
          hook: r.analysis.hook,
          limitations: [
            r.analysis.limitations,
            r.samplingFps === 1
              ? "첫 30초를 1fps로 관찰한 대표 구간입니다. 전체 컷 수와 정밀한 컷 시점을 뜻하지 않습니다."
              : "URL을 제공하고 첫 30초의 대표 구간을 관찰하도록 지시했습니다. 실제 입력 범위와 프레임 샘플링은 공급사 기본값이며 정밀한 컷 시점을 검증하지 않았습니다.",
          ],
          segments: r.analysis.shots.map((s) => ({
            ...s,
            role: "대표 구간",
            visual: s.subject,
            audio: "검증하지 않음",
            caption: "별도 검증하지 않음",
            continuity: s.continuityConstraint,
            reproduction: `시작: ${s.startState} → 종료: ${s.endState}`,
          })),
          hypotheses: [
            {
              statement: r.analysis.editRule.instruction,
              evidenceSegmentIndexes: [r.analysis.editRule.evidenceShot],
              experiment: r.analysis.editRule.appliesWhen,
              failureRisk: r.analysis.editRule.avoidWhen,
            },
          ],
        }
      : undefined,
  };
}
export function buildKnowledge(records) {
  const successful = records.filter((r) => r.status === "succeeded");
  const patterns = [
    [
      "camera-push",
      "제품을 향해 천천히 접근하기",
      /push|줌|다가|접근|클로즈업/i,
    ],
    [
      "camera-slide",
      "피사체를 따라 옆으로 이동하기",
      /slide|좌우|옆으로|이동|트래킹|팬/i,
    ],
    [
      "detail-reveal",
      "전체와 세부를 나눠 보여주기",
      /디테일|세부|근접|매크로|전체/i,
    ],
    [
      "match-position",
      "장면 사이의 위치와 방향 맞추기",
      /위치|방향|중앙|중심|매치/i,
    ],
    [
      "hold-identity",
      "제품 형태와 배치 유지하기",
      /형태|토핑|개수|배치|동일|유지/i,
    ],
  ];
  const rules = successful.map((r) => ({
    id: r.id,
    sourceUrl: r.sourceUrl,
    category: r.category,
    reviewStatus: r.reviewStatus,
    rangeMs: r.rangeMs,
    samplingFps: r.samplingFps,
    ...r.analysis.editRule,
  }));
  return {
    version: "clip-knowledge-v1",
    createdAt: new Date().toISOString(),
    successful: successful.length,
    representativeSegments: successful.reduce(
      (n, r) => n + r.analysis.shots.length,
      0,
    ),
    sourceChecked: successful.filter((r) => r.reviewStatus === "source-checked")
      .length,
    scope:
      "첫 30초의 대표 구간 관찰 요청 · 입력 경로별 설정은 개별 기록 참조 · 모델 가중치 학습 아님",
    models: [...new Set(successful.map((r) => r.model))],
    inputModes: {
      explicitOneFps: successful.filter((r) => r.samplingFps === 1).length,
      providerDefault: successful.filter((r) => r.samplingFps !== 1).length,
    },
    patterns: patterns.map(([id, label, re]) => {
      const evidence = successful.filter((r) =>
        re.test(
          r.analysis.shots
            .map((s) => [s.action, s.camera, s.continuityConstraint].join(" "))
            .join(" "),
        ),
      );
      return {
        id,
        label,
        matchingVideos: evidence.length,
        evidenceIds: evidence.slice(0, 12).map((r) => r.id),
        status: "candidate",
        method: "관찰 문구의 키워드 분류. 인과 효과·인기도를 뜻하지 않음",
      };
    }),
    rules,
  };
}
export function selectEvidence(
  records,
  { query, category, limit = 3, allowUnreviewed = false } = {},
) {
  const words = String(query || "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || !Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new Error("Supply query and limit 1..10");
  return records
    .filter(
      (r) =>
        r.status === "succeeded" &&
        r.reviewStatus !== "rejected" &&
        (!category || r.category === category) &&
        (allowUnreviewed || r.reviewStatus === "source-checked"),
    )
    .map((r) => ({
      r,
      score: words.reduce(
        (n, w) => n + (JSON.stringify(r.analysis).includes(w) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id))
    .slice(0, limit)
    .map(({ r, score }) => ({
      id: r.id,
      sourceUrl: r.sourceUrl,
      title: r.title,
      reviewStatus: r.reviewStatus,
      matchedTerms: score,
      rule: r.analysis.editRule,
      shots: r.analysis.shots,
      status: "candidate",
    }));
}
