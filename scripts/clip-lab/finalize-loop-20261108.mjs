import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
import { validateResearch } from "./research.mjs";
import { researchAccounting, listResearch } from "./knowledge.mjs";
const root = "output/clip-loop-20261108";
const catalog = JSON.parse(
  gunzipSync(
    await readFile("data/clip-lab/reference-catalog-20261108.json.gz"),
  ),
);
const previous = JSON.parse(
  gunzipSync(await readFile("data/clip-lab/reference-catalog-1000.json.gz")),
);
const old = new Set(previous.records.map((r) => r.sourceUrl)),
  unique = new Set(catalog.records.map((r) => r.sourceUrl));
if (
  catalog.records.length !== 1000 ||
  unique.size !== 1000 ||
  catalog.records.some((r) => old.has(r.sourceUrl))
)
  throw Error("Expected 1000 new distinct observations");
for (const r of catalog.records) validateResearch(r.analysis);
const categories = Object.fromEntries(
  [...new Set(catalog.records.map((r) => r.category))].map((k) => [
    k,
    catalog.records.filter((r) => r.category === k).length,
  ]),
);
const families = [
  ["detail-scale", "전체와 세부의 관계", /전체|근접|클로즈업|디테일/],
  ["lateral-motion", "작은 옆 이동", /팬|패닝|옆|수평|좌우/],
  ["fixed-composition", "고정 구도와 대상 동작", /고정|정적/],
  ["continuity", "위치·방향·빛의 연결", /위치|방향|광원|조명/],
];
const evidence = families.map(([id, label, re]) => {
  const matches = catalog.records.filter((r) =>
    r.analysis.shots.some((s) =>
      re.test([s.camera, s.action, s.continuityConstraint].join(" ")),
    ),
  );
  const seen = new Set();
  const sources = [];
  for (const r of matches) {
    if (seen.has(r.category)) continue;
    seen.add(r.category);
    const shotIndex = r.analysis.shots.findIndex((s) =>
      re.test([s.camera, s.action, s.continuityConstraint].join(" ")),
    );
    sources.push({
      id: r.id,
      url: r.sourceUrl,
      category: r.category,
      shotIndex,
      rangeMs: [
        r.analysis.shots[shotIndex].startMs,
        r.analysis.shots[shotIndex].endMs,
      ],
      reviewStatus: r.reviewStatus,
    });
    if (sources.length === 6) break;
  }
  return {
    id,
    label,
    matchingObservations: matches.length,
    method: "관찰 문구의 키워드 분류; 실제 사용 빈도나 성공 원인 아님",
    sources,
  };
});
await writeFile(
  "data/clip-lab/editing-evidence-20261108.json",
  JSON.stringify(
    {
      version: "editing-evidence-v1",
      observationCount: 1000,
      categories,
      reviewStatus: "ai-observed-unreviewed",
      scope:
        "공개 영상 첫 30초 1fps 관찰의 조건부 편집 실험 근거. 제품 사실·효과·라이선스 근거 아님.",
      families: evidence,
    },
    null,
    2,
  ),
);
const locals = [];
for (let i = 1; i <= 5; i++) {
  const r = JSON.parse(await readFile(`${root}/local/${i}.json`, "utf8"));
  if (
    createHash("sha256")
      .update(await readFile(r.sourceFile))
      .digest("hex") !== r.sha256
  )
    throw Error("Local source changed");
  const a = JSON.parse(await readFile(`${root}/local/${i}-audio.json`, "utf8"));
  locals.push({
    sourceName: path.basename(r.sourceFile),
    sha256: r.sha256,
    seconds: r.seconds,
    model: r.model,
    samplingFps: r.samplingFps,
    inputRange: r.inputRange,
    visualAccess: r.analysis.visualAccess,
    visualSegments: r.analysis.segments.length,
    audioObserved: a.status === "succeeded",
    audioModel: a.model,
    audioInput: a.input,
    reviewStatus:
      "AI observation plus sampled contact-sheet visual review; no human listening",
  });
}
const accounting = await researchAccounting(
  root + "/direct",
  await listResearch(root + "/direct"),
);
const evidencePath = "data/clip-lab/editing-evidence-20261108.json";
const bundle = JSON.parse(await readFile(evidencePath, "utf8"));
bundle.localPatterns = [
  {
    mode: "process",
    label: "사용 상황→설정→통화→리포트",
    source: {
      id: "local-" + locals[2].sha256,
      sourceName: locals[2].sourceName,
      sha256: locals[2].sha256,
      rangeMs: [3000, 17000],
      samplingFps: 3,
      reviewStatus: "AI full-file observation plus sampled visual check",
    },
  },
  {
    mode: "dialogue",
    label: "화자별 위치·색과 대사/반응 교대",
    source: {
      id: "local-" + locals[4].sha256,
      sourceName: locals[4].sourceName,
      sha256: locals[4].sha256,
      rangeMs: [0, 47440],
      samplingFps: 3,
      reviewStatus:
        "AI full-file observation plus sampled visual check; not exact cut timing",
    },
  },
];
await writeFile(evidencePath, JSON.stringify(bundle, null, 2));
const report = {
  version: "clip-loop-20261108-v1",
  publicObservations: 1000,
  localReferences: locals,
  totalReferences: 1005,
  previousCatalogOverlap: 0,
  uniquePublicSources: unique.size,
  categories,
  representativeSegments: catalog.records.reduce(
    (n, r) => n + r.analysis.shots.length,
    0,
  ),
  unreviewedPublic: catalog.records.filter(
    (r) => r.reviewStatus === "unreviewed",
  ).length,
  input: { rangeMs: [0, 30000], samplingFps: 1 },
  accounting,
  limitations: [
    "모델 가중치 재학습 아님",
    "공개 1000개 전수 사람 검토·정밀 컷·음성 분석 아님",
    "첨부 5개 전체 3fps 영상 관찰, 별도 압축 오디오 AI 관찰; 사람 청취 없음",
    "성과 인과 추정·광고 효과 검증 아님",
  ],
};
await mkdir("docs/research/clip-loop-20261108", { recursive: true });
await writeFile(
  "docs/research/clip-loop-20261108/verification.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
