import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "../src/lib/db";
import { bytes, saveAsset } from "../src/lib/assets";
import { runFFmpeg } from "../src/lib/video";

test("final video storage preserves output bytes, attaches advisory review, and records decoder failures as unavailable", async () => {
  const project = await create("projects", {
    name: "영상 검토 통합 시험",
    status: "producing",
  });
  const task = await create("tasks", {
    projectId: project.id,
    channel: "clip",
    brief: "고정 구도",
    briefApprovedAt: "2026-11-08T00:00:00Z",
    status: "planned",
  });
  const job = await create("jobs", {
    projectId: project.id,
    taskId: task.id,
    type: "scene-render",
    status: "running",
    snapshot: { task },
  });
  const root = mkdtempSync(path.join(tmpdir(), "clip-storage-"));
  try {
    const file = path.join(root, "hold.mp4");
    await runFFmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=gray:s=128x128:r=10:d=7",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
    const buffer = readFileSync(file);
    const asset = await saveAsset(
      {
        projectId: project.id,
        taskId: task.id,
        jobId: job.id,
        category: "video",
        name: "hold.mp4",
        buffer,
      },
      "qa",
    );
    assert.deepEqual(await bytes(asset), buffer);
    const report = asset.editingQuality as { warnings: { code: string }[] };
    assert.ok(report.warnings.some((w) => w.code === "long-hold"));
    const damaged = Buffer.from("00000018667479706d70343200000000", "hex");
    const recovered = await saveAsset(
      {
        projectId: project.id,
        taskId: task.id,
        jobId: job.id,
        category: "video",
        name: "provider-result.mp4",
        buffer: damaged,
      },
      "qa",
    );
    assert.deepEqual(recovered.editingQuality, { status: "unavailable" });
    assert.deepEqual(await bytes(recovered), damaged);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
