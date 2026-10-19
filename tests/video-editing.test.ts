import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { decorateVideo, runFFmpeg, videoReviewFrame } from "../src/lib/video";
import type { RecordData } from "../src/lib/types";
test("actual video editor renders Korean advertising disclosure and approved CTA without a generation call", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "edit-test-"));
  try {
    const input = path.join(folder, "input.mp4"),
      output = path.join(folder, "output.mp4"),
      frame = path.join(folder, "frame.png");
    await runFFmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=720x1280:r=25:d=4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      input,
    ]);
    const job = {
      snapshot: {
        task: { duration: 4 },
        project: { knowledge: { customer: {}, product: {} } },
        sourceAssets: [],
        mediaPlan: {
          brief: {
            edit: { hook: "제품 소개", detail: "확인된 특징", cta: "상담하기" },
          },
        },
      },
    } as unknown as RecordData;
    const result = await decorateVideo(job, readFileSync(input));
    writeFileSync(output, result);
    const review = await videoReviewFrame(result, 2);
    assert.equal((await sharp(review).metadata()).width, 360);
    await runFFmpeg([
      "-y",
      "-ss",
      "3.5",
      "-i",
      output,
      "-frames:v",
      "1",
      frame,
    ]);
    const stats = await sharp(frame)
      .extract({ left: 80, top: 95, width: 560, height: 70 })
      .stats();
    assert.ok(
      stats.channels[0].stdev > 10,
      "광고 표시의 배경과 글자가 보여야 함",
    );
    const cta = await sharp(frame)
      .extract({ left: 80, top: 905, width: 560, height: 70 })
      .stats();
    assert.ok(cta.channels[0].stdev > 10, "CTA가 보여야 함");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
