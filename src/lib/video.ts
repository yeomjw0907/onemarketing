import ffmpegStatic from "ffmpeg-static";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { list } from "./db";
import { localCopy, saveAsset } from "./assets";
import { jobInput } from "./jobs";
import type { RecordData } from "./types";
import { orderedImages } from "./copy-format";
import type { MediaBrief } from "./media-plans";
import { clipTextOverlay } from "./clip-template";
import { clipTitle, CLIP_TEMPLATE, resolveTitleStyle } from "./clip-layout";
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
export async function videoReviewFrame(buffer: Buffer, seconds: number) {
  const folder = mkdtempSync(path.join(tmpdir(), "om-review-"));
  try {
    const file = path.join(folder, "input.mp4"),
      frame = path.join(folder, "frame.png");
    writeFileSync(file, buffer);
    await runFFmpeg([
      "-y",
      "-ss",
      String(Math.max(0, seconds)),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=360:-2",
      frame,
    ]);
    return readFileSync(frame);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
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
    scale +
      ",zoompan=z='min(zoom+0.0002,1.025)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=25",
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
  return orderedImages(
    (await list("assets")).filter(
      (a) =>
        a.taskId === job.taskId && a.category === "image" && a.current === true,
    ),
    job.taskId,
  );
}
export async function decorateVideo(job: RecordData, buffer: Buffer) {
  const s = jobInput(job);
  const edit = (s.mediaPlan?.brief as MediaBrief | undefined)?.edit;

  const folder = mkdtempSync(path.join(tmpdir(), "om-caption-"));
  const duration = Number(s.task?.duration || 15);
  try {
    const input = path.join(folder, "input.mp4"),
      output = path.join(folder, "output.mp4");
    writeFileSync(input, buffer);
    const product = (
      s.project.knowledge as { product?: { name?: string } } | undefined
    )?.product?.name;
    const title = clipTitle(edit, product, s.task?.name);
    const style = resolveTitleStyle(
      edit?.titleStyle,
      String(s.task?.id || job.taskId || s.project.id || ""),
    );
    const motion =
      edit?.titleMotion && edit.titleMotion !== "auto"
        ? edit.titleMotion
        : style.motion;
    const overlays = [
      {
        text: "유료 광고",
        role: "disclosure" as const,
        y: 64,
        start: 0,
        end: duration,
      },
      {
        text: title,
        role: "title" as const,
        y: CLIP_TEMPLATE.titleY,
        start: 0,
        end: duration,
      },
    ];
    const inputs: string[] = [],
      filters: string[] = [`[0:v]${scale}[base]`];
    for (let i = 0; i < overlays.length; i++) {
      const o = overlays[i],
        file = path.join(folder, `${i}.png`);
      writeFileSync(file, await clipTextOverlay(o.text, o.role, style.id));
      inputs.push("-loop", "1", "-i", file);
      let layer = `${i + 1}:v`;
      if (o.role === "title" && motion === "fade") {
        filters.push(
          `[${layer}]format=rgba,fade=t=in:st=0:d=0.35:alpha=1[titleFade]`,
        );
        layer = "titleFade";
      }
      const y =
        o.role === "title" && motion === "slide"
          ? `${o.y}-16*max(0\\,1-t/0.35)`
          : String(o.y);
      filters.push(
        `[${i === 0 ? "base" : `v${i - 1}`}][${layer}]overlay=(W-w)/2:${y}:enable='gte(t,${o.start})*lt(t,${o.end})':shortest=1[v${i}]`,
      );
    }
    await runFFmpeg([
      "-y",
      "-i",
      input,
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      `[v${overlays.length - 1}]`,
      "-t",
      String(duration),
      "-an",
      "-r",
      "25",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      output,
    ]);
    return readFileSync(output);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
export async function slideshow(job: RecordData) {
  const { task } = jobInput(job);
  const images = await taskImages(job);
  if (images.length < Number(task?.images || 1))
    throw new Error("계약 수량의 이미지를 먼저 등록하세요.");
  const folder = mkdtempSync(path.join(tmpdir(), "om-video-"));
  try {
    const weights = images.map((_, i) =>
      i === 0 ? 1.3 : i === images.length - 1 ? 1.2 : 1,
    );
    const total = weights.reduce((s, v) => s + v, 0);
    const clips: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const file = path.join(folder, `${i}.mp4`);
      await stillClip(
        await localCopy(images[i], folder),
        (Number(task?.duration || 15) * weights[i]) / total,
        file,
      );
      clips.push(file);
    }
    const buffer = await decorateVideo(job, await concat(folder, clips));
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
    const buffer = await decorateVideo(job, await concat(folder, clips));
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
