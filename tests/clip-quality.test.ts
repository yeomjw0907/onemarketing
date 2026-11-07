import { test } from "node:test";
import assert from "node:assert/strict";
import { assessClipFrames, reviewClipMotion } from "../src/lib/clip-quality";
import { runFFmpeg } from "../src/lib/video";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const frame = (v: number) => new Uint8Array(4096).fill(v);

test("long static holds are advisory only when motion was expected, changing shots do not accumulate holds", () => {
  const still = Array.from({ length: 16 }, () => frame(100));
  assert.equal(assessClipFrames(still).warnings.length, 0);
  assert.equal(assessClipFrames(still, true).warnings[0].code, "long-hold");
  assert.deepEqual(
    assessClipFrames(
      Array.from({ length: 16 }, (_, i) => frame(i % 2 ? 100 : 130)),
      true,
    ).warnings,
    [],
  );
  const cut = [
    ...still.slice(0, 7),
    ...still.slice(0, 7).map(() => frame(150)),
  ];
  assert.equal(assessClipFrames(cut, true).warnings.length, 0);
});
test("black intervals retain timestamps and malformed sample buffers are rejected", () => {
  const r = assessClipFrames([frame(100), frame(0), frame(0), frame(100)]);
  assert.deepEqual(
    r.warnings.map((w) => [w.code, w.start, w.end]),
    [["dark-frame", 0.5, 1.5]],
  );
  assert.throws(() => assessClipFrames([new Uint8Array(4)]));
});
test("real video decoding distinguishes a frozen generated shot from visible movement", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "clip-quality-test-"));
  try {
    const reports = [];
    for (const [name, input] of [
      ["still", "color=c=gray:s=128x128:r=10:d=7"],
      ["motion", "testsrc2=s=128x128:r=10:d=7"],
    ]) {
      const file = path.join(root, name + ".mp4");
      await runFFmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        input,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        file,
      ]);
      reports.push(await reviewClipMotion(readFileSync(file), runFFmpeg, true));
    }
    assert.ok(reports[0].warnings.some((w) => w.code === "long-hold"));
    assert.ok(!reports[1].warnings.some((w) => w.code === "long-hold"));
    assert.equal(reports[0].sampledSeconds, 7);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
