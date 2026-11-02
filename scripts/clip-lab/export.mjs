import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listRuns, summarize, atomicJson } from "./core.mjs";
import {
  listResearch,
  researchForLab,
  buildKnowledge,
  researchAccounting,
} from "./knowledge.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function exportLab(root, target) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  const research = await listResearch(root);
  const runs = [...(await listRuns(root)), ...research.map(researchForLab)];
  const snapshot = {
    manifest,
    runs,
    summary: {
      ...summarize(runs),
      ...(research.length ? await researchAccounting(root, research) : {}),
    },
    active: false,
    canAnalyze: false,
    model: "gemini-3.1-flash-lite",
    knowledge: research.length ? buildKnowledge(research) : null,
    exportedAt: new Date().toISOString(),
  };
  await atomicJson(path.join(root, "results.json"), snapshot);
  await atomicJson(path.join(root, "summary.json"), snapshot.summary);
  if (snapshot.knowledge)
    await atomicJson(path.join(root, "knowledge.json"), snapshot.knowledge);
  let html = await readFile(path.join(here, "ui/index.html"), "utf8");
  const css = await readFile(path.join(here, "ui/style.css"), "utf8");
  let js = await readFile(path.join(here, "ui/app.js"), "utf8");
  js = js.replace(
    /async function api\([^]*?(?=function entries\()/,
    `async function api(route,data){if(data!==undefined)throw new Error('읽기 전용 보고서입니다. 검토 변경은 로컬 연구소에서 실행하세요.');return JSON.parse(document.getElementById('snapshot').textContent);}\n`,
  );
  js = js.replace(
    "review.append(choice, note, save);",
    "save.disabled=true; choice.disabled=true; note.readOnly=true; review.append(choice, note, save);",
  );
  const data = JSON.stringify(snapshot).replaceAll("<", "\\u003c");
  html = html
    .replace(
      /<link\s+rel="stylesheet"\s+href="\/style.css"\s*\/?>/,
      `<style>${css}</style>`,
    )
    .replace("내부 연구 · 로컬 실험", "실제 API 시험 · 읽기 전용 보고서")
    .replace(
      /<script type="module" src="\/app.js"><\/script>/,
      `<script type="application/json" id="snapshot">${data}</script><script type="module">${js.replaceAll("</script", "<\\/script")}</script>`,
    );
  await writeFile(target, html, "utf8");
  return snapshot.summary;
}
if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (!process.argv[2] || !process.argv[3])
    throw new Error("데이터 폴더와 HTML 출력 경로를 지정하세요.");
  console.log(
    JSON.stringify(
      await exportLab(
        path.resolve(process.argv[2]),
        path.resolve(process.argv[3]),
      ),
      null,
      2,
    ),
  );
}
