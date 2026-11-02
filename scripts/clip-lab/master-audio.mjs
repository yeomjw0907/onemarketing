import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegStatic from "ffmpeg-static";
export function loudnessStats(log) {
  const block = [...log.matchAll(/\{[^{}]*"input_i"[^{}]*\}/g)].at(-1)?.[0];
  if (!block) throw new Error("No loudness measurements");
  const stats = JSON.parse(block);
  for (const k of [
    "input_i",
    "input_tp",
    "input_lra",
    "input_thresh",
    "target_offset",
  ])
    if (!Number.isFinite(Number(stats[k])))
      throw new Error("Audio is silent or measurement is invalid");
  return stats;
}
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let log = "";
    child.stderr.on("data", (d) => (log = (log + d).slice(-1e6)));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Audio processing timed out"));
    }, 300000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(log)
        : reject(
            new Error("Audio processing failed; original file was preserved"),
          );
    });
  });
}
export async function masterAudio(
  input,
  output,
  { executable = process.env.FFMPEG_PATH || ffmpegStatic } = {},
) {
  if (path.resolve(input) === path.resolve(output))
    throw new Error("Use a separate output file");
  const first = loudnessStats(
    await run(executable, [
      "-hide_banner",
      "-i",
      input,
      "-vn",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ]),
  );
  const filter = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}:offset=${first.target_offset}:linear=true:print_format=json`;
  await run(executable, [
    "-hide_banner",
    "-n",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c:v",
    "copy",
    "-af",
    filter,
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-movflags",
    "+faststart",
    output,
  ]);
  const after = loudnessStats(
    await run(executable, [
      "-hide_banner",
      "-i",
      output,
      "-vn",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ]),
  );
  const report = {
    version: "clip-audio-master-v1",
    targetLufs: -16,
    targetTruePeakDbtp: -1.5,
    videoReencoded: false,
    before: {
      integratedLufs: Number(first.input_i),
      truePeakDbtp: Number(first.input_tp),
    },
    after: {
      integratedLufs: Number(after.input_i),
      truePeakDbtp: Number(after.input_tp),
    },
    humanListening: false,
  };
  await writeFile(output + ".audio.json", JSON.stringify(report, null, 2));
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (!process.argv[3])
    throw new Error("Usage: master-audio.mjs input.mp4 output.mp4");
  console.log(
    JSON.stringify(
      await masterAudio(
        path.resolve(process.argv[2]),
        path.resolve(process.argv[3]),
      ),
    ),
  );
}
