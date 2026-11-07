import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type ClipQualityReport = {
  version: "clip-temporal-v1";
  samplingFps: 2;
  sampledSeconds: number;
  scope: string;
  warnings: {
    code: "long-hold" | "dark-frame";
    start: number;
    end: number;
    message: string;
  }[];
};

/** Advisory pixel checks, not a semantic motion detector or a quality score. */
export function assessClipFrames(
  frames: Uint8Array[],
  expectedMotion = false,
): ClipQualityReport {
  if (frames.length < 2 || frames.some((f) => f.length !== 4096))
    throw new Error("영상 검토용 프레임을 읽을 수 없습니다.");
  const warnings: ClipQualityReport["warnings"] = [];
  let holdStart = 0;
  const hold = (end: number) => {
    if (expectedMotion && (end - holdStart) / 2 >= 6)
      warnings.push({
        code: "long-hold",
        start: holdStart / 2,
        end: end / 2,
        message:
          "6초 이상 화면 변화가 작습니다. 의도한 정보 유지 구간인지, 생성 움직임이 멈췄는지 확인해주세요.",
      });
  };
  let darkStart: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    const dark = frames[i].filter((v) => v < 12).length / 4096 > 0.98;
    if (dark && darkStart === null) darkStart = i;
    if (!dark && darkStart !== null) {
      warnings.push({
        code: "dark-frame",
        start: darkStart / 2,
        end: i / 2,
        message: "거의 검은 화면이 있습니다. 의도한 전환인지 확인해주세요.",
      });
      darkStart = null;
    }
    if (!i) continue;
    let difference = 0;
    for (let p = 0; p < 4096; p++)
      difference += Math.abs(frames[i][p] - frames[i - 1][p]);
    if (difference / 4096 > 0.6) {
      hold(i);
      holdStart = i;
    }
  }
  hold(frames.length);
  if (darkStart !== null)
    warnings.push({
      code: "dark-frame",
      start: darkStart / 2,
      end: frames.length / 2,
      message:
        "거의 검은 마무리 화면이 있습니다. 의도한 종료인지 확인해주세요.",
    });
  return {
    version: "clip-temporal-v1",
    samplingFps: 2,
    sampledSeconds: frames.length / 2,
    scope:
      "최대 60초, 중앙 80% 화면을 2fps·64×64 밝기로 표집. 정밀 컷·자막·음성·제품 형태·성과는 검증하지 않음. 경고는 사람 검토용이며 자동 불합격 아님.",
    warnings,
  };
}

export async function reviewClipMotion(
  buffer: Buffer,
  run: (args: string[]) => Promise<void>,
  expectedMotion = false,
) {
  const folder = mkdtempSync(path.join(tmpdir(), "om-clip-review-"));
  try {
    const input = path.join(folder, "input.mp4"),
      output = path.join(folder, "frames.raw");
    writeFileSync(input, buffer);
    await run([
      "-y",
      "-i",
      input,
      "-t",
      "60",
      "-vf",
      "fps=2,crop=iw*0.8:ih*0.8,scale=64:64,format=gray",
      "-an",
      "-f",
      "rawvideo",
      output,
    ]);
    const raw = readFileSync(output);
    if (raw.length % 4096) throw Error("영상 프레임 길이를 확인해주세요.");
    const frames = Array.from({ length: raw.length / 4096 }, (_, i) =>
      raw.subarray(i * 4096, (i + 1) * 4096),
    );
    return assessClipFrames(frames, expectedMotion);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
