import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateResearch,
  researchOne,
} from "../scripts/clip-lab/research.mjs";
import {
  validateGroup,
  researchGroup,
} from "../scripts/clip-lab/research-group.mjs";
import {
  buildKnowledge,
  researchForLab,
  researchAccounting,
  selectEvidence,
} from "../scripts/clip-lab/knowledge.mjs";
import { importCatalog, exportCatalog } from "../scripts/clip-lab/catalog.mjs";
import { generateMedia } from "../scripts/clip-lab/media.mjs";
import {
  validateStoryboard,
  sceneHtml,
} from "../scripts/clip-lab/storyboard.mjs";
import { pizzaPlans } from "../scripts/clip-lab/pizza-examples.mjs";
const observation = () => ({
  visualAccess: true,
  summary: "흰 접시 위의 제품을 보여줍니다.",
  hook: "토핑 근접 촬영",
  shots: [
    {
      startMs: 0,
      endMs: 4000,
      subject: "제품",
      action: "고정",
      camera: "천천히 접근",
      startState: "화면 중앙의 제품 전체",
      endState: "제품의 세부",
      continuityConstraint: "중심 위치와 조명 유지",
      transition: "하드 컷",
    },
  ],
  editRule: {
    instruction: "전체에서 세부로 접근",
    appliesWhen: "구조가 확인된 제품",
    avoidWhen: "카메라가 뒷면을 드러내는 경우",
    evidenceShot: 0,
  },
  limitations: "1fps 관찰. 음성 및 정밀 컷 시점 미검증.",
});
const ref = {
  url: "https://www.youtube.com/shorts/abcdefghijk",
  title: "테스트",
  category: "음식",
};
async function temporary(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "clip-research-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("observations require visible video and ordered source times", () => {
  assert.equal(validateResearch(observation()).shots.length, 1);
  assert.throws(() =>
    validateResearch({ ...observation(), visualAccess: false }),
  );
  const a = observation();
  a.shots[0].endMs = 31000;
  assert.throws(() => validateResearch(a));
});
test("group identity binding rejects missing, duplicate and foreign source ids", () => {
  const row = { sourceId: "a", analysis: observation() };
  assert.equal(
    validateGroup({ observations: [row] }, ["a"]).get("a").summary,
    observation().summary,
  );
  assert.throws(() => validateGroup({ observations: [row, row] }, ["a", "b"]));
  assert.throws(() => validateGroup({ observations: [row] }, ["b"]));
  assert.equal(
    validateGroup(
      { observations: [{ ...row, analysis: { visualAccess: false } }] },
      ["a"],
    ).get("a"),
    null,
  );
});
test("uncertain single request persists and never resubmits", () =>
  temporary(async (root) => {
    let requests = 0;
    const options = {
      reference: ref,
      key: "test-key",
      model: "gemini-3.1-flash-lite",
      root,
      fetchImpl: async () => {
        requests++;
        throw Error("Network");
      },
    };
    assert.equal((await researchOne(options)).status, "uncertain");
    assert.equal((await researchOne(options)).status, "uncertain");
    assert.equal(requests, 1);
  }));
