import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileStoryboard } from "./storyboard.mjs";
export function pizzaPlans() {
  const titles = [
    ["피자일까요?", "설기일까요?", "피자설기."],
    ["네모난 설기 위,", "조금 더 가까이", "작은 디테일."],
    ["오늘의 간식,", "새로운 모양으로.", "피자설기."],
  ];
  const orders = [
    [1, 0, 2],
    [0, 2, 1],
    [2, 0, 1],
  ];
  return ["question", "detail", "table"].map((style, i) => ({
    version: "clip-storyboard-v1",
    id: "pizza-seolgi-" + (i + 1),
    style,
    duration: 12,
    title: ["피자와 설기 사이", "디테일을 따라", "오늘의 간식"][i],
    disclosure:
      "AI로 만든 가상 제품 광고 예시. 실제 제품 정보·판매 성과 검증 없음.",
    music: "music.wav",
    voice: "voice-" + i + ".mp3",
    researchStatus: "candidate",
    scenes: orders[i].map((n, j) => ({
      start: j * 4,
      duration: 4,
      file: "motion-" + n + ".mp4",
      headline: titles[i][j],
      startState:
        "흰 접시 위의 네모난 설기와 토핑 배치를 기준 이미지대로 유지한다.",
      endState:
        "제품은 고정하고 카메라만 천천히 이동한다. 새 재료나 손을 추가하지 않는다.",
      continuityConstraint:
        "세 장면의 제품 중심, 따뜻한 광원과 색감을 맞춘다. 각도가 다른 컷은 위치 연결이 완벽하다고 주장하지 않고 명확한 하드 컷으로 구분한다.",
      transition: "hard-cut",
    })),
  }));
}
export async function buildPizzaExamples(outputRoot, assetDir, fontFile) {
  for (const p of pizzaPlans()) {
    const dir = path.join(outputRoot, p.id);
    await compileStoryboard(p, dir, assetDir, fontFile);
    await writeFile(
      path.join(dir, "STORYBOARD.md"),
      `# ${p.title}\n\n${p.disclosure}\n\n${p.scenes.map((s, i) => `${i + 1}. ${s.start}–${s.start + s.duration}초: ${s.headline}\n   ${s.continuityConstraint}`).join("\n")}\n\n영상 3개를 생성한 뒤 세 편에서 다르게 배열했습니다. 원본 카메라 움직임을 유지하며 추가 줌을 겹치지 않습니다. 음악과 더빙을 별도 트랙에 둡니다. 화면 문구는 장면 제목이며 음성의 단어별 자막이 아닙니다.\n`,
    );
    await copyFile(
      path.join(assetDir, "OFL.txt"),
      path.join(dir, "assets/OFL.txt"),
    );
    await writeFile(
      path.join(dir, "assets/ledger.json"),
      JSON.stringify(
        {
          video: {
            model: "bytedance/seedance-2.5/image-to-video",
            count: 3,
            durationEach: 5,
            source: "기존 서비스에서 생성한 가상 피자설기 이미지",
          },
          music: { model: "fal-ai/stable-audio-25/text-to-audio", seconds: 20 },
          voice: { model: "fal-ai/minimax/speech-2.8-hd", language: "Korean" },
          font: { family: "Noto Sans KR", license: "OFL.txt" },
        },
        null,
        2,
      ),
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [outputRoot, assetDir, fontFile] = process.argv.slice(2);
  if (!fontFile) throw new Error("Provide output-root asset-dir font-file");
  await mkdir(outputRoot, { recursive: true });
  await buildPizzaExamples(
    path.resolve(outputRoot),
    path.resolve(assetDir),
    path.resolve(fontFile),
  );
  console.log("Built three editable projects");
}
