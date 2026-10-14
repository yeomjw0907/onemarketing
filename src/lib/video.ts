import ffmpegStatic from "ffmpeg-static";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { list } from "./db";
import { localCopy, saveAsset } from "./assets";
import { jobInput } from "./jobs";
import type { RecordData } from "./types";
export function runFFmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.FFMPEG_PATH && process.env.FFMPEG_PATH !== "ffmpeg"
        ? process.env.FFMPEG_PATH
        : ffmpegStatic || "ffmpeg",
      args,
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let error = "";
    child.stderr.on("data", (d) => {
      error = (error + String(d)).slice(-3000);
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("영상 편집 시간이 초과되었습니다."));
    }, 300000);
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("ffmpeg를 실행할 수 없습니다. 설치 경로를 확인하세요."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve()
        : reject(
            new Error(
              "영상 편집에 실패했습니다. 이미지 형식과 길이를 확인하세요.",
            ),
          );
    });
  });
}
const scale =
  "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1";
async function stillClip(image: string, seconds: number, file: string) {
  await runFFmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    image,
    "-t",
    String(seconds),
    "-vf",
    scale,
    "-r",
    "25",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
}
async function concat(folder: string, clips: string[]) {
  const manifest = path.join(folder, "clips.txt");
  writeFileSync(
    manifest,
    clips.map((f) => `file '${f.replaceAll("\\", "/")}'`).join("\n"),
  );
  const output = path.join(folder, "output.mp4");
  await runFFmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifest,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ]);
  return readFileSync(output);
}
async function taskImages(job: RecordData) {
  return (await list("assets")).filter(
    (a) =>
      a.taskId === job.taskId && a.category === "image" && a.current === true,
  );
}
export async function slideshow(job: RecordData) {
  const { task } = jobInput(job);
  const images = await taskImages(job);
  if (images.length < Number(task?.images || 1))
    throw new Error("계약 수량의 이미지를 먼저 등록하세요.");
  const folder = mkdtempSync(path.join(tmpdir(), "om-video-"));
  try {
    const per = Number(task?.duration || 15) / images.length;
    const clips: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const file = path.join(folder, `${i}.mp4`);
      await stillClip(await localCopy(images[i], folder), per, file);
      clips.push(file);
    }
    const buffer = await concat(folder, clips);
    await saveAsset(
      {
        projectId: String(job.projectId),
        taskId: String(job.taskId),
        category: "video",
        name: "슬라이드-클립.mp4",
        buffer,
        jobId: job.id,
      },
      String(job.actor),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
export async function hybrid(
  job: RecordData,
  scene: Buffer,
  sceneSeconds: number,
) {
  const { task } = jobInput(job);
  const images = await taskImages(job);
  if (!images.length) throw new Error("혼합형에 사용할 이미지를 등록하세요.");
  const folder = mkdtempSync(path.join(tmpdir(), "om-hybrid-"));
  try {
    const original = path.join(folder, "scene.mp4"),
      normalized = path.join(folder, "0.mp4");
    writeFileSync(original, scene);
    await runFFmpeg([
      "-y",
      "-i",
      original,
      "-t",
      String(sceneSeconds),
      "-an",
      "-vf",
      scale,
      "-r",
      "25",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      normalized,
    ]);
    const clips = [normalized];
    const per =
      Math.max(1, Number(task?.duration || 15) - sceneSeconds) / images.length;
    for (let i = 0; i < images.length; i++) {
      const file = path.join(folder, `${i + 1}.mp4`);
      await stillClip(await localCopy(images[i], folder), per, file);
      clips.push(file);
    }
    const buffer = await concat(folder, clips);
    await saveAsset(
      {
        projectId: String(job.projectId),
        taskId: String(job.taskId),
        category: "video",
        name: "혼합형-클립.mp4",
        buffer,
        jobId: job.id,
      },
      String(job.actor),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
