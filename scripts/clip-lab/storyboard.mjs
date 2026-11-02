import path from "node:path";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function validateStoryboard(p) {
  if (
    p?.version !== "clip-storyboard-v1" ||
    !/^[-a-z0-9]+$/.test(p.id) ||
    !["question", "detail", "table"].includes(p.style)
  )
    throw new Error("Invalid storyboard");
  if (!Array.isArray(p.scenes) || p.scenes.length < 2 || p.scenes.length > 8)
    throw new Error("Use 2..8 scenes");
  let cursor = 0;
  for (const s of p.scenes) {
    if (
      s.start !== cursor ||
      !Number.isFinite(s.duration) ||
      s.duration < 1 ||
      s.duration > 5
    )
      throw new Error("Scenes must be contiguous, 1..5 seconds");
    cursor += s.duration;
    for (const k of [
      "file",
      "headline",
      "startState",
      "endState",
      "continuityConstraint",
    ])
      if (typeof s[k] !== "string" || !s[k].trim())
        throw new Error("Missing scene " + k);
    if (s.headline.length > 35) throw new Error("Keep headline readable");
  }
  if (cursor !== p.duration || cursor > 30)
    throw new Error("Duration mismatch");
  return p;
}
export function sceneHtml(scene, index, style) {
  const id = "scene-" + index;
  const palettes = {
    question: ["#f5efdf", "#2c241f", "#9e361f"],
    detail: ["#211b18", "#fff4df", "#e5b86d"],
    table: ["#f1e5d1", "#35291e", "#665039"],
  };
  const [ground, ink, accent] = palettes[style];
  const frame =
    style === "detail"
      ? "left:0;top:470px;width:1080px;height:1450px;"
      : style === "table"
        ? "left:64px;top:490px;width:952px;height:1150px;"
        : "left:0;top:480px;width:1080px;height:1440px;";
  return `<template><style>
 @font-face{font-family:LabKorean;src:url('assets/korean.ttf')}#root{position:absolute;inset:0;font-family:LabKorean;color:${ink};background:${ground};overflow:hidden}
 .ground{position:absolute;inset:0;background:${ground}}.clip{position:absolute;inset:0}.film{position:absolute;${frame}object-fit:cover;object-position:center center}
 .kicker{position:absolute;left:76px;top:178px;font-size:30px;letter-spacing:.06em;color:${accent}}
 .headline{position:absolute;left:70px;top:248px;width:900px;font-size:${style === "detail" ? 90 : 96}px;line-height:1.2;font-weight:700;letter-spacing:-.065em;white-space:pre-line}
 .rule{position:absolute;left:76px;top:438px;width:76px;height:5px;background:${accent}}
 .tag{position:absolute;left:76px;top:382px;font-size:30px;color:${ink}}
 </style><div id="root" data-composition-id="${id}" data-width="1080" data-height="1920">
 <div class="ground"></div><video id="${id}-film" class="clip film" data-start="0" data-duration="${scene.duration}" src="assets/shot-${index}.mp4" muted playsinline></video>
 <div id="${id}-copy" class="clip" data-start="0" data-duration="${scene.duration}" data-track-kind="graphics" style="z-index:2"><p class="kicker">${escape(style === "detail" ? "가까이 보는 피자설기" : style === "table" ? "오늘의 작은 간식" : "PIZZA SEOLGI")}</p><h1 class="headline">${escape(scene.headline)}</h1><div class="rule"></div>${index === 2 ? '<p class="tag">정원떡집 · 가상 광고 예시</p>' : ""}</div>
 </div><script>const tl=gsap.timeline({paused:true});tl.fromTo('.headline',{opacity:0,y:22},{opacity:1,y:0,duration:.32,ease:'power2.out'},0);tl.fromTo('.rule',{scaleX:0,transformOrigin:'left'},{scaleX:1,duration:.5,ease:'power2.out'},.12);window.__timelines=window.__timelines||{};window.__timelines['${id}']=tl;</script></template>`;
}
export async function compileStoryboard(plan, projectDir, assetDir, fontFile) {
  validateStoryboard(plan);
  await mkdir(path.join(projectDir, "compositions"), { recursive: true });
  await mkdir(path.join(projectDir, "assets"), { recursive: true });
  await copyFile(fontFile, path.join(projectDir, "assets/korean.ttf"));
  for (const [i, s] of plan.scenes.entries()) {
    await copyFile(
      path.resolve(assetDir, s.file),
      path.join(projectDir, `assets/shot-${i}.mp4`),
    );
    await writeFile(
      path.join(projectDir, `compositions/scene-${i}.html`),
      sceneHtml(s, i, plan.style),
    );
  }
  for (const [name, target] of [
    [plan.music, "music.wav"],
    [plan.voice, "voice.mp3"],
  ]) {
    if (name)
      await copyFile(
        path.resolve(assetDir, name),
        path.join(projectDir, "assets", target),
      );
  }
  const scenes = plan.scenes
    .map(
      (s, i) =>
        `<div id="scene-${i}" data-composition-id="scene-${i}" data-composition-src="compositions/scene-${i}.html" data-start="${s.start}" data-duration="${s.duration}" data-width="1080" data-height="1920" data-track-index="1"></div>`,
    )
    .join("\n");
  await writeFile(
    path.join(projectDir, "index.html"),
    `<!doctype html><html lang="ko" data-resolution="portrait"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080,height=1920"><script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:1080px;height:1920px;overflow:hidden;background:#f5efdf}#root{position:absolute;inset:0}.clip{position:absolute;inset:0}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${plan.duration}" data-width="1080" data-height="1920" data-fps="30">${scenes}${plan.music ? `<audio id="music" src="assets/music.wav" data-start="0" data-duration="${plan.duration}" data-volume="0.14" data-fade-in="0.35" data-fade-out="1.2"></audio>` : ""}${plan.voice ? '<audio id="voice" src="assets/voice.mp3" data-start="0.6" data-volume="1" data-track-index="3"></audio>' : ""}</div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`,
  );
  await writeFile(
    path.join(projectDir, "storyboard.json"),
    JSON.stringify(plan, null, 2),
  );
  await writeFile(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        private: true,
        devDependencies: { hyperframes: "0.9.5" },
        scripts: {
          check: "hyperframes check",
          render:
            "hyperframes render --quality delivery --workers 1 --low-memory-mode",
        },
      },
      null,
      2,
    ),
  );
  return projectDir;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [planFile, projectDir, assetDir, fontFile] = process.argv.slice(2);
  if (!fontFile)
    throw new Error(
      "Usage: storyboard.mjs plan.json project-dir asset-dir font-file",
    );
  await compileStoryboard(
    JSON.parse(await readFile(planFile, "utf8")),
    path.resolve(projectDir),
    path.resolve(assetDir),
    path.resolve(fontFile),
  );
  console.log("Storyboard compiled");
}