test("group keeps source binding, allocates cost, reuses records and omits keys", () =>
  temporary(async (root) => {
    let requests = 0;
    const fetchImpl = async (url, init) => {
      requests++;
      const input = JSON.parse(init.body);
      const ids = input.contents[0].parts
        .filter((x) => x.text?.startsWith("SOURCE "))
        .map((x) => x.text.match(/sourceId=([a-f0-9]+)/)[1]);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    observations: ids.map((sourceId) => ({
                      sourceId,
                      analysis: observation(),
                    })),
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1000 },
      });
    };
    const options = {
      references: [
        ref,
        { ...ref, url: "https://www.youtube.com/watch?v=lmnopqrstuv" },
      ],
      key: "private-test-secret",
      root,
      fetchImpl,
    };
    const rows = await researchGroup(options);
    const accounting = await researchAccounting(root, rows);
    assert.equal(accounting.providerRequests, 1);
    assert.equal(accounting.inputTokens, 1000);
    assert.equal(accounting.outputTokens, 1000);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.status === "succeeded"));
    assert.ok(
      rows.every((r) => r.estimatedCost.allocation === "group-equal-share"),
    );
    assert.equal((await researchGroup(options)).length, 0);
    assert.equal(requests, 1);
    assert.ok(
      !(
        await readFile(
          path.join(root, "research", rows[0].id + ".json"),
          "utf8",
        )
      ).includes(options.key),
    );
    await (
      await import("node:fs/promises")
    ).writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({ references: options.references }),
    );
    const catalogFile = path.join(root, "catalog.json.gz");
    const interrupted = JSON.parse(
      await readFile(path.join(root, "research", rows[0].id + ".json"), "utf8"),
    );
    delete interrupted.completedAt;
    await (
      await import("node:fs/promises")
    ).writeFile(
      path.join(root, "research", rows[0].id + ".json"),
      JSON.stringify(interrupted),
    );
    const catalog = await exportCatalog(root, catalogFile, 2);
    assert.equal(catalog.records.length, 2);
    const imported = path.join(root, "imported");
    await importCatalog(catalogFile, imported);
    await importCatalog(catalogFile, imported);
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(imported, "research", rows[0].id + ".json"),
          "utf8",
        ),
      ).importedFromCatalog,
      true,
    );
    assert.ok(!JSON.stringify(catalog).includes(options.key));
  }));
test("knowledge keeps unreviewed rules as candidates", () => {
  const r = {
    id: "id",
    sourceUrl: ref.url,
    status: "succeeded",
    reviewStatus: "unreviewed",
    attempts: [],
    analysis: observation(),
  };
  const k = buildKnowledge([r]);
  assert.equal(k.successful, 1);
  assert.equal(k.sourceChecked, 0);
  assert.equal(selectEvidence([r], { query: "접근" }).length, 0);
  assert.equal(
    selectEvidence([r], { query: "접근", allowUnreviewed: true })[0].status,
    "candidate",
  );
  assert.ok(k.patterns.every((p) => p.status === "candidate"));
  assert.equal(
    researchForLab(r).analysis.segments[0].startState,
    "화면 중앙의 제품 전체",
  );
});
test("storyboards reject gaps and escape displayed copy", () => {
  const p = pizzaPlans()[0];
  assert.equal(validateStoryboard(p).duration, 12);
  const broken = structuredClone(p);
  broken.scenes[1].start = 5;
  assert.throws(() => validateStoryboard(broken));
  const html = sceneHtml(
    { ...p.scenes[0], headline: "<script>alert(1)</script>" },
    0,
    p.style,
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes('<h1 class="headline"><script>'));
});
test("media receipt recovers collection without another paid submission", () =>
  temporary(async (root) => {
    let submits = 0;
    const fetchImpl = async (url, init) => {
      if (init?.method === "POST") {
        submits++;
        return Response.json({
          request_id: "r",
          status_url: "https://queue.fal.run/model/requests/r/status",
          response_url: "https://queue.fal.run/model/requests/r",
        });
      }
      if (String(url).endsWith("/status"))
        return Response.json({ status: "COMPLETED" });
      if (String(url).endsWith("/requests/r"))
        return Response.json({
          video: { url: "https://v3.fal.media/sample.mp4" },
        });
      return new Response(new Uint8Array([1, 2, 3]));
    };
    const options = {
      key: "secret",
      model: "test/model",
      input: { prompt: "test" },
      id: "test-media",
      root,
      outputName: "out.mp4",
      fetchImpl,
    };
    assert.equal((await generateMedia(options)).status, "completed");
    await generateMedia(options);
    assert.equal(submits, 1);
    assert.equal((await readFile(path.join(root, "out.mp4"))).length, 3);
    await assert.rejects(() =>
      generateMedia({ ...options, input: { prompt: "different" } }),
    );
  }));
