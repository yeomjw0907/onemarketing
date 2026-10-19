import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { decorateVideo, runFFmpeg, videoReviewFrame } from "../src/lib/video";
import { resolveTitleStyle, TITLE_STYLES } from "../src/lib/clip-layout";
import type { RecordData } from "../src/lib/types";
async function regionStats(
  file: string,
  region: { left: number; top: number; width: number; height: number },
) {
  const crop = await sharp(readFileSync(file)).extract(region).png().toBuffer();
  return sharp(crop).stats();
}
test("actual video editor renders Korean advertising disclosure and title styles without internal captions or a generation call", async () => {
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
    const stats = await regionStats(frame, {
      left: 80,
      top: 64,
      width: 560,
      height: 55,
    });
    assert.ok(stats.channels[0].stdev > 10, "광고 표시가 영상 위에 보여야 함");
    const title = await regionStats(frame, {
      left: 60,
      top: 140,
      width: 600,
      height: 160,
    });
    assert.ok(
      title.channels[0].stdev > 10,
      "끝 프레임에도 상단 제목이 유지되어야 함",
    );
    const cta = await regionStats(frame, {
      left: 80,
      top: 905,
      width: 560,
      height: 70,
    });
    assert.ok(
      cta.channels[0].stdev < 2,
      "기존 CTA가 있어도 영상 내부에 출력하지 않아야 함",
    );
    for (const [style, motion] of [
      ["clean", "none"],
      ["impact", "fade"],
      ["editorial", "fade"],
      ["pop", "slide"],
    ] as const) {
      (job.snapshot as any).mediaPlan.brief.edit = {
        title: "공감콜 소개",
        titleStyle: style,
        titleMotion: motion,
        hook: "",
        detail: "이전 자막",
        cta: "이전 CTA",
      };
      const styled = await decorateVideo(job, readFileSync(input));
      writeFileSync(output, styled);
      await runFFmpeg([
        "-y",
        "-ss",
        "2",
        "-i",
        output,
        "-frames:v",
        "1",
        frame,
      ]);
      const top = await regionStats(frame, {
        left: 60,
        top: 140,
        width: 600,
        height: 160,
      });
      assert.ok(
        top.channels[0].stdev > 10,
        style + " 제목이 등장 후에도 유지되어야 함",
      );
      const empty = await regionStats(frame, {
        left: 60,
        top: 880,
        width: 600,
        height: 160,
      });
      assert.ok(
        empty.channels[0].stdev < 2,
        "스타일과 무관하게 내부 자막은 출력하지 않아야 함",
      );
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("automatic style selection is stable per task and varies across tasks", () => {
  assert.equal(
    resolveTitleStyle("auto", "same-task").id,
    resolveTitleStyle("auto", "same-task").id,
  );
  assert.equal(resolveTitleStyle("editorial", "any-task").id, "editorial");
  assert.equal(
    new Set(
      Array.from(
        { length: 20 },
        (_, i) => resolveTitleStyle("auto", "task-" + i).id,
      ),
    ).size,
    TITLE_STYLES.length,
  );
});
